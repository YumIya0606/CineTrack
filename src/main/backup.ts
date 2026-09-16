import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { getDataDir, getDbPath, getRaw, reopenDatabase } from './db'
import { dialog } from 'electron'
import { join } from 'path'

const MAGIC = 'CINEBACK'
const SALT_LEN = 16
const IV_LEN = 12
const KEY_LEN = 32

interface BackupIndex {
  magic: string
  version: number
  createdAt: string
  size: number
}

/**
 * Exports the whole library as an AES-256-GCM encrypted file. Everything is
 * derived from a passphrase the user keeps, so the backup is safe to store
 * anywhere (Drive, OneDrive, a USB stick).
 */
export async function exportBackup(passphrase: string): Promise<{ path: string; size: number }> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters')
  }

  const result = await dialog.showSaveDialog({
    title: 'Export CineTrack backup',
    defaultPath: `cinetrack-backup-${new Date().toISOString().slice(0, 10)}.cbk`,
    filters: [{ name: 'CineTrack backup', extensions: ['cbk'] }]
  })
  if (result.canceled || !result.filePath) throw new Error('Backup cancelled')

  // A consistent snapshot: read the live DB file directly.
  const data = readFileSync(getDbPath())
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = scryptSync(passphrase, salt, KEY_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()

  const index: BackupIndex = {
    magic: MAGIC,
    version: 1,
    createdAt: new Date().toISOString(),
    size: data.length
  }

  // Layout: magic(8) | version(1) | salt(16) | iv(12) | tag(16) | headerLen(4) | header | payload
  const header = Buffer.from(JSON.stringify(index), 'utf8')
  const out = Buffer.concat([
    Buffer.from(MAGIC, 'utf8'),
    Buffer.from([1]),
    salt,
    iv,
    tag,
    Buffer.from(header.byteLength.toString().padStart(8, '0'), 'utf8'),
    header,
    enc
  ])
  writeFileSync(result.filePath, out)
  return { path: result.filePath, size: out.length }
}

/**
 * Restores a .cbk backup. Replaces the current library after verifying the
 * passphrase, so a wrong key never corrupts anything.
 */
export async function importBackup(passphrase: string): Promise<{ size: number }> {
  if (!passphrase) throw new Error('A passphrase is required')

  const result = await dialog.showOpenDialog({
    title: 'Restore CineTrack backup',
    filters: [{ name: 'CineTrack backup', extensions: ['cbk'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) throw new Error('Restore cancelled')

  const file = readFileSync(result.filePaths[0])
  if (file.length < 8 + 1 + SALT_LEN + IV_LEN + 16 + 8) {
    throw new Error('This file is not a CineTrack backup')
  }
  if (file.subarray(0, 8).toString('utf8') !== MAGIC) {
    throw new Error('Invalid backup file')
  }

  let off = 8 + 1
  const salt = file.subarray(off, (off += SALT_LEN))
  const iv = file.subarray(off, (off += IV_LEN))
  const tag = file.subarray(off, (off += 16))
  const headerLen = Number(file.subarray(off, (off += 8)).toString('utf8'))
  const header = JSON.parse(file.subarray(off, (off += headerLen)).toString('utf8')) as BackupIndex
  const enc = file.subarray(off)

  const key = scryptSync(passphrase, salt, KEY_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(enc), decipher.final()])
  } catch {
    throw new Error('Wrong passphrase — could not decrypt this backup')
  }
  if (plain.length !== header.size) throw new Error('Backup payload is corrupt')

  // Close the live connection, swap the file, then re-open so the app keeps
  // running against the restored data without a restart.
  try {
    getRaw().close()
  } catch {
    /* already closed */
  }
  writeFileSync(getDbPath(), plain)
  reopenDatabase()
  return { size: plain.length }
}

/** Where backups and the library live, surfaced in Settings. */
export function getBackupInfo(): { dataDir: string; dbPath: string } {
  return { dataDir: getDataDir(), dbPath: join(getDataDir(), 'cinetrack.db') }
}

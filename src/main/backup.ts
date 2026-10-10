import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  statSync
} from 'fs'
import { getDataDir, getDbPath, getRaw, reopenDatabase } from './db'
import { dialog, safeStorage } from 'electron'
import { join } from 'path'
import { getSetting, setSetting } from './db/queries'
import type { BackupStatus } from '@shared/types'

const MAGIC = 'CINEBACK'
const SALT_LEN = 16
const IV_LEN = 12
const KEY_LEN = 32

/** Setting keys for the automatic, folder-based backup. */
const FOLDER_KEY = 'backup.folder'
const ON_EXIT_KEY = 'backup.onExit'
const LAST_AUTO_KEY = 'backup.lastAuto'
const PASS_KEY = 'backup.passphrase'
/** Keep this many rolling daily snapshots; older ones are pruned. */
const MAX_SNAPSHOTS = 14

interface BackupIndex {
  magic: string
  version: number
  createdAt: string
  size: number
}

/**
 * The passphrase for automatic backups is held in the OS credential store —
 * `safeStorage` on Windows is DPAPI-encrypted, so it can only be read back by
 * this user on this machine. The .cbk file itself stays AES-encrypted, so a
 * copy parked on Google Drive is unreadable without the passphrase either.
 */
function storePassphrase(passphrase: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is unavailable')
  const enc = safeStorage.encryptString(passphrase)
  setSetting(PASS_KEY, enc.toString('base64'))
}

function loadPassphrase(): string | null {
  const b64 = getSetting<string>(PASS_KEY)
  if (!b64) return null
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

function backupFileName(d = new Date()): string {
  return `cinetrack-backup-${d.toISOString().slice(0, 10)}.cbk`
}

/**
 * Encrypts the live database to a buffer. Kept synchronous on purpose: the
 * on-exit backup runs inside Electron's blocking `before-quit` window, and
 * scrypt + AES are both fast enough to finish there.
 */
function encryptBackup(passphrase: string): Buffer {
  // The DB runs in WAL mode, so the freshest pages can still live in the -wal
  // sidecar instead of the main file. Force a checkpoint before reading or the
  // snapshot silently drops the most recent adds.
  try {
    getRaw().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* a closed handle (mid-restore) is not a backup-stopper */
  }
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
  return Buffer.concat([
    Buffer.from(MAGIC, 'utf8'),
    Buffer.from([1]),
    salt,
    iv,
    tag,
    Buffer.from(header.byteLength.toString().padStart(8, '0'), 'utf8'),
    header,
    enc
  ])
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

  const out = encryptBackup(passphrase)
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

  // Never destroy the current library on a failed restore. Keep a copy of the
  // live file first so there is always a way back, then swap in a way that
  // cannot leave the app holding a closed handle on a truncated file.
  const dbPath = getDbPath()
  const safety = `${dbPath}.pre-restore-${Date.now()}`
  try {
    copyFileSync(dbPath, safety)
  } catch {
    /* no safety copy is still better than a guaranteed wipe — carry on */
  }

  try {
    // Close the live connection, swap the file, then re-open so the app keeps
    // running against the restored data without a restart. close() throws if a
    // statement is still iterating; treat that as fatal instead of writing
    // over a file SQLite still has open.
    getRaw().close()
  } catch (err) {
    throw new Error(`Could not close the library for restore: ${(err as Error).message}`)
  }

  try {
    writeFileSync(dbPath, plain)
  } catch (err) {
    // writeFileSync truncates before writing — on failure the file is now
    // partial. Put the safety copy back and re-open so the app survives.
    try {
      copyFileSync(safety, dbPath)
    } catch {
      /* nothing more we can do; the caller shows the error */
    }
    reopenDatabase()
    throw new Error(`Could not write the restored library: ${(err as Error).message}`)
  }

  reopenDatabase()
  return { size: plain.length }
}

/** Where backups and the library live, surfaced in Settings. */
export function getBackupInfo(): { dataDir: string; dbPath: string } {
  return { dataDir: getDataDir(), dbPath: join(getDataDir(), 'cinetrack.db') }
}

/**
 * Picks the folder automatic backups land in. Pointing this at a Google Drive,
 * OneDrive, or iCloud desktop-sync folder is the "connect it to Drive" path —
 * the encrypted file is uploaded by the sync client, no account wiring needed.
 */
export async function chooseBackupFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose where backups are stored',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const folder = result.filePaths[0]
  setSetting(FOLDER_KEY, folder)
  return folder
}

/** Reads the auto-backup configuration. */
export function getBackupStatus(): BackupStatus {
  return {
    folder: getSetting<string>(FOLDER_KEY),
    onExit: getSetting<boolean>(ON_EXIT_KEY) === true,
    lastAuto: getSetting<string>(LAST_AUTO_KEY)
  }
}

export function setBackupOnExit(on: boolean): void {
  setSetting(ON_EXIT_KEY, on)
}

/**
 * Writes an encrypted snapshot to the configured folder and remembers the
 * passphrase (OS-encrypted) so subsequent runs — including the on-exit one —
 * stay unattended.
 */
export function runAutoBackup(passphrase: string, folder: string): { path: string; size: number } {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters')
  }
  if (!folder || !existsSync(folder)) {
    throw new Error('Backup folder is missing — pick it again in Settings')
  }

  const out = encryptBackup(passphrase)
  const path = join(folder, backupFileName())
  writeFileSync(path, out)

  storePassphrase(passphrase)
  setSetting(LAST_AUTO_KEY, new Date().toISOString())
  pruneSnapshots(folder)
  return { path, size: out.length }
}

/** Keeps only the newest snapshots so a sync folder can't fill up over months. */
function pruneSnapshots(folder: string): void {
  let files: string[] = []
  try {
    files = readdirSync(folder).filter(f => /^cinetrack-backup-\d{4}-\d{2}-\d{2}\.cbk$/.test(f))
  } catch {
    return
  }
  if (files.length <= MAX_SNAPSHOTS) return

  const sorted = files
    .map(f => ({ f, mtime: statSync(join(folder, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const { f } of sorted.slice(MAX_SNAPSHOTS)) {
    try {
      unlinkSync(join(folder, f))
    } catch {
      /* a file the sync client already moved is not a failure */
    }
  }
}

/**
 * Unattended backup for the on-exit hook. No dialogs, no errors thrown — a
 * failed silent backup must never block quitting.
 */
export function autoBackupOnQuit(): void {
  if (!getBackupStatus().onExit) return
  const folder = getSetting<string>(FOLDER_KEY)
  const passphrase = loadPassphrase()
  if (!folder || !passphrase) return
  try {
    runAutoBackup(passphrase, folder)
  } catch (err) {
    console.error('[backup] automatic on-exit backup failed:', err)
  }
}

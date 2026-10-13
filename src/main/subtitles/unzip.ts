import { inflateRawSync } from 'zlib'

/**
 * Minimal ZIP reader, just enough for subtitle packs.
 *
 * Why this exists: SubDL's best coverage for a series is often a full-season
 * pack — one ZIP containing every episode's .srt. Our overlay needs a single
 * episode's cues, so somebody has to open the archive and pick the right file.
 * Adding a dependency for that would be heavier than the ~70 lines below.
 *
 * Handles stored (method 0) and deflate (method 8), which is everything
 * subtitle archives use in practice.
 */

export interface ZipEntry {
  name: string
  data: Buffer
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

/** True if the buffer starts with a local file header or an empty-archive EOCD. */
export function looksLikeZip(buf: Buffer): boolean {
  if (buf.length < 4) return false
  const sig = buf.readUInt32LE(0)
  if (sig === 0x04034b50) return true
  // An archive with zero entries is just the EOCD record.
  if (buf.length >= 22 && buf.readUInt32LE(buf.length - 22) === EOCD_SIG) return true
  return false
}

export function unzip(buf: Buffer): ZipEntry[] {
  if (buf.length < 22) throw new Error('Not a zip archive (too small)')

  // The End Of Central Directory sits at the very end, but a trailing comment
  // can push it back, so scan backwards for its signature.
  let eocd = -1
  const floor = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('Not a zip archive (no central directory)')

  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CEN_SIG) break
    const method = buf.readUInt16LE(ptr + 10)
    const compressedSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)
    ptr += 46 + nameLen + extraLen + commentLen

    // Skip directory entries.
    if (name.endsWith('/')) continue

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      continue
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = buf.subarray(dataStart, dataStart + compressedSize)

    try {
      if (method === 0) entries.push({ name, data: Buffer.from(raw) })
      else if (method === 8) entries.push({ name, data: inflateRawSync(raw) })
      // Other methods (bzip2, xz, LZMA) don't appear in subtitle packs.
    } catch {
      /* a corrupt entry shouldn't sink the whole archive */
    }
  }

  if (!entries.length) throw new Error('Zip archive contained no readable files')
  return entries
}

/**
 * Picks the file for one episode out of a season pack.
 *
 * Episode identity is matched on a few conventions at once because real packs
 * are inconsistent: "S01E02", "1x02", "102", and bare episode numbers all turn
 * up, sometimes with no season mentioned at all.
 */
export function pickEpisodeEntry(
  entries: ZipEntry[],
  season: number | null | undefined,
  episode: number | null | undefined
): ZipEntry {
  if (entries.length === 1) return entries[0]!
  if (episode == null) return entries[0]!

  const s = season ?? 1
  const e = episode
  const score = (name: string) => {
    const base = name.split(/[/\\]/).pop() ?? name
    if (/\.(ass|ssa)$/i.test(base)) return 0
    if (!/\.(srt|vtt|sub|smi|sami)$/i.test(base)) return 0
    const norm = base.toLowerCase().replace(/[^a-z0-9x]/g, '-')
    const three = String(e).padStart(3, '0')
    const two = String(e).padStart(2, '0')
    if (new RegExp(`s0*${s}e0*${e}\\b`).test(norm)) return 100
    if (new RegExp(`s0*${s}[ ._-]e0*${e}\\b`).test(norm)) return 100
    if (new RegExp(`0*${s}x0*${e}\\b`).test(norm)) return 95
    if (new RegExp(`\\b0*${s}0*${two}\\b`).test(norm)) return 80
    if (new RegExp(`\\b0*${three}\\b`).test(norm)) return 60
    if (new RegExp(`\\be0*${e}\\b`).test(norm)) return 50
    // Last resort: a bare "e02"/"ep2".
    if (new RegExp(`\\b(?:e|ep)0*${e}\\b`).test(norm)) return 45
    return 0
  }

  let best: { entry: ZipEntry; score: number } | null = null
  for (const entry of entries) {
    const sc = score(entry.name)
    if (sc > 0 && (!best || sc > best.score)) best = { entry, score: sc }
  }
  if (!best) throw new Error('No file for that episode inside the season pack')
  return best.entry
}
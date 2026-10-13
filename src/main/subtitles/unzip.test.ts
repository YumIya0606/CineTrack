import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'zlib'
import { unzip, looksLikeZip, pickEpisodeEntry } from './unzip'

/*
 * Season packs are one archive holding every episode, so picking the wrong
 * file is silent — the user just gets subtitles from a different episode. These
 * tests cover the naming conventions real packs actually use.
 */

/** Builds a real (deflate) zip so the reader is exercised end to end. */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const raw = Buffer.from(content, 'utf8')
    const deflated = deflateRawSync(raw)
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(deflated.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, deflated)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(deflated.length, 20)
    cen.writeUInt32LE(raw.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)

    offset += local.length + nameBuf.length + deflated.length
  }

  const localPart = Buffer.concat(locals)
  const centralPart = Buffer.concat(central)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(centralPart.length, 12)
  eocd.writeUInt32LE(localPart.length, 16)

  return Buffer.concat([localPart, centralPart, eocd])
}

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

describe('unzip', () => {
  it('reads a deflate archive', () => {
    const zip = makeZip({ 'a.srt': 'one', 'b.srt': 'two' })
    const entries = unzip(zip)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.data.toString()).sort()).toEqual(['one', 'two'])
  })

  it('handles nested paths and skips directory entries', () => {
    const zip = makeZip({ 'Show/Season 1/e01.srt': 'ep1', 'Show/Season 1/e02.srt': 'ep2' })
    const entries = unzip(zip)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.name)).toContain('Show/Season 1/e02.srt')
  })

  it('rejects non-zip input rather than returning nonsense', () => {
    expect(() => unzip(Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi'))).toThrow()
  })

  it('detects zip magic', () => {
    expect(looksLikeZip(makeZip({ 'a.srt': 'x' }))).toBe(true)
    expect(looksLikeZip(Buffer.from('WEBVTT'))).toBe(false)
    expect(looksLikeZip(Buffer.from(''))).toBe(false)
  })
})

describe('pickEpisodeEntry', () => {
  const pack = {
    'Show.S01E01.srt': 'ep1',
    'Show.S01E02.srt': 'ep2',
    'Show.S01E03.srt': 'ep3',
    'Readme.txt': 'notes'
  }

  it('matches S01E02 style', () => {
    const e = pickEpisodeEntry(unzip(makeZip(pack)), 1, 2)
    expect(e.name).toBe('Show.S01E02.srt')
    expect(e.data.toString()).toBe('ep2')
  })

  it('matches 1x02 style', () => {
    const files = { 'Show.1x02.srt': 'ep2', 'Show.1x03.srt': 'ep3' }
    expect(pickEpisodeEntry(unzip(makeZip(files)), 1, 2).name).toBe('Show.1x02.srt')
  })

  it('matches a bare 102 numeric filename', () => {
    const files = { '102.srt': 'ep2', '103.srt': 'ep3' }
    expect(pickEpisodeEntry(unzip(makeZip(files)), 1, 2).name).toBe('102.srt')
  })

  it('does not confuse episode 2 with episode 12', () => {
    // The real hazard: a naive substring match sends the user to the wrong
    // episode entirely, and nothing reports an error.
    const files = { 'Show.S01E02.srt': 'ep2', 'Show.S01E12.srt': 'ep12' }
    expect(pickEpisodeEntry(unzip(makeZip(files)), 1, 2).name).toBe('Show.S01E02.srt')
    expect(pickEpisodeEntry(unzip(makeZip(files)), 1, 12).name).toBe('Show.S01E12.srt')
  })

  it('distinguishes season 1 from season 2', () => {
    const files = { 'Show.S01E05.srt': 's1e5', 'Show.S02E05.srt': 's2e5' }
    expect(pickEpisodeEntry(unzip(makeZip(files)), 2, 5).data.toString()).toBe('s2e5')
  })

  it('ignores non-subtitle files when a real one is present', () => {
    const e = pickEpisodeEntry(unzip(makeZip(pack)), 1, 3)
    expect(e.name).toBe('Show.S01E03.srt')
  })

  it('prefers srt over ass for the same episode', () => {
    const files = { 'Show.S01E04.ass': 'styled', 'Show.S01E04.srt': 'plain' }
    expect(pickEpisodeEntry(unzip(makeZip(files)), 1, 4).data.toString()).toBe('plain')
  })

  it('throws when the pack genuinely lacks the episode', () => {
    // Better to say so than to silently play episode 1's subtitles.
    expect(() => pickEpisodeEntry(unzip(makeZip(pack)), 2, 9)).toThrow()
  })

  it('takes the only file when the archive has one', () => {
    const e = pickEpisodeEntry(unzip(makeZip({ 'Movie.srt': 'whole film' })), 1, 1)
    expect(e.data.toString()).toBe('whole film')
  })
})
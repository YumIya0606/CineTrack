import { describe, it, expect } from 'vitest'
import { parseSubtitles } from './parse'

/*
 * The parser is the piece most likely to silently break: a malformed cue means
 * subtitles that simply never appear, with no error. These cover the real
 * shapes SRT and WebVTT show up in from the providers.
 */

const SRT = `1
00:00:20,000 --> 00:00:23,400
Wake up, Neo...

2
00:00:24,100 --> 00:00:27,000
The Matrix has you.
Follow the white rabbit.`

describe('parseSubtitles — SRT', () => {
  it('extracts timing and text', () => {
    const cues = parseSubtitles(SRT)
    expect(cues).toHaveLength(2)
    expect(cues[0]!.start).toBeCloseTo(20, 3)
    expect(cues[0]!.end).toBeCloseTo(23.4, 3)
    expect(cues[0]!.text).toBe('Wake up, Neo...')
    expect(cues[1]!.text).toBe('The Matrix has you.\nFollow the white rabbit.')
  })

  it('sorts cues by start time even when the file is out of order', () => {
    const shuffled = `1
00:01:00,000 --> 00:01:02,000
Second

2
00:00:10,000 --> 00:00:12,000
First`
    const cues = parseSubtitles(shuffled)
    expect(cues.map(c => c.text)).toEqual(['First', 'Second'])
  })

  it('handles a leading UTF-8 BOM and CRLF line endings', () => {
    const withBom = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n'
    const cues = parseSubtitles(withBom)
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('Hello')
  })

  it('guarantees end is after start even for zero-length cues', () => {
    const cues = parseSubtitles('1\n00:00:05,000 --> 00:00:05,000\nBlink')
    expect(cues[0]!.end).toBeGreaterThan(cues[0]!.start)
  })
})

describe('parseSubtitles — WebVTT', () => {
  it('skips the WEBVTT header and parses dot-separated milliseconds', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
First line

00:00:05.500 --> 00:00:08.250 position:50%
Second line`
    const cues = parseSubtitles(vtt)
    expect(cues).toHaveLength(2)
    expect(cues[0]!.start).toBeCloseTo(1, 3)
    expect(cues[1]!.start).toBeCloseTo(5.5, 3)
    expect(cues[1]!.end).toBeCloseTo(8.25, 3)
    // Cue settings after the timestamp must not leak into the text.
    expect(cues[1]!.text).toBe('Second line')
  })

  it('ignores NOTE and STYLE blocks that carry no timing', () => {
    const vtt = `WEBVTT

NOTE this is a comment

STYLE
::cue { color: yellow }

00:00:02.000 --> 00:00:03.000
Real cue`
    const cues = parseSubtitles(vtt)
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('Real cue')
  })
})

describe('parseSubtitles — markup', () => {
  it('strips inline tags and preserves the words', () => {
    const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\n<i>Hello</i> <b>there</b>')
    expect(cues[0]!.text).toBe('Hello there')
  })

  it('drops cues that become empty after stripping', () => {
    const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\n<font color="#fff"></font>')
    expect(cues).toHaveLength(0)
  })

  it('tolerates missing hours in the timestamp', () => {
    const cues = parseSubtitles('1\n00:45:00,000 --> 00:46:00,000\nForty five minutes in')
    expect(cues[0]!.start).toBeCloseTo(2700, 3)
  })
})

describe('parseSubtitles — degenerate input', () => {
  it('returns an empty list for empty or junk input', () => {
    expect(parseSubtitles('')).toEqual([])
    expect(parseSubtitles('not a subtitle file at all')).toEqual([])
    expect(parseSubtitles('\n\n\n')).toEqual([])
  })

  it('skips blocks with a timing line but no text', () => {
    const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nReal')
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('Real')
  })
})
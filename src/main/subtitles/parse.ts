/**
 * Pure subtitle parsing. Deliberately free of any database, filesystem or
 * electron import so it can be unit-tested in isolation and reasoned about
 * without the rest of the app.
 */

export interface SubtitleCue {
  /** Seconds from the start of the file. */
  start: number
  end: number
  text: string
}

/** Accepts SRT (`00:00:01,000`) and WebVTT (`00:00:01.000`). */
const TIME_RE =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

function stripMarkup(line: string): string {
  return line
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/^\s*[-*]\s*/, '')
    .trim()
}

/**
 * Parses SRT and WebVTT into a common cue shape.
 *
 * The two formats differ only in the header, cue-settings after the timestamp
 * and the millisecond separator, so one parser handles both. Blocks with no
 * timing line (WEBVTT header, NOTE, STYLE) and cues that end up empty after
 * stripping markup are dropped — a cue with no text would render as a blank
 * bar over the video.
 */
export function parseSubtitles(raw: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  // Strip a UTF-8 BOM (some subtitle files carry one) and normalise CRLF.
  const blocks = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/)

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '')
    if (!lines.length) continue

    const timeIndex = lines.findIndex(l => TIME_RE.test(l))
    if (timeIndex === -1) continue

    const match = TIME_RE.exec(lines[timeIndex]!)
    if (!match) continue

    const start = toSeconds(match[1]!, match[2]!, match[3]!, match[4]!)
    const end = toSeconds(match[5]!, match[6]!, match[7]!, match[8]!)

    const text = lines
      .slice(timeIndex + 1)
      .map(stripMarkup)
      .filter(Boolean)
      .join('\n')

    if (text) cues.push({ start, end: Math.max(end, start + 0.4), text })
  }

  return cues.sort((a, b) => a.start - b.start)
}

/**
 * Converts SRT to WebVTT. Useful if we ever move to a native <track>; today the
 * overlay renders cues directly, but keeping this tested means the migration is
 * a one-liner rather than a rewrite.
 */
export function toWebVtt(cues: SubtitleCue[]): string {
  const stamp = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`
  }
  const body = cues
    .map(c => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`)
    .join('\n\n')
  return `WEBVTT\n\n${body}\n`
}
export const posterUrl = (
  posterPath: string | null,
  size: 'w185' | 'w342' | 'w500' | 'original' = 'w342'
): string | null => {
  if (!posterPath) return null
  return `https://image.tmdb.org/t/p/${size}${posterPath}`
}

export const backdropUrl = (
  backdropPath: string | null,
  size: 'w780' | 'w1280' | 'original' = 'w1280'
): string | null => {
  if (!backdropPath) return null
  return `https://image.tmdb.org/t/p/${size}${backdropPath}`
}

export const ytmdbUrl = (posterPath: string | null): string | null => {
  if (!posterPath) return null
  return `https://image.tmdb.org/t/p/w185${posterPath}`
}

export const profileUrl = (
  profilePath: string | null,
  size: 'w185' | 'h632' | 'original' = 'w185'
): string | null => {
  if (!profilePath) return null
  return `https://image.tmdb.org/t/p/${size}${profilePath}`
}

export function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatTotalRuntime(minutes: number): string {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)
  return parts.join(' ')
}

export function formatYear(year: number | null, endYear?: number | null): string {
  if (!year) return '—'
  if (endYear) return `${year}–${endYear}`
  return String(year)
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I']
]

export function toRoman(num: number): string {
  let result = ''
  let n = num
  for (const [value, symbol] of ROMAN) {
    while (n >= value) {
      result += symbol
      n -= value
    }
  }
  return result
}

export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/**
 * A stable, unique React key for any catalog or library row.
 *
 * Live TMDB results all carry `id: 0` — that zero is deliberate, it marks
 * "not yet persisted to the library" — so keying a list on `item.id` folds
 * every live row into the same key `0` and React warns about duplicate
 * children. This prefers the TMDB id (unique per title), then the persisted
 * row id, and finally a title+year composite so mixed lists never collide.
 */
export function catalogKey(item: {
  id: number
  tmdbId: number | null
  title: string
  year: number | null
}): string {
  if (item.tmdbId) return `t${item.tmdbId}`
  if (item.id) return `d${item.id}`
  return `s${item.title.toLowerCase()}:${item.year ?? 0}`
}

/** Deterministic 32-bit string hash (FNV-1a) — seeds stable pseudo-randomness. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A seeded PRNG so repeated bulk imports spread the same dates the same way. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A pseudo-random day within the last `months` months, seeded by the title.
 * Bulk-imported history otherwise piles every watched date onto today, which
 * flattens the activity chart; seeding keeps a re-import stable.
 */
export function distributeWatchedDate(seed: string, months: number, now = new Date()): string {
  if (months <= 0) return now.toISOString()
  const rnd = mulberry32(hashString(seed))
  const spanDays = Math.min(months * 30.44, 3650)
  const daysAgo = Math.floor(rnd() * spanDays)
  const d = new Date(now.getTime() - daysAgo * 86400000)
  // Land on a local noon, same as the date picker, so tz rolls never shift the day.
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

export interface ParsedTitleLine {
  title: string
  year: number | null
}

/**
 * Turns a pasted blob (one title per line) into a clean lookup list. Handles
 * the formats people actually paste: bullets, numbered lists, "Title (2019)",
 * Letterboxd-style "Title, The", quotes, and stray separators.
 */
export function parseTitleLines(input: string): ParsedTitleLine[] {
  return input
    .split(/\r?\n/)
    .map(raw => {
      let line = raw.trim()
      // Strip list furniture: "1.", "-", "*", "•", "|", leading tabs/spaces.
      line = line.replace(/^[\s>*•|·-]*\d+[).:]?\s*/, '')
      line = line.replace(/^[\s>*•|·-]+/, '')
      // Drop everything after a tab or a double-space "note" column.
      line = line.split('\t')[0]!.trim()
      // Unquote before matching the year — a pasted line often wraps both:
      // "Amélie (2001)".
      line = line.replace(/^["'“”]+|["'“”]+$/g, '')
      if (!line) return null

      let year: number | null = null
      const yearMatch = line.match(/\((\d{4})(?:\s*[-–~]\s*(\d{4})?)?\)\s*$/)
      if (yearMatch) {
        year = Number(yearMatch[1])
        line = line.slice(0, yearMatch.index).trim()
      }

      // "Title, The" (Letterboxd / IMDb listing order) → "The Title".
      const comma = line.match(/^(.*),\s*(a|an|the)\s*$/i)
      if (comma) line = `${comma[2]} ${comma[1]}`

      line = line.replace(/\s+/g, ' ').trim()
      if (!line) return null
      return { title: line, year }
    })
    .filter((v): v is ParsedTitleLine => v !== null)
}

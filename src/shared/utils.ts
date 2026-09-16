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

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { gunzipSync } from 'zlib'
import { getDataDir } from '../db'
import { getSetting } from '../db/queries'
import { parseSubtitles } from './parse'
import type { SubtitleCue } from './parse'
import type { MediaKind } from '@shared/types'

export { parseSubtitles }
export type { SubtitleCue }

/**
 * Subtitle fetching, parsing and local caching.
 *
 * WHY THIS EXISTS — the architectural constraint, verified by probing the live
 * embed providers:
 *
 *   CineTrack plays inside a <webview> pointing at third-party embeds. We
 *   probed vidsrc.to and walked its iframe chain:
 *
 *     vidsrc.to          -> 0 <video>, 5 iframes
 *       vsembed.ru       -> 0 <video>
 *         stellarconductornexus.com -> 0 <video>, 0 iframes
 *
 *   and attached the Chrome DevTools Protocol, which sees below same-origin
 *   rules: the debugger attaches fine, but a play attempt yields an empty
 *   document and ZERO media requests.
 *
 *   So we cannot inject a native <track>, cannot read video.currentTime, and
 *   cannot lift the stream URL. Subtitles must therefore be fetched, parsed
 *   and rendered by us as an overlay, synchronised against a clock we control
 *   (see SubtitleLayer.tsx) and calibrated by the user with one-click sync.
 */

const REQUEST_TIMEOUT_MS = 12000

/* ---------- Types ---------- */

export interface SubtitleCandidate {
  id: string
  /** Release name, e.g. "The.Matrix.1999.1080p.BrRip.x264.YIFY.en" */
  release: string
  format: string
  language: string
  languageCode: string
  /** Provider-reported quality/download signal; used to rank candidates. */
  downloads: number
  /** True for machine-translated tracks, surfaced so users can skip them. */
  hearingImpaired: boolean
  /** Seconds of timing offset this release needs, when the provider knows. */
  timeshift?: number
  provider: string
}

export interface SubtitleTrack {
  key: string
  language: string
  languageCode: string
  release: string
  cues: SubtitleCue[]
}

/* ---------- Cache ---------- */

function cacheDir(): string {
  const dir = join(getDataDir(), 'subtitles')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Stable key for a (title, episode, language) triple. */
export function subtitleCacheKey(
  tmdbId: number,
  kind: MediaKind,
  languageCode: string,
  season?: number | null,
  episode?: number | null
): string {
  const scope = kind === 'series' ? `s${season ?? 1}e${episode ?? 1}` : 'movie'
  return `${tmdbId}-${scope}-${languageCode.toLowerCase()}`
}

function cachePath(key: string): string {
  return join(cacheDir(), `${key}.json`)
}

export function readCachedTrack(key: string): SubtitleTrack | null {
  const p = cachePath(key)
  if (!existsSync(p)) return null
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as SubtitleTrack
    // A track with no cues is useless; treat it as a miss so we refetch.
    return parsed?.cues?.length ? parsed : null
  } catch {
    return null
  }
}

export function writeCachedTrack(track: SubtitleTrack): void {
  try {
    writeFileSync(cachePath(track.key), JSON.stringify(track), 'utf8')
  } catch (err) {
    console.error('[subtitles] cache write failed:', err)
  }
}

/** Clears the cache. Exposed in Settings so users can reclaim disk. */
export function clearSubtitleCache(): { files: number } {
  const dir = cacheDir()
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  for (const f of files) {
    try {
      unlinkSync(join(dir, f))
    } catch {
      /* a file the OS still holds is not worth failing over */
    }
  }
  return { files: files.length }
}

function cacheStats(): { files: number; bytes: number } {
  const dir = cacheDir()
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  let bytes = 0
  for (const f of files) {
    try {
      bytes += readFileSync(join(dir, f)).length
    } catch {
      /* skip */
    }
  }
  return { files: files.length, bytes }
}

/* ---------- Providers ---------- */

interface ProviderContext {
  imdbId: string
  season?: number | null
  episode?: number | null
  languageCode: string
}

/**
 * subtitles.website — verified working with no authentication.
 * GET /search/subtitles?imdb=tt0133093&language=en
 * GET /search/download/:id -> { download_url }
 */
async function searchSubtitlesWebsite(ctx: ProviderContext): Promise<SubtitleCandidate[]> {
  const base = 'https://subtitles.website/strapi/api'
  const url =
    `${base}/search/subtitles?imdb=${encodeURIComponent(ctx.imdbId)}` +
    (ctx.season != null ? `&season=${ctx.season}` : '') +
    (ctx.episode != null ? `&episode=${ctx.episode}` : '')

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`subtitles.website ${res.status}`)
  const body = (await res.json()) as {
    data?: {
      id: string
      release: string
      language?: { code: string; name: string }
      format?: string
      downloads?: number
    }[]
  }

  return (body.data ?? []).map(row => ({
    id: row.id,
    release: row.release,
    format: row.format ?? 'srt',
    language: row.language?.name ?? ctx.languageCode,
    languageCode: row.language?.code ?? ctx.languageCode,
    downloads: row.downloads ?? 0,
    hearingImpaired: /sdh|hi/i.test(row.release),
    provider: 'subtitles.website'
  }))
}

async function downloadSubtitlesWebsite(id: string): Promise<string> {
  const base = 'https://subtitles.website/strapi/api'
  const res = await fetch(`${base}/search/download/${id}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`subtitles.website download ${res.status}`)
  const body = (await res.json()) as { download_url?: string }
  if (!body.download_url) throw new Error('No download URL returned')

  const fileUrl = body.download_url.startsWith('http')
    ? body.download_url
    : `${base}${body.download_url}`

  const file = await fetch(fileUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!file.ok) throw new Error(`Subtitle file ${file.status}`)
  return file.text()
}

/**
 * OpenSubtitles.com REST v1 — the best catalogue, but it needs the user's own
 * free API key (Settings → Playback). Authenticated accounts get 20 downloads
 * a day instead of 5.
 */
async function searchOpenSubtitles(ctx: ProviderContext): Promise<SubtitleCandidate[]> {
  const apiKey = getSetting<string>('subtitles.opensubtitlesKey')
  if (!apiKey) throw new Error('No OpenSubtitles API key configured')

  const params = new URLSearchParams({
    imdb_id: ctx.imdbId.replace(/^tt/, ''),
    languages: ctx.languageCode,
    hearing_impaired: 'exclude'
  })
  if (ctx.season != null) params.set('season_number', String(ctx.season))
  if (ctx.episode != null) params.set('episode_number', String(ctx.episode))

  const res = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?${params}`, {
    headers: {
      'Api-Key': apiKey,
      'User-Agent': 'CineTrack v1.0.0',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`OpenSubtitles ${res.status}`)

  const body = (await res.json()) as {
    data?: {
      id: number
      attributes: {
        release?: string | null
        files?: { file_id: number; ext: string }[]
        language: string
        download_count?: number
        hearing_impaired?: boolean
        timings?: string | null
      }
    }[]
  }

  return (body.data ?? [])
    .filter(d => d.attributes.files?.length)
    .map(d => ({
      id: String(d.attributes.files![0]!.file_id),
      release: d.attributes.release ?? 'Unknown release',
      format: d.attributes.files![0]!.ext,
      language: d.attributes.language,
      languageCode: d.attributes.language,
      downloads: d.attributes.download_count ?? 0,
      hearingImpaired: d.attributes.hearing_impaired ?? false,
      provider: 'opensubtitles'
    }))
}

/**
 * OpenSubtitles serves the file gzip-compressed and base64-wrapped inside JSON,
 * which is why this looks more involved than a plain GET.
 */
async function downloadOpenSubtitles(fileId: string): Promise<string> {
  const apiKey = getSetting<string>('subtitles.opensubtitlesKey')
  if (!apiKey) throw new Error('No OpenSubtitles API key configured')

  const login = await fetch('https://api.opensubtitles.com/api/v1/login', {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'CineTrack v1.0.0'
    },
    body: JSON.stringify({
      username: getSetting<string>('subtitles.osUsername') ?? '',
      password: getSetting<string>('subtitles.osPassword') ?? ''
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!login.ok) throw new Error(`OpenSubtitles login failed (${login.status})`)
  const { token } = (await login.json()) as { token?: string }
  if (!token) throw new Error('OpenSubtitles returned no token')

  const res = await fetch('https://api.opensubtitles.com/api/v1/download', {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CineTrack v1.0.0'
    },
    body: JSON.stringify({ file_id: Number(fileId) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`OpenSubtitles download failed (${res.status})`)

  const body = (await res.json()) as { data?: string }
  if (!body.data) throw new Error('OpenSubtitles returned no file payload')
  // The payload is base64 of a gzip archive, not plain text.
  return gunzipSync(Buffer.from(body.data, 'base64')).toString('utf8')
}

/* ---------- Public API ---------- */

export interface SearchOptions {
  languageCode?: string
  /** Which providers to try, in order. Empty = every configured one. */
  providers?: string[]
}

function configuredProviders(): string[] {
  const list = ['subtitles.website']
  if (getSetting<string>('subtitles.opensubtitlesKey')) list.push('opensubtitles')
  return list
}

/**
 * Searches the configured providers. A provider that errors is skipped rather
 * than failing the whole search — one dead service must not block the other.
 */
export async function searchSubtitles(
  imdbId: string,
  season?: number | null,
  episode?: number | null,
  opts: SearchOptions = {}
): Promise<SubtitleCandidate[]> {
  const ctx: ProviderContext = {
    imdbId,
    season: season ?? null,
    episode: episode ?? null,
    languageCode: opts.languageCode ?? 'en'
  }
  const wanted = opts.providers?.length ? opts.providers : configuredProviders()

  const results = await Promise.allSettled(
    wanted.map(async provider => {
      if (provider === 'opensubtitles') return searchOpenSubtitles(ctx)
      return searchSubtitlesWebsite(ctx)
    })
  )

  const merged: SubtitleCandidate[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
    else console.error(`[subtitles] provider failed:`, r.reason)
  }

  // Best first: prefer matching language, real (non-SDH) tracks, then the
  // provider's own popularity signal.
  const score = (c: SubtitleCandidate) => {
    const lang = c.languageCode.slice(0, 2).toLowerCase() === ctx.languageCode.slice(0, 2).toLowerCase() ? 100 : 0
    return lang + (c.hearingImpaired ? 0 : 10) + Math.min(5, c.downloads)
  }
  return merged.sort((a, b) => score(b) - score(a))
}

/** Downloads + parses a candidate into cues. */
export async function loadSubtitle(
  candidate: SubtitleCandidate,
  tmdbId: number,
  kind: MediaKind,
  season?: number | null,
  episode?: number | null
): Promise<SubtitleTrack> {
  const raw =
    candidate.provider === 'opensubtitles'
      ? await downloadOpenSubtitles(candidate.id)
      : await downloadSubtitlesWebsite(candidate.id)

  const cues = parseSubtitles(raw)
  if (!cues.length) throw new Error('That subtitle file contained no readable cues')

  const track: SubtitleTrack = {
    key: subtitleCacheKey(tmdbId, kind, candidate.languageCode, season, episode),
    language: candidate.language,
    languageCode: candidate.languageCode,
    release: candidate.release,
    cues
  }
  writeCachedTrack(track)
  return track
}

export { cacheStats, cacheDir }
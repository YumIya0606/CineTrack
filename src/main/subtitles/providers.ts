import { gunzipSync } from 'zlib'
import { getSetting } from '../db/queries'
import { unzip, looksLikeZip, pickEpisodeEntry } from './unzip'
import type { ProviderContext, SubtitleCandidate, SubtitleProvider } from './types'

const REQUEST_TIMEOUT_MS = 15000

/**
 * SubDL — the successor to Subscene, and the reason this exists.
 *
 * Subscene itself has been dead since May 2024 (the domain is a parked
 * "Subscene is closed" page), so every "Subscene API wrapper" on GitHub targets
 * a site that no longer exists. SubDL absorbed the Subscene archive and ships a
 * real, documented API.
 *
 * Why it beats the alternatives here:
 *   - keyed on **TMDB id**, not just IMDb, so a title works before its IMDb id
 *     has been enriched and no IMDb lookup round-trip is needed
 *   - free tier is **2,000 requests/day** against OpenSubtitles' 20
 *   - `unpack=1` exposes the individual .srt inside a season pack, which is
 *     exactly what the overlay needs
 *
 * Needs a free key from subdl.com/panel/api (Settings → Playback).
 */

interface SubdlSubFile {
  file_n_id?: string
  name?: string
  language?: string
  hi?: boolean
  format?: string
  url?: string
}

interface SubdlSubtitle {
  release_name?: string | null
  name?: string | null
  url?: string
  season?: number | null
  episode?: number | null
  language?: string
  hi?: boolean
  full_season?: boolean
  framerate?: number
  fps?: string | null
  unpack_files?: SubdlSubFile[]
}

const subdlKey = (): string => getSetting<string>('subtitles.subdlKey') ?? ''

/** SubDL uses upper-case ISO codes ("EN"); we keep everything lower-case. */
const toSubdlLang = (code: string): string => code.slice(0, 2).toUpperCase()

/**
 * A subtitle entry only counts if it can actually deliver *this* episode.
 *
 * Without `unpack`, a season pack is a single ZIP covering ten episodes and
 * shows up as one candidate — which would then be downloaded, opened, and
 * mined for the right file anyway. Turning `unpack` on makes the provider tell
 * us which file each entry maps to, so we can drop the irrelevant ones here and
 * keep the download path trivial.
 */
function entryMatchesEpisode(
  sub: SubdlSubtitle,
  season: number | null,
  episode: number | null
): boolean {
  if (episode == null) return true
  const files = sub.unpack_files ?? []

  if (files.length) {
    // With unpack=1 the entry lists its actual files, so we can check exactly.
    return files.some(f => episodeMatchesName(f.name, season, episode))
  }
  if (sub.episode != null) return sub.episode === episode
  // Nothing to go on — assume it's right and let the download validate it.
  return true
}

function episodeMatchesName(
  name: string | undefined,
  season: number | null,
  episode: number | null
): boolean {
  if (!name || episode == null) return false
  const s = season ?? 1
  const n = name.toLowerCase()
  return (
    new RegExp(`s0*${s}e0*${episode}\\b`).test(n) ||
    new RegExp(`0*${s}x0*${episode}\\b`).test(n) ||
    new RegExp(`\\b${String(episode).padStart(3, '0')}\\b`).test(n) ||
    new RegExp(`\\b(?:e|ep)0*${episode}\\b`).test(n)
  )
}

export const subdlProvider: SubtitleProvider = {
  id: 'subdl',
  label: 'SubDL',
  blurb: 'Subscene archive successor. Free key, 2,000 requests/day. Best series coverage.',

  isConfigured: () => subdlKey().length > 0,

  async search(ctx: ProviderContext): Promise<SubtitleCandidate[]> {
    const key = subdlKey()
    if (!key) throw new Error('No SubDL API key configured')

    const params = new URLSearchParams({
      api_key: key,
      tmdb_id: String(ctx.tmdbId),
      type: ctx.kind === 'series' ? 'tv' : 'movie',
      languages: toSubdlLang(ctx.languageCode),
      unpack: '1',
      client: 'custom_integration'
    })
    if (ctx.kind === 'series' && ctx.season != null) {
      params.set('season_number', String(ctx.season))
      if (ctx.episode != null) params.set('episode_number', String(ctx.episode))
    }

    const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) {
      // SubDL answers a rejected key with 403 and a JSON body explaining why.
      // Surfacing the status alone leaves the user guessing between "wrong
      // key", "no key" and "blocked", so name the most likely cause.
      throw new Error(
        res.status === 401 || res.status === 403
          ? 'SubDL rejected your API key (403). Check it in Settings → Playback.'
          : `SubDL ${res.status}`
      )
    }
    const body = (await res.json()) as {
      status?: boolean
      error?: string
      message?: string
      subtitles?: SubdlSubtitle[]
    }
    if (body.status === false) {
      throw new Error(body.message || body.error || 'SubDL rejected the request')
    }
    if (!Array.isArray(body.subtitles)) {
      // A 200 with no `subtitles` array means the response shape changed or the
      // key has no quota. Either way "no array" must not read as "no results".
      throw new Error('SubDL returned an unexpected response (no subtitles array)')
    }

    return (body.subtitles ?? [])
      .filter(sub => sub.url || sub.unpack_files?.length)
      .filter(sub => entryMatchesEpisode(sub, ctx.season ?? null, ctx.episode ?? null))
      .map(sub => {
        const file = sub.unpack_files?.find(f =>
          episodeMatchesName(f.name, ctx.season ?? null, ctx.episode ?? null)
        )
        return {
          // Prefer the unpacked per-episode file: it downloads as raw text, so
          // no archive handling is needed at all.
          id: file?.url ?? sub.url!,
          release: sub.release_name || sub.name || 'Unknown release',
          format: file?.format ?? guessFormat(sub.name),
          language: sub.language ?? ctx.languageCode.toUpperCase(),
          languageCode: (sub.language ?? ctx.languageCode).toLowerCase(),
          downloads: 0,
          hearingImpaired: sub.hi ?? file?.hi ?? false,
          provider: 'subdl',
          season: ctx.season ?? null,
          episode: ctx.episode ?? null
        }
      })
  },

  async download(candidate: SubtitleCandidate): Promise<string> {
    const key = subdlKey()
    const url = candidate.id.startsWith('/')
      ? `https://dl.subdl.com${candidate.id}`
      : candidate.id
    const qs = key ? `?api_key=${encodeURIComponent(key)}` : ''
    const res = await fetch(url + qs, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`SubDL download ${res.status}`)

    const buf = Buffer.from(await res.arrayBuffer())

    // Unpacked episode files come back as raw subtitle text; season packs are
    // ZIPs and need the right episode pulled out of them.
    if (looksLikeZip(buf)) {
      const entry = pickEpisodeEntry(unzip(buf), candidate.season, candidate.episode)
      return decodeText(entry.data)
    }
    return decodeText(buf)
  }
}

/** SubDL sometimes serves SRT with a UTF-8 BOM and Windows line endings. */
function decodeText(buf: Buffer): string {
  let text = buf.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text.replace(/\r\n?/g, '\n')
}

function guessFormat(name?: string | null): string {
  const m = name?.match(/\.(srt|vtt|sub|ass|ssa|smi)$/i)
  return m ? m[1]!.toLowerCase() : 'srt'
}

/**
 * subtitles.website — no account needed, which makes it the only zero-setup
 * provider. Search is generous; download counts are small, so it is a good
 * second source but a weak sole one for a series.
 */
export const subtitlesWebsiteProvider: SubtitleProvider = {
  id: 'subtitles.website',
  label: 'subtitles.website',
  blurb: 'No account needed. Good for a quick grab, weaker series coverage.',

  isConfigured: () => true,

  async search(ctx: ProviderContext): Promise<SubtitleCandidate[]> {
    if (!ctx.imdbId) return []
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
      languageCode: (row.language?.code ?? ctx.languageCode).toLowerCase(),
      downloads: row.downloads ?? 0,
      hearingImpaired: /sdh|hi/i.test(row.release),
      provider: 'subtitles.website'
    }))
  },

  async download(candidate: SubtitleCandidate): Promise<string> {
    const base = 'https://subtitles.website/strapi/api'
    const res = await fetch(`${base}/search/download/${candidate.id}`, {
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
    return decodeText(Buffer.from(await file.arrayBuffer()))
  }
}

/**
 * OpenSubtitles.com REST v1 — the deepest catalogue, but the free tier is
 * brutal: 5 downloads/day anonymous, 20 with a free account. Worth keeping for
 * the titles the others miss, not as a primary.
 */
export const openSubtitlesProvider: SubtitleProvider = {
  id: 'opensubtitles',
  label: 'OpenSubtitles',
  blurb: 'Deepest catalogue. Free key gives 20 downloads/day — use as a fallback.',

  isConfigured: () => (getSetting<string>('subtitles.opensubtitlesKey') ?? '').length > 0,

  async search(ctx: ProviderContext): Promise<SubtitleCandidate[]> {
    const apiKey = getSetting<string>('subtitles.opensubtitlesKey')
    if (!apiKey) throw new Error('No OpenSubtitles API key configured')
    if (!ctx.imdbId) return []

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
        languageCode: d.attributes.language.toLowerCase(),
        downloads: d.attributes.download_count ?? 0,
        hearingImpaired: d.attributes.hearing_impaired ?? false,
        provider: 'opensubtitles'
      }))
  },

  /**
   * OpenSubtitles serves the file gzip-compressed and base64-wrapped inside
   * JSON, which is why this needs a login round trip and two transforms.
   */
  async download(candidate: SubtitleCandidate): Promise<string> {
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
      body: JSON.stringify({ file_id: Number(candidate.id) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`OpenSubtitles download failed (${res.status})`)

    const body = (await res.json()) as { data?: string }
    if (!body.data) throw new Error('OpenSubtitles returned no file payload')
    return gunzipSync(Buffer.from(body.data, 'base64')).toString('utf8')
  }
}

/**
 * Order matters: the first configured provider whose results exist leads the
 * picker. SubDL leads because its catalogue is the Subscene archive and its
 * free tier is 100x OpenSubtitles'.
 */
export const PROVIDERS: SubtitleProvider[] = [
  subdlProvider,
  subtitlesWebsiteProvider,
  openSubtitlesProvider
]

export function getProvider(id: string): SubtitleProvider | undefined {
  return PROVIDERS.find(p => p.id === id)
}
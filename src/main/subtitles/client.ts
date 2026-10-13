import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { getDataDir } from '../db'
import { getSetting } from '../db/queries'
import { parseSubtitles } from './parse'
import { PROVIDERS, getProvider } from './providers'
import type { MediaKind } from '@shared/types'
import type {
  ProviderContext,
  ProviderReport,
  SubtitleCandidate,
  SubtitleProvider,
  SubtitleSearchResult,
  SubtitleTrack
} from './types'

export { parseSubtitles }
export { PROVIDERS, getProvider }
export type { SubtitleCandidate, SubtitleProvider, SubtitleTrack }
export type { ProviderReport, SubtitleSearchResult }
export type { SubtitleCue } from './parse'

/**
 * Subtitle orchestration: provider fan-out, ranking, and the local cache.
 *
 * WHY AN OVERLAY — the architectural constraint, verified by probing the live
 * embed providers:
 *
 *   CineTrack plays inside a <webview> pointing at third-party embeds. Probing
 *   vidsrc.to and walking its iframe chain:
 *
 *     vidsrc.to          -> 0 <video>, 5 iframes
 *       vsembed.ru       -> 0 <video>
 *         stellarconductornexus.com -> 0 <video>, 0 iframes
 *
 *   and attaching the Chrome DevTools Protocol, which sees below same-origin
 *   rules: the debugger attaches fine, but a play attempt yields an empty
 *   document and ZERO media requests.
 *
 *   So we cannot inject a native <track> and cannot read video.currentTime for
 *   those providers. Subtitles are therefore fetched, parsed and rendered by us.
 *
 *   Some providers *do* broadcast their playback state to the embedding page
 *   via postMessage, which is what `playerSync.ts` listens for. When one does,
 *   timing is exact and the manual Sync control is unnecessary; when none does,
 *   we fall back to a wall clock the user calibrates by hand.
 */

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

export function cacheStats(): { files: number; bytes: number } {
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

/* ---------- Search ---------- */

export interface SearchOptions {
  languageCode?: string
  /** Which providers to try, in order. Empty = every configured one. */
  providers?: string[]
}

/**
 * The user's chosen order, falling back to the built-in ranking.
 *
 * Providers with no key are dropped here rather than failing inside the fan-out,
 * so a half-configured setup still searches with whatever it does have.
 */
function activeProviders(preferred?: string[]): SubtitleProvider[] {
  const order = preferred?.length
    ? preferred.map(id => getProvider(id)).filter((p): p is SubtitleProvider => !!p)
    : PROVIDERS
  return order.filter(p => p.isConfigured())
}


/** Turns a thrown provider error into something worth showing a person. */
function explain(err: unknown, id: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/\b40[13]\b/.test(raw) && id === 'subdl') {
    return 'SubDL rejected your API key. Check it in Settings → Playback.'
  }
  if (/403/.test(raw)) return 'Access denied — the API key was rejected.'
  if (/429/.test(raw)) return 'Rate limited. Too many searches in a short window.'
  if (/ENOTFOUND|EAI_AGAIN|fetch failed/i.test(raw)) {
    return 'Could not reach the provider (network or DNS failure).'
  }
  return raw
}

/**
 * Searches every configured provider and merges the results.
 *
 * A provider that fails is reported rather than silently dropped. That
 * distinction matters: an earlier version logged the failure to the console and
 * returned an empty list, so a rejected API key looked exactly like "this film
 * has no subtitles" and gave the user nothing to act on.
 */
export async function searchSubtitles(
  tmdbId: number,
  kind: MediaKind,
  opts: SearchOptions & { season?: number | null; episode?: number | null; imdbId?: string | null }
): Promise<SubtitleSearchResult> {
  const ctx: ProviderContext = {
    tmdbId,
    imdbId: opts.imdbId ?? null,
    kind,
    season: opts.season ?? null,
    episode: opts.episode ?? null,
    languageCode: opts.languageCode ?? 'en'
  }

  const providers = activeProviders(opts.providers)
  if (!providers.length) {
    return {
      candidates: [],
      nothingConfigured: true,
      providers: PROVIDERS.map(p => ({
        id: p.id,
        label: p.label,
        ok: false,
        count: 0,
        error: 'Not set up. Add a key in Settings → Playback.'
      }))
    }
  }

  const results = await Promise.allSettled(
    providers.map(async p => {
      const found = await p.search(ctx)
      return { id: p.id, label: p.label, found: found.map(c => ({ ...c, provider: p.id })) }
    })
  )

  const merged: SubtitleCandidate[] = []
  const reports: ProviderReport[] = []

  results.forEach((r, i) => {
    const p = providers[i]!
    if (r.status === 'fulfilled') {
      merged.push(...r.value.found)
      reports.push({ id: p.id, label: p.label, ok: true, count: r.value.found.length, error: null })
    } else {
      const message = explain(r.reason, p.id)
      console.error(`[subtitles] ${p.id} failed:`, r.reason)
      reports.push({ id: p.id, label: p.label, ok: false, count: 0, error: message })
    }
  })

  return {
    candidates: rankCandidates(merged, ctx.languageCode),
    providers: reports,
    nothingConfigured: false
  }
}

/**
 * Best first.
 *
 * The ordering encodes what actually makes a track usable: the right language
 * is mandatory, non-SDH beats SDH, and a provider's own popularity signal
 * breaks ties. Provider preference (the user's order) is respected within that
 * by weighting the provider's rank into the score.
 */
export function rankCandidates(
  candidates: SubtitleCandidate[],
  languageCode: string
): SubtitleCandidate[] {
  const wanted = languageCode.slice(0, 2).toLowerCase()
  const providerRank = new Map(PROVIDERS.map((p, i) => [p.id, i]))

  const score = (c: SubtitleCandidate) => {
    const lang = c.languageCode.slice(0, 2).toLowerCase() === wanted ? 1000 : 0
    const notSdh = c.hearingImpaired ? 0 : 50
    const provider = 20 - (providerRank.get(c.provider) ?? 9) * 5
    const popularity = Math.min(20, Math.log10(Math.max(1, c.downloads)) * 8)
    return lang + notSdh + provider + popularity
  }

  return [...candidates].sort((a, b) => score(b) - score(a))
}

/* ---------- Load ---------- */

/** Downloads + parses a candidate into cues, then caches it. */
export async function loadSubtitle(
  candidate: SubtitleCandidate,
  tmdbId: number,
  kind: MediaKind,
  season?: number | null,
  episode?: number | null
): Promise<SubtitleTrack> {
  const provider = getProvider(candidate.provider)
  if (!provider) throw new Error(`Unknown subtitle provider: ${candidate.provider}`)

  const raw = await provider.download(candidate)
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

/** Every provider plus whether the user has finished setting it up. */
export function providerStatus(): {
  id: string
  label: string
  blurb: string
  configured: boolean
}[] {
  return PROVIDERS.map(p => ({
    id: p.id,
    label: p.label,
    blurb: p.blurb,
    configured: p.isConfigured()
  }))
}

/** Used by the Settings screen to show which key is actually in play. */
export function subdlKeyPresent(): boolean {
  return (getSetting<string>('subtitles.subdlKey') ?? '').length > 0
}

export { cacheDir }

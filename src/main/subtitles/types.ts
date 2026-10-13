import type { SubtitleCue } from './parse'
import type { MediaKind } from '@shared/types'

export type { SubtitleCue }

export interface SubtitleCandidate {
  id: string
  /** Release name, e.g. "The.Matrix.1999.1080p.BrRip.x264.YIFY.en" */
  release: string
  format: string
  language: string
  languageCode: string
  /** Provider-reported quality/download signal; used to rank candidates. */
  downloads: number
  /** True for hearing-impaired / SDH tracks, so users can skip them. */
  hearingImpaired: boolean
  /** Seconds of timing offset this release needs, when the provider knows. */
  timeshift?: number
  provider: string
  /**
   * Carried through to download: a season pack is one archive covering every
   * episode, so the provider has to know which file inside it to pull out.
   */
  season?: number | null
  episode?: number | null
}

export interface SubtitleTrack {
  key: string
  language: string
  languageCode: string
  release: string
  cues: SubtitleCue[]
}

/** Everything a provider needs to find tracks for one title/episode. */
export interface ProviderContext {
  /** We key on TMDB first — every provider here accepts it and we always have it. */
  tmdbId: number
  /** Only needed by IMDb-keyed providers; absent for titles not yet enriched. */
  imdbId?: string | null
  kind: MediaKind
  season?: number | null
  episode?: number | null
  languageCode: string
}

export interface SubtitleProvider {
  id: string
  label: string
  /** Short note for the Settings screen: what this costs the user. */
  blurb: string
  /** False when the provider needs a key the user hasn't supplied. */
  isConfigured(): boolean
  search(ctx: ProviderContext): Promise<SubtitleCandidate[]>
  download(candidate: SubtitleCandidate): Promise<string>
}

/** Per-provider outcome of one search, so failures can be shown, not hidden. */
export interface ProviderReport {
  id: string
  label: string
  ok: boolean
  count: number
  error: string | null
}

export interface SubtitleSearchResult {
  candidates: SubtitleCandidate[]
  providers: ProviderReport[]
  /** True when nothing was even attempted (no provider configured). */
  nothingConfigured: boolean
}
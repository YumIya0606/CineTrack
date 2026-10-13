export const APP_NAME = 'CineTrack'

export type MediaKind = 'movie' | 'series'

/**
 * A status *key*. The built-ins are stable slugs that existing rows already
 * store, but the user can define more, so this is an open string union rather
 * than a closed enum. `StatusKey` narrows it to the five known values for
 * callers that need to reason about the built-ins specifically.
 */
export type WatchStatus = string

export type StatusKey =
  | 'watching'
  | 'planned'
  | 'completed'
  | 'rewatching'
  | 'dropped'

/** How a series' status is decided. */
export type StatusMode = 'auto' | 'manual'

/** One entry of the user's status palette. */
export interface StatusDef {
  /** Database row id — needed for edits. */
  id: number
  key: string
  label: string
  color: string
  position: number
  /** Adds this status' titles' runtimes into the watch-time total. */
  countsTowardWatchTime: boolean
  /** The episode engine may assign this status automatically. */
  derivable: boolean
  /** Built-ins can be restyled and reordered, never deleted. */
  isSystem: boolean
}

export type Quality = 'cinematic' | 'balanced' | 'battery'

export interface CatalogItem {
  id: number
  tmdbId: number | null
  imdbId: string | null
  title: string
  originalTitle: string | null
  kind: MediaKind
  year: number | null
  endYear: number | null
  genres: string[]
  runtimeMinutes: number | null
  voteAverage: number | null
  voteCount: number | null
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  popularity: number | null
}

export interface LibraryItem extends CatalogItem {
  libraryId: number
  status: WatchStatus
  /**
   * True when the user chose this status by hand. Series otherwise have their
   * status derived from episode progress, which the UI surfaces so a
   * "Watching" badge always says *why* it says that.
   */
  statusOverride: boolean
  /** Per-series override for the average episode length, in minutes. */
  episodesRuntime: number | null
  rating: number | null
  notes: string | null
  addedAt: string
  updatedAt: string
  watchedAt: string | null
  episodesWatched: number
  episodesTotal: number | null
  seasonsTotal: number | null
  playCount: number
}

/* ---------- Status board ---------- */

export type BoardGroupBy = 'status' | 'kind' | 'genre' | 'decade' | 'none'
export type BoardSort =
  | 'updated'
  | 'title'
  | 'year'
  | 'rating'
  | 'runtime'
  | 'watchedAt'
  | 'status'
  | 'progress'

export interface BoardFilters {
  /** Empty means "every status". */
  statuses?: string[]
  kind?: MediaKind
  /** Matched as "any of"; empty means every genre. */
  genres?: string[]
  yearMin?: number
  yearMax?: number
  ratingMin?: number
  /** Restrict to rated / unrated titles. */
  rated?: boolean
  /** Only titles the user has finished. */
  watchedOnly?: boolean
  /** Only series that are mid-way through their episode list. */
  inProgressOnly?: boolean
  query?: string
}

export interface BoardGroupBucket {
  key: string
  label: string
  count: number
  minutes: number
}

/** A row of the board — a library item plus the fields the table renders. */
export interface BoardRow extends LibraryItem {
  /** Precomputed watch minutes for this row, under the current status rules. */
  watchMinutes: number
}

/** A lightweight title summary — used by person filmographies and collections. */
export interface BoardRowSummary {
  id: number
  title: string
  kind: MediaKind
  year: number | null
  posterPath: string | null
  /** Role played (cast) or job (crew); null for a plain listing. */
  character: string | null
  voteAverage: number | null
}

export interface PersonDetails {
  id: number
  name: string
  biography: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  profilePath: string | null
  alsoKnownAs: string[]
  credits: BoardRowSummary[]
}

export interface CollectionDetails {
  id: number
  name: string
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  parts: BoardRowSummary[]
}

export interface BoardResult {
  rows: BoardRow[]
  total: number
  /** One entry per status present in the library, with counts and minutes. */
  summary: { key: string; label: string; color: string; count: number; minutes: number }[]
  genres: string[]
}

export interface EpisodeLog {
  libraryId: number
  season: number
  episode: number
  watchedAt: string
}

export interface Stats {
  totalTitles: number
  totalRuntimeMinutes: number
  completed: number
  watching: number
  planned: number
  dropped: number
  averageRating: number
  byKind: { movie: number; series: number }
  byGenre: { genre: string; count: number; minutes: number }[]
  byYear: { year: number; count: number }[]
  byDecade: { decade: number; count: number; minutes: number }[]
  topPeople: { name: string; role: string; count: number }[]
  ratingDistribution: { rating: number; count: number }[]
  monthlyActivity: { month: string; count: number }[]
}

export interface tmdbConfig {
  apiKey: string | null
  connected: boolean
}

export interface LivePerson {
  name: string
  character: string | null
  job: string | null
  profilePath: string | null
}

export interface LiveDetails extends CatalogItem {
  tagline: string | null
  seasons: number | null
  episodes: number | null
  cast: LivePerson[]
  crew: LivePerson[]
  similar: CatalogItem[]
}

export interface VideoInfo {
  key: string
  name: string
  site: string
  type: string
}

export interface WatchProvider {
  providerId: number
  providerName: string
  logoPath: string | null
}

export interface WatchProviders {
  link: string | null
  flatrate: WatchProvider[]
  rent: WatchProvider[]
  buy: WatchProvider[]
}

export interface EpisodeInfo {
  id: number
  episodeNumber: number
  seasonNumber: number
  name: string
  overview: string | null
  stillPath: string | null
  airDate: string | null
  runtime: number | null
  voteAverage: number | null
}

export interface SeasonInfo {
  seasonNumber: number
  name: string
  overview: string | null
  posterPath: string | null
  airDate: string | null
  episodeCount: number
  episodes: EpisodeInfo[]
}

export interface ShowStatus {
  status: string | null
  inProduction: boolean | null
  nextEpisodeToAir: {
    seasonNumber: number
    episodeNumber: number
    airDate: string | null
    name: string | null
  } | null
}

export interface DiscoverFilters {
  kind?: MediaKind
  /** One or more genres; matched as "any of" (TMDB with_genres OR). */
  genreIds?: number[]
  minRating?: number
  fromYear?: number
  toYear?: number
  /** Upper bound on runtime in minutes (TMDB with_runtime.lte). */
  maxRuntime?: number
  sortBy?: string
}

export interface DiscoverPage {
  page: number
  totalPages: number
  items: CatalogItem[]
}

export interface Genre {
  id: number
  name: string
}

export interface Collection {
  id: number
  name: string
  description: string | null
  createdAt: string
  itemCount: number
}

export interface ViewingEntry {
  id: number
  watchedAt: string
}

export interface BulkAddOptions {
  /**
   * Spread watchedAt across this many past months so back-filled history
   * doesn't collapse the activity chart onto a single day.
   */
  windowMonths?: number
}

export interface BulkAddResult {
  added: number
  skipped: number
}

export interface BackfillResult {
  fixed: number
  total: number
}

export interface BackupStatus {
  folder: string | null
  onExit: boolean
  lastAuto: string | null
}

export type NotificationKind = 'premiere' | 'new_episode' | 'info'

export interface NotificationItem {
  id: number
  kind: NotificationKind
  title: string
  body: string | null
  catalogId: number | null
  tmdbId: number | null
  scheduledFor: string
  createdAt: string
}

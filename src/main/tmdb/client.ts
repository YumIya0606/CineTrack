import { getSetting } from '../db/queries'
import type { tmdbConfig, MediaKind, EpisodeInfo } from '@shared/types'

const API_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

export function getApiKey(): string | null {
  return getSetting<string>('tmdb.apiKey')
}

export function getTmdbConfig(): tmdbConfig {
  const apiKey = getApiKey()
  return { apiKey, connected: Boolean(apiKey) }
}

/** Bearer (v4 read token) is preferred; falls back to v3 api_key param. */
function authInit(): { headers: Record<string, string>; params: Record<string, string> } {
  const v4 = getSetting<string>('tmdb.readToken')
  if (v4) return { headers: { Authorization: `Bearer ${v4}` }, params: {} }
  const v3 = getApiKey()
  return { headers: {}, params: v3 ? { api_key: v3 } : {} }
}

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const { headers, params: authParams } = authInit()
  const url = new URL(`${API_BASE}${path}`)
  url.searchParams.set('language', 'en-US')
  for (const [k, v] of Object.entries(authParams)) url.searchParams.set(k, v)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, { method: 'GET', headers })
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`)
  return (await res.json()) as T
}

export function posterUrl(
  path: string | null,
  size: 'w185' | 'w342' | 'w500' | 'original' = 'w342'
): string | null {
  if (!path) return null
  return `${IMAGE_BASE}/${size}${path}`
}

export function backdropUrl(
  path: string | null,
  size: 'w780' | 'w1280' | 'original' = 'w1280'
): string | null {
  if (!path) return null
  return `${IMAGE_BASE}/${size}${path}`
}

/* ---------- Response shapes ---------- */

export interface TmdbMediaResult {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average: number | null
  vote_count: number | null
  popularity: number | null
  genre_ids?: number[]
  media_type?: string
  runtime?: number
  episode_run_time?: number[]
  number_of_seasons?: number
  number_of_episodes?: number
  tagline?: string | null
  genres?: { id: number; name: string }[]
  credits?: {
    cast: TmdbCastMember[]
    crew: TmdbCrewMember[]
  }
  recommendations?: { results: TmdbMediaResult[] }
  similar?: { results: TmdbMediaResult[] }
}

export interface TmdbCastMember {
  id: number
  name: string
  character: string | null
  profile_path: string | null
  order: number
}

export interface TmdbCrewMember {
  id: number
  name: string
  job: string | null
  department: string | null
  profile_path: string | null
}

/* ---------- Normalisation to app types ---------- */

export function tmdbToCatalog(
  r: TmdbMediaResult,
  kind: MediaKind
): import('@shared/types').CatalogItem {
  const isSeries = kind === 'series'
  const dateStr = isSeries ? r.first_air_date : r.release_date
  const year = dateStr ? Number(dateStr.slice(0, 4)) : null
  return {
    id: 0,
    tmdbId: r.id,
    imdbId: null,
    title: (isSeries ? r.name : r.title) ?? 'Untitled',
    originalTitle: (isSeries ? r.original_name : r.original_title) ?? null,
    kind,
    year,
    endYear: null,
    genres: (r.genres ?? []).map(g => g.name),
    runtimeMinutes: isSeries
      ? (r.episode_run_time?.[0] ?? null) ?? null
      : (r.runtime ?? null),
    voteAverage: r.vote_average ?? null,
    voteCount: r.vote_count ?? null,
    overview: r.overview ?? null,
    posterPath: r.poster_path ?? null,
    backdropPath: r.backdrop_path ?? null,
    popularity: r.popularity ?? null
  }
}

/* ---------- Endpoints used by the app ---------- */

export async function searchTmdb(query: string, kind?: MediaKind): Promise<TmdbMediaResult[]> {
  const params: Record<string, string> = { query, include_adult: 'false' }
  const data =
    kind === 'movie'
      ? await tmdbFetch<{ results: TmdbMediaResult[] }>('/search/movie', params)
      : kind === 'series'
        ? await tmdbFetch<{ results: TmdbMediaResult[] }>('/search/tv', params)
        : await tmdbFetch<{ results: TmdbMediaResult[] }>('/search/multi', params)
  return data.results.filter(r => r.media_type !== 'person' && (r.title || r.name))
}

export async function trendingTmdb(): Promise<TmdbMediaResult[]> {
  const data = await tmdbFetch<{ results: TmdbMediaResult[] }>('/trending/all/week')
  return data.results.filter(r => r.title || r.name)
}

export async function detailsTmdb(tmdbId: number, kind: MediaKind): Promise<TmdbMediaResult> {
  const append = 'append_to_response=credits,recommendations,similar'
  const path = kind === 'series' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`
  const data = await tmdbFetch<TmdbMediaResult>(`${path}?${append}`)
  if (kind === 'series') data.media_type = 'tv'
  else data.media_type = 'movie'
  return data
}

/* ---------- Live enrichment: trailers, providers, episode grids ---------- */

export interface TmdbVideo {
  id: string
  key: string
  site: string
  type: string
  name: string
  official: boolean
}

/** Best available trailer — prefers official YouTube, falls back to any video. */
export async function trailerTmdb(tmdbId: number, kind: MediaKind): Promise<TmdbVideo | null> {
  const path = kind === 'series' ? `/tv/${tmdbId}/videos` : `/movie/${tmdbId}/videos`
  const data = await tmdbFetch<{ results: TmdbVideo[] }>(path)
  const vids = data.results.filter(v => v.site === 'YouTube')
  return (
    vids.find(v => v.type === 'Trailer' && v.official) ??
    vids.find(v => v.type === 'Trailer') ??
    vids[0] ??
    null
  )
}

export interface TmdbWatchProvider {
  providerId: number
  providerName: string
  logoPath: string | null
  displayPriority: number
}

export interface TmdbWatchProviders {
  link: string | null
  flatrate: TmdbWatchProvider[]
  rent: TmdbWatchProvider[]
  buy: TmdbWatchProvider[]
}

/** Where to stream/rent/buy in the user's locale (defaults to US). */
export async function watchProvidersTmdb(
  tmdbId: number,
  kind: MediaKind,
  locale = 'US'
): Promise<TmdbWatchProviders> {
  const path = kind === 'series' ? `/tv/${tmdbId}/watch/providers` : `/movie/${tmdbId}/watch/providers`
  const data = await tmdbFetch<{ results?: Record<string, unknown> }>(path)
  // Regions are nested under `results`, and each provider is snake_case.
  const regions = data.results ?? {}
  const region = (regions[locale] ?? regions['US'] ?? {}) as {
    link?: string
    flatrate?: TmdbProviderRaw[]
    rent?: TmdbProviderRaw[]
    buy?: TmdbProviderRaw[]
  }
  const pick = (list?: TmdbProviderRaw[]) =>
    (list ?? [])
      .map(p => ({
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
        displayPriority: p.display_priority
      }))
      .sort((a, b) => a.displayPriority - b.displayPriority)
  return {
    link: region.link ?? null,
    flatrate: pick(region.flatrate),
    rent: pick(region.rent),
    buy: pick(region.buy)
  }
}

/** Raw TMDB watch-provider row — the API speaks snake_case. */
interface TmdbProviderRaw {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority: number
}

export interface TmdbEpisode {
  id: number
  episode_number: number
  season_number: number
  name: string
  overview: string | null
  still_path: string | null
  air_date: string | null
  runtime: number | null
  vote_average: number | null
}

export interface TmdbSeasonRaw {
  season_number: number
  name: string
  overview: string | null
  poster_path: string | null
  air_date: string | null
  episode_count: number
  episodes: TmdbEpisode[]
}

/** Normalized season shape handed to the renderer. */
export interface TmdbSeason {
  seasonNumber: number
  name: string
  overview: string | null
  posterPath: string | null
  airDate: string | null
  episodeCount: number
  episodes: EpisodeInfo[]
}

/** Full episode list for a season, used by the season/episode grid. */
export async function seasonTmdb(tvId: number, seasonNumber: number): Promise<TmdbSeason> {
  const data = await tmdbFetch<TmdbSeasonRaw>(`/tv/${tvId}/season/${seasonNumber}`)
  return {
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview,
    posterPath: data.poster_path,
    airDate: data.air_date,
    episodeCount: data.episode_count ?? (data.episodes ?? []).length,
    episodes: (data.episodes ?? []).map(e => ({
      id: e.id,
      episodeNumber: e.episode_number,
      seasonNumber: e.season_number,
      name: e.name,
      overview: e.overview,
      stillPath: e.still_path,
      airDate: e.air_date,
      runtime: e.runtime,
      voteAverage: e.vote_average
    }))
  }
}

export interface TmdbShowStatusRaw {
  status: string | null
  in_production: boolean | null
  next_episode_to_air: {
    season_number: number
    episode_number: number
    air_date: string | null
    name: string | null
  } | null
}

export interface TmdbShowStatus {
  status: string | null
  inProduction: boolean | null
  nextEpisodeToAir: {
    seasonNumber: number
    episodeNumber: number
    airDate: string | null
    name: string | null
  } | null
}

/** Airing status + the next unfetched episode, for "new episode" reminders. */
export async function showStatusTmdb(tvId: number): Promise<TmdbShowStatus> {
  const data = await tmdbFetch<TmdbShowStatusRaw>(`/tv/${tvId}`)
  return {
    status: data.status ?? null,
    inProduction: data.in_production ?? null,
    nextEpisodeToAir: data.next_episode_to_air
      ? {
          seasonNumber: data.next_episode_to_air.season_number,
          episodeNumber: data.next_episode_to_air.episode_number,
          airDate: data.next_episode_to_air.air_date ?? null,
          name: data.next_episode_to_air.name ?? null
        }
      : null
  }
}

export interface TmdbDiscoverPage {
  page: number
  totalPages: number
  results: TmdbMediaResult[]
}

/** Filtered discovery — mirrors TMDB's /discover endpoints with real filters. */
export async function discoverTmdb(
  filters: DiscoverFilters,
  page = 1
): Promise<TmdbDiscoverPage> {
  const kind = filters.kind ?? 'movie'
  // TMDB uses different date fields per kind.
  const dateField = kind === 'series' ? 'first_air_date' : 'primary_release_date'
  const params: Record<string, string> = {
    page: String(page),
    sort_by: filters.sortBy ?? 'popularity.desc',
    'vote_count.gte': '50'
  }
  if (filters.genreId) params['with_genres'] = String(filters.genreId)
  if (filters.minRating !== undefined) params['vote_average.gte'] = String(filters.minRating)
  if (filters.fromYear) params[`${dateField}.gte`] = `${filters.fromYear}-01-01`
  if (filters.toYear) params[`${dateField}.lte`] = `${filters.toYear}-12-31`

  const path = kind === 'series' ? '/discover/tv' : '/discover/movie'
  const data = await tmdbFetch<TmdbDiscoverPage>(path, params)
  return {
    page: data.page,
    totalPages: Math.min(data.totalPages, 500),
    results: data.results.filter(r => r.title || r.name)
  }
}

export interface DiscoverFilters {
  kind?: MediaKind
  genreId?: number
  minRating?: number
  fromYear?: number
  toYear?: number
  sortBy?: string
}

/** TMDB's genre list, cached for a session so filters can render labels. */
let genreCache: Record<MediaKind, { id: number; name: string }[]> | null = null
export async function genresTmdb(): Promise<Record<MediaKind, { id: number; name: string }[]>> {
  if (genreCache) return genreCache
  const [movie, tv] = await Promise.all([
    tmdbFetch<{ genres: { id: number; name: string }[] }>('/genre/movie/list'),
    tmdbFetch<{ genres: { id: number; name: string }[] }>('/genre/tv/list')
  ])
  genreCache = { movie: movie.genres, series: tv.genres }
  return genreCache
}

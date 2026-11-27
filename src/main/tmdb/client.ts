import { getSetting } from '../db/queries'
import { normalizeSearchQuery } from '@shared/utils'
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

/** Every TMDB call is time-boxed. Node's fetch has no default timeout, so a
 * stalled connection used to hold an IPC handler (and the UI awaiting it)
 * open for minutes — and the notification sweep runs them serially. */
const REQUEST_TIMEOUT_MS = 15000

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const { headers, params: authParams } = authInit()
  const url = new URL(`${API_BASE}${path}`)
  url.searchParams.set('language', 'en-US')
  for (const [k, v] of Object.entries(authParams)) url.searchParams.set(k, v)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
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

export interface TmdbExternalIds {
  imdb_id?: string | null
  facebook_id?: string | null
  instagram_id?: string | null
  twitter_id?: string | null
  wikidata_id?: string | null
}

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
  /** Present only when `external_ids` is appended. */
  external_ids?: TmdbExternalIds
  belongs_to_collection?: {
    id: number
    name: string
    poster_path: string | null
    backdrop_path: string | null
  } | null
  credits?: {
    cast: TmdbCastMember[]
    crew: TmdbCrewMember[]
  }
  /** TV only: cast aggregated across every season, not just the latest. */
  aggregate_credits?: {
    cast: TmdbAggregateCast[]
    crew: TmdbAggregateCrew[]
  }
  production_companies?: TmdbCompany[]
  networks?: TmdbNetwork[]
  keywords?: { keywords?: TmdbKeyword[]; results?: TmdbKeyword[] }
  alternative_titles?: {
    titles?: TmdbAlternativeTitle[]
    results?: TmdbAlternativeTitle[]
  }
  recommendations?: { results: TmdbMediaResult[] }
  similar?: { results: TmdbMediaResult[] }
}

export interface TmdbKeyword {
  id: number
  name: string
}

export interface TmdbCompany {
  id: number
  name: string
  logo_path: string | null
  origin_country?: string | null
  description?: string | null
  headquarters?: string | null
}

export interface TmdbNetwork {
  id: number
  name: string
  logo_path: string | null
  origin_country?: string | null
  headquarters?: string | null
}

export interface TmdbAlternativeTitle {
  iso_3166_1: string
  title: string
  type?: string
}

export interface TmdbAggregateCast {
  id: number
  name: string
  profile_path: string | null
  order: number
  roles?: { character: string | null; episode_count: number }[]
  total_episode_count: number
}

export interface TmdbAggregateCrew {
  id: number
  name: string
  profile_path: string | null
  department: string | null
  jobs?: { job: string | null; episode_count: number }[]
  total_episode_count: number
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
    // Only the details endpoints append external_ids, so search/trending rows
    // legitimately come back null and get filled in when the title is opened.
    imdbId: r.external_ids?.imdb_id ?? null,
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
  const cleaned = normalizeSearchQuery(query)
  if (!cleaned) return []

  const run = async (term: string, scope: MediaKind | 'multi'): Promise<TmdbMediaResult[]> => {
    const params: Record<string, string> = { query: term, include_adult: 'false' }
    const data =
      scope === 'movie'
        ? await tmdbFetch<{ results: TmdbMediaResult[] }>('/search/movie', params)
        : scope === 'series'
          ? await tmdbFetch<{ results: TmdbMediaResult[] }>('/search/tv', params)
          : await tmdbFetch<{ results: TmdbMediaResult[] }>('/search/multi', params)
    return data.results.filter(r => r.media_type !== 'person' && (r.title || r.name))
  }

  const tagKind = (rows: TmdbMediaResult[], scope: MediaKind): TmdbMediaResult[] =>
    rows.map(r => ({ ...r, media_type: scope === 'series' ? 'tv' : 'movie' }))

  /** Title/user variants worth one extra request. */
  const variants = (term: string): string[] => {
    const out = [term]
    const noArticle = term.replace(/^(?:the|a|an)\s+/i, '').trim()
    if (noArticle && noArticle !== term) out.push(noArticle)
    const noYear = term
      .replace(/\s*\((?:19|20)\d{2}\)\s*$/i, '')
      .replace(/\s+(?:19|20)\d{2}\s*$/i, '')
      .trim()
    if (noYear && !out.includes(noYear)) out.push(noYear)
    const plain = term
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (plain && !out.includes(plain)) out.push(plain)
    return out.slice(0, 3)
  }

  const searchTerm = async (term: string): Promise<TmdbMediaResult[]> => {
    if (kind) return tagKind(await run(term, kind), kind)

    // /search/multi returns both, but it can rank one adaptation so highly that
    // the other disappears. If a type is missing entirely, ask that endpoint
    // directly — this is what surfaces a TV series behind a same-named film.
    const multi = await run(term, 'multi')
    const hasMovie = multi.some(r => r.media_type === 'movie')
    const hasTv = multi.some(r => r.media_type === 'tv')
    const extra: TmdbMediaResult[] = []
    if (!hasMovie) extra.push(...tagKind(await run(term, 'movie'), 'movie'))
    if (!hasTv) extra.push(...tagKind(await run(term, 'series'), 'series'))

    const seen = new Set<string>()
    const merged: TmdbMediaResult[] = []
    for (const row of [...multi, ...extra]) {
      const key = `${row.media_type}-${row.id}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(row)
    }
    return merged
  }

  let results: TmdbMediaResult[] = []
  for (const term of variants(cleaned)) {
    results = await searchTerm(term)
    if (results.length) break
  }

  // Exact and prefix title matches outrank a more popular but vaguely related
  // result. Case is already folded; TMDB returns title or name by media type.
  const needle = cleaned.toLowerCase()
  const rank = (r: TmdbMediaResult): number => {
    const title = ((r.media_type === 'tv' ? r.name : r.title) ?? '').toLowerCase()
    if (title === needle) return 0
    if (title.startsWith(needle)) return 1
    return 2
  }
  return results.sort((a, b) => rank(a) - rank(b) || (b.popularity ?? 0) - (a.popularity ?? 0))
}

export async function trendingTmdb(): Promise<TmdbMediaResult[]> {
  const data = await tmdbFetch<{ results: TmdbMediaResult[] }>('/trending/all/week')
  return data.results.filter(r => r.title || r.name)
}

export async function detailsTmdb(tmdbId: number, kind: MediaKind): Promise<TmdbMediaResult> {
  // external_ids rides along on the same request — it's what lets us look up
  // subtitles and cross-reference IMDb without spending another call.
  // aggregate_credits is TV-only and gives a show's full cast across seasons;
  // keywords power the clickable keyword pages in the detail panel.
  const appends = ['credits', 'recommendations', 'similar', 'external_ids', 'keywords', 'alternative_titles']
  if (kind === 'series') appends.push('aggregate_credits')
  const append = `append_to_response=${appends.join(',')}`
  const path = kind === 'series' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`
  const data = await tmdbFetch<TmdbMediaResult>(`${path}?${append}`)
  if (kind === 'series') data.media_type = 'tv'
  else data.media_type = 'movie'
  return data
}

/* ---------- Keyword and studio pages ---------- */

/** Canonical keyword name for a keyword page. */
export async function keywordTmdb(keywordId: number): Promise<TmdbKeyword> {
  return tmdbFetch<TmdbKeyword>(`/keyword/${keywordId}`)
}

/** Titles tagged with a keyword, across both movie and TV catalogs. */
export async function keywordTitlesTmdb(keywordId: number): Promise<import('@shared/types').CatalogItem[]> {
  const params = {
    with_keywords: String(keywordId),
    sort_by: 'popularity.desc',
    'vote_count.gte': '10'
  }
  const [movies, tv] = await Promise.all([
    tmdbFetch<TmdbDiscoverPage>('/discover/movie', params),
    tmdbFetch<TmdbDiscoverPage>('/discover/tv', params)
  ])
  const seen = new Set<string>()
  return [...movies.results, ...tv.results]
    .filter(r => {
      const kind = r.media_type === 'tv' || r.name ? 'series' : 'movie'
      const key = `${kind}-${r.id}`
      if (!r.title && !r.name) return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(r => tmdbToCatalog(r, (r.media_type === 'tv' || r.name ? 'series' : 'movie') as MediaKind))
}

export interface StudioDetails {
  id: number
  name: string
  description: string | null
  logoPath: string | null
  headquarters: string | null
  country: string | null
  kind: 'company' | 'network'
}

/** A production company or TV network, normalized for the browse modal. */
export async function studioTmdb(
  id: number,
  kind: 'company' | 'network'
): Promise<StudioDetails> {
  const data = await tmdbFetch<TmdbCompany & TmdbNetwork & {
    description?: string | null
    headquarters?: string | null
    origin_country?: string | null
  }>(kind === 'network' ? `/network/${id}` : `/company/${id}`)
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    logoPath: data.logo_path ?? null,
    headquarters: data.headquarters ?? null,
    country: data.origin_country ?? null,
    kind
  }
}

/** Every title associated with a company or network. */
export async function studioTitlesTmdb(
  id: number,
  kind: 'company' | 'network'
): Promise<import('@shared/types').CatalogItem[]> {
  const params: Record<string, string> =
    kind === 'network'
      ? { with_networks: String(id), sort_by: 'popularity.desc', 'vote_count.gte': '5' }
      : { with_companies: String(id), sort_by: 'popularity.desc', 'vote_count.gte': '5' }
  // Networks only exist on TV; a production company can have made both films
  // and series, so ask both catalogues.
  const paths = kind === 'network' ? ['/discover/tv'] : ['/discover/movie', '/discover/tv']
  const pages = await Promise.all(
    paths.map(path => tmdbFetch<TmdbDiscoverPage>(path, params))
  )
  const seen = new Set<string>()
  return pages
    .flatMap(page => page.results)
    .filter(r => {
      if (!r.title && !r.name) return false
      const kindKey = r.name ? 'series' : 'movie'
      const key = `${kindKey}-${r.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(r => tmdbToCatalog(r, (r.name ? 'series' : 'movie') as MediaKind))
}

/* ---------- People ---------- */

export interface TrendingPerson {
  id: number
  name: string
  profilePath: string | null
  knownForDepartment: string | null
  popularity: number | null
  knownFor: string | null
}

/** Actors/creators trending this week, for the Discover people rail. */
export async function trendingPeopleTmdb(
  window: 'day' | 'week' = 'week'
): Promise<TrendingPerson[]> {
  const data = await tmdbFetch<{ results: (TmdbPerson & { known_for?: { title?: string; name?: string }[] })[] }>(
    `/trending/person/${window}`
  )
  return data.results.map(p => ({
    id: p.id,
    name: p.name,
    profilePath: p.profile_path ?? null,
    knownForDepartment: p.known_for_department ?? null,
    popularity: p.popularity ?? null,
    knownFor:
      p.known_for?.map(k => k.title ?? k.name).filter(Boolean).slice(0, 2).join(' · ') ?? null
  }))
}

/* ---------- Universal search: people and collections ---------- */

/** People matching a query, for the command palette's People section. */
export async function searchPeopleTmdb(
  query: string
): Promise<import('@shared/types').PersonSearchResult[]> {
  const q = normalizeSearchQuery(query)
  if (!q) return []
  const data = await tmdbFetch<{
    results: (TmdbPerson & { known_for?: { title?: string; name?: string }[] })[]
  }>('/search/person', { query: q, include_adult: 'false' })
  return data.results.slice(0, 6).map(p => ({
    id: p.id,
    name: p.name,
    profilePath: p.profile_path ?? null,
    knownForDepartment: p.known_for_department ?? null,
    knownFor:
      p.known_for?.map(k => k.title ?? k.name).filter(Boolean).slice(0, 2).join(' · ') ?? null
  }))
}

/** Franchises matching a query, so "Marvel" reaches its collection page. */
export async function searchCollectionsTmdb(
  query: string
): Promise<import('@shared/types').CollectionSearchResult[]> {
  const q = normalizeSearchQuery(query)
  if (!q) return []
  const data = await tmdbFetch<{
    results: { id: number; name: string; poster_path: string | null; backdrop_path: string | null }[]
  }>('/search/collection', { query: q, include_adult: 'false' })
  return data.results.slice(0, 6).map(c => ({
    id: c.id,
    name: c.name,
    posterPath: c.poster_path ?? null,
    backdropPath: c.backdrop_path ?? null
  }))
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
  id?: number
  season_number: number
  name: string
  overview: string | null
  poster_path: string | null
  air_date: string | null
  episode_count: number
  episodes: TmdbEpisode[]
  credits?: { cast: TmdbCastMember[]; crew?: TmdbCrewMember[] }
  images?: { posters?: TmdbImage[]; backdrops?: TmdbImage[] }
  videos?: { results?: TmdbVideo[] }
}

export interface TmdbImage {
  file_path: string
  width: number
  height: number
  aspect_ratio: number
  iso_639_1: string | null
  vote_average: number
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
  cast: import('@shared/types').SeasonCastMember[]
  videos: import('@shared/types').VideoInfo[]
  images: import('@shared/types').SeasonImage[]
}

/** Full episode list for a season, used by the season/episode grid. */
export async function seasonTmdb(tvId: number, seasonNumber: number): Promise<TmdbSeason> {
  const data = await tmdbFetch<TmdbSeasonRaw>(
    `/tv/${tvId}/season/${seasonNumber}?append_to_response=credits,images,videos`
  )
  return {
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview,
    posterPath: data.poster_path,
    airDate: data.air_date,
    episodeCount: data.episode_count ?? (data.episodes ?? []).length,
    cast: (data.credits?.cast ?? []).slice(0, 12).map(c => ({
      personId: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
      episodes: null
    })),
    videos: (data.videos?.results ?? [])
      .filter(v => v.site === 'YouTube')
      .slice(0, 4)
      .map(v => ({ key: v.key, name: v.name, site: v.site, type: v.type })),
    images: [...(data.images?.backdrops ?? []), ...(data.images?.posters ?? [])]
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 6)
      .map(i => ({
        filePath: i.file_path,
        width: i.width,
        height: i.height,
        aspectRatio: i.aspect_ratio,
        kind: (i.height > i.width ? 'poster' : 'backdrop') as 'poster' | 'backdrop'
      })),
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

export interface TmdbEpisodeCreditsRaw {
  id?: number
  cast?: TmdbCastMember[]
  crew?: (TmdbCrewMember & { department?: string | null })[]
  guest_stars?: TmdbCastMember[]
}

/** Cast, crew, and guest stars for one episode. */
export async function episodeCreditsTmdb(
  tvId: number,
  season: number,
  episode: number
): Promise<import('@shared/types').EpisodeCredits> {
  const data = await tmdbFetch<TmdbEpisodeCreditsRaw>(
    `/tv/${tvId}/season/${season}/episode/${episode}/credits`
  )
  const person = (c: TmdbCastMember, role: 'cast' | 'guest'): import('@shared/types').EpisodeCreditPerson => ({
    personId: c.id,
    name: c.name,
    character: c.character ?? null,
    profilePath: c.profile_path ?? null,
    role
  })
  return {
    cast: (data.cast ?? []).slice(0, 20).map(c => person(c, 'cast')),
    guestStars: (data.guest_stars ?? []).slice(0, 20).map(c => person(c, 'guest')),
    crew: (data.crew ?? []).slice(0, 12).map(c => ({
      personId: c.id,
      name: c.name,
      job: c.job ?? null,
      department: c.department ?? null,
      profilePath: c.profile_path ?? null
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
  if (filters.genreIds?.length) params['with_genres'] = filters.genreIds.join('|')
  if (filters.minRating !== undefined) params['vote_average.gte'] = String(filters.minRating)
  if (filters.fromYear) params[`${dateField}.gte`] = `${filters.fromYear}-01-01`
  if (filters.toYear) params[`${dateField}.lte`] = `${filters.toYear}-12-31`
  if (filters.maxRuntime) params['with_runtime.lte'] = String(filters.maxRuntime)

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
  genreIds?: number[]
  minRating?: number
  fromYear?: number
  toYear?: number
  maxRuntime?: number
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

/* ---------- Browse rows: charts, theatricals, person & collection pages ---------- */

async function listOf(path: string, kind: MediaKind): Promise<import('@shared/types').CatalogItem[]> {
  const data = await tmdbFetch<{ results: TmdbMediaResult[] }>(path)
  return data.results
    .filter(r => (kind === 'series' ? r.name : r.title))
    .map(r => tmdbToCatalog(r, kind))
}

/** Trending by media type and window — /trending/all only ever returns one mix. */
export async function trendingByTmdb(
  mediaType: 'movie' | 'tv' | 'all',
  window: 'day' | 'week'
): Promise<import('@shared/types').CatalogItem[]> {
  const path = mediaType === 'all'
    ? `/trending/all/${window}`
    : `/trending/${mediaType}/${window}`
  const data = await tmdbFetch<{ results: TmdbMediaResult[] }>(path)
  return data.results
    .filter(r => r.title || r.name)
    .map(r => tmdbToCatalog(r, (r.media_type === 'tv' ? 'series' : 'movie') as MediaKind))
}

/** Highest-voted, highest-scored titles — a genuinely different slice to Trending. */
export async function topRatedTmdb(
  kind: MediaKind,
  page = 1
): Promise<import('@shared/types').CatalogItem[]> {
  return listOf(`/${kind === 'series' ? 'tv' : 'movie'}/top_rated?page=${page}`, kind)
}

/** What is hot right now, without the week-long smoothing of /trending. */
export async function popularTmdb(
  kind: MediaKind,
  page = 1
): Promise<import('@shared/types').CatalogItem[]> {
  return listOf(`/${kind === 'series' ? 'tv' : 'movie'}/popular?page=${page}`, kind)
}

/** Currently in cinemas. */
export async function nowPlayingTmdb(): Promise<import('@shared/types').CatalogItem[]> {
  return listOf('/movie/now_playing', 'movie')
}

/** Coming soon. */
export async function upcomingTmdb(): Promise<import('@shared/types').CatalogItem[]> {
  return listOf('/movie/upcoming', 'movie')
}

/**
 * Shows with an episode in the next seven days. The old implementation asked
 * for /tv/week, which is not a TMDB endpoint and always returned 404.
 */
export async function onTheAirTmdb(): Promise<import('@shared/types').CatalogItem[]> {
  return listOf('/tv/on_the_air', 'series')
}

/** Shows with an episode airing today. */
export async function airingTodayTmdb(): Promise<import('@shared/types').CatalogItem[]> {
  return listOf('/tv/airing_today', 'series')
}

/* ---------- People ---------- */

export interface TmdbPerson {
  id: number
  name: string
  biography: string | null
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  profile_path: string | null
  known_for_department?: string
  popularity?: number
}

export interface TmdbPersonCredit {
  id: number
  title?: string
  name?: string
  character?: string
  job?: string
  department?: string
  media_type?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
}

export interface PersonDetails extends TmdbPerson {
  also_known_as: string[]
  credits: import('@shared/types').BoardRowSummary[]
}

function toCredit(
  c: TmdbPersonCredit & { kind: MediaKind }
): import('@shared/types').BoardRowSummary {
  return {
    id: c.id,
    title: (c.kind === 'series' ? c.name : c.title) ?? 'Untitled',
    kind: c.kind,
    year: Number((c.release_date ?? c.first_air_date ?? '').slice(0, 4)) || null,
    posterPath: c.poster_path ?? null,
    character: c.character ?? c.job ?? null,
    voteAverage: c.vote_average ?? null
  }
}

/**
 * A person's filmography across both media types, newest first.
 * The existing `people` table has a tmdb_person_id column that nothing has
 * ever populated — this finally wires it up and makes the "most watched
 * people" chart real.
 */
export async function personTmdb(personId: number): Promise<PersonDetails> {
  const data = await tmdbFetch<TmdbPerson & {
    also_known_as?: string[]
    combined_credits?: { cast?: TmdbPersonCredit[]; crew?: TmdbPersonCredit[] }
  }>(`/person/${personId}?append_to_response=combined_credits`)

  const cast = (data.combined_credits?.cast ?? []).map(c => ({
    ...c,
    kind: (c.media_type === 'tv' ? 'series' : 'movie') as MediaKind
  }))
  const crew = (data.combined_credits?.crew ?? [])
    .filter(c => c.job === 'Director')
    .map(c => ({
      ...c,
      kind: (c.media_type === 'tv' ? 'series' : 'movie') as MediaKind
    }))

  const merged = new Map<number, TmdbPersonCredit & { kind: MediaKind }>()
  for (const c of [...cast, ...crew]) if (!merged.has(c.id)) merged.set(c.id, c)

  const credits = [...merged.values()]
    .map(toCredit)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

  return {
    ...data,
    also_known_as: data.also_known_as ?? [],
    credits
  }
}

/* ---------- Collections / franchises ---------- */

export interface CollectionDetails {
  id: number
  name: string
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  parts: import('@shared/types').BoardRowSummary[]
}

/** Every instalment in a franchise, in release order. */
export async function collectionTmdb(collectionId: number): Promise<CollectionDetails> {
  const data = await tmdbFetch<{
    id: number
    name: string
    overview: string | null
    poster_path: string | null
    backdrop_path: string | null
    parts: TmdbMediaResult[]
  }>(`/collection/${collectionId}`)
  const parts = (data.parts ?? [])
    .filter(r => r.title || r.name)
    .map(r => {
      const kind = (r.name ? 'series' : 'movie') as MediaKind
      return {
        id: r.id,
        title: (kind === 'series' ? r.name : r.title) ?? 'Untitled',
        kind,
        year: Number((kind === 'series' ? (r.first_air_date ?? '') : (r.release_date ?? '')).slice(0, 4)) || null,
        posterPath: r.poster_path ?? null,
        character: null,
        voteAverage: r.vote_average ?? null
      }
    })
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))

  return {
    id: data.id,
    name: data.name,
    overview: data.overview ?? null,
    poster_path: data.poster_path ?? null,
    backdrop_path: data.backdrop_path ?? null,
    parts
  }
}

/* ---------- IMDb cross-reference ---------- */

/**
 * Resolves an IMDb id to the matching TMDB title. This is what makes
 * "import by IMDb id" possible and gives the IMDb CSV importer a fallback when
 * the bundled catalog has no match.
 */
export async function findByImdbTmdb(
  imdbId: string
): Promise<{ movieId: number | null; tvId: number | null }> {
  const clean = imdbId.trim().replace(/^tt/, '')
  if (!/^\d+$/.test(clean)) return { movieId: null, tvId: null }
  const data = await tmdbFetch<{
    movie_results?: { id: number }[]
    tv_results?: { id: number }[]
  }>(`/find/tt${clean}?external_source=imdb_id`)
  return {
    movieId: data.movie_results?.[0]?.id ?? null,
    tvId: data.tv_results?.[0]?.id ?? null
  }
}

/* ---------- Episode groups (breaking-show numbering) ---------- */

export interface EpisodeGroup {
  id: number
  name: string
  description: string | null
  type: number
  groupCount: number
}

/**
 * Scene vs absolute numbering. On shows like Arrow or Breaking Bad, "S1E5"
 * in a scene-ordered listing maps to a different absolute episode number; this
 * is what lets the episode grid line up with whatever release the user watches.
 */
export async function episodeGroupsTmdb(tvId: number): Promise<EpisodeGroup[]> {
  const data = await tmdbFetch<{
    results?: { id: number; name: string; description: string | null; type: number; group_count: number }[]
  }>(`/tv/${tvId}/episode_groups`)
  return (data.results ?? []).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    type: g.type,
    groupCount: g.group_count ?? 0
  }))
}

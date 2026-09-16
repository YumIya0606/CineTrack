export const APP_NAME = 'CineTrack'

export type MediaKind = 'movie' | 'series'

export type WatchStatus = 'watching' | 'planned' | 'completed' | 'dropped' | 'rewatching'

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
  genreId?: number
  minRating?: number
  fromYear?: number
  toYear?: number
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

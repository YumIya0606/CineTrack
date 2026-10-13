import type {
  CatalogItem,
  LibraryItem,
  Stats,
  tmdbConfig,
  WatchStatus,
  EpisodeLog,
  LiveDetails,
  MediaKind,
  VideoInfo,
  WatchProviders,
  SeasonInfo,
  DiscoverFilters,
  DiscoverPage,
  Genre,
  Collection,
  ViewingEntry,
  NotificationItem,
  BulkAddOptions,
  BulkAddResult,
  BackfillResult,
  BackupStatus,
  BoardFilters,
  BoardSort,
  BoardResult,
  StatusDef,
  PersonDetails,
  CollectionDetails
} from '@shared/types'

/** A subtitle release offered for a title. */
export interface SubtitleCandidate {
  id: string
  release: string
  format: string
  language: string
  languageCode: string
  downloads: number
  hearingImpaired: boolean
  provider: string
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export interface SubtitleTrack {
  key: string
  language: string
  languageCode: string
  release: string
  cues: SubtitleCue[]
}

/** Payload for creating a custom status. */
export interface CreateStatusInput {
  label: string
  color: string
  countsTowardWatchTime: boolean
  derivable: boolean
}

/**
 * The renderer talks to the main process exclusively through this bridge.
 * `window.api` is exposed by the sandboxed preload via contextBridge.
 */

export interface CineTrackApi {
  catalog: {
    search: (q: string, limit?: number) => Promise<CatalogItem[]>
    get: (id: number) => Promise<CatalogItem | null>
    trending: () => Promise<CatalogItem[]>
    ensure: (item: CatalogItem) => Promise<CatalogItem>
  }
  library: {
    list: () => Promise<LibraryItem[]>
    add: (catalogId: number, status: WatchStatus) => Promise<LibraryItem>
    update: (
      libraryId: number,
      patch: Partial<
        Pick<
          LibraryItem,
          'status' | 'rating' | 'notes' | 'watchedAt' | 'episodesTotal' | 'seasonsTotal' | 'episodesRuntime'
        >
      >
    ) => Promise<void>
    remove: (libraryId: number) => Promise<void>
    logEpisode: (libraryId: number, season: number, episode: number) => Promise<EpisodeLog>
    episodes: (libraryId: number) => Promise<EpisodeLog[]>
    importImdb: () => Promise<{ imported: number; skipped: number }>
    logViewing: (libraryId: number, watchedAt?: string) => Promise<void>
    viewings: (libraryId: number) => Promise<ViewingEntry[]>
    bulkAdd: (
      items: CatalogItem[],
      status: WatchStatus,
      opts?: BulkAddOptions
    ) => Promise<BulkAddResult>
    backfill: () => Promise<BackfillResult>
    board: (filters: BoardFilters, sort?: BoardSort) => Promise<BoardResult>
  }
  statuses: {
    list: () => Promise<StatusDef[]>
    rows: () => Promise<StatusDef[]>
    create: (input: CreateStatusInput) => Promise<StatusDef>
    update: (
      id: number,
      patch: Partial<
        Pick<StatusDef, 'label' | 'color' | 'countsTowardWatchTime' | 'derivable' | 'position'>
      >
    ) => Promise<StatusDef[]>
    remove: (id: number) => Promise<{ reassigned: number; statuses: StatusDef[] }>
    reorder: (order: { id: number; position: number }[]) => Promise<StatusDef[]>
  }
  stats: {
    get: () => Promise<Stats>
  }
  settings: {
    get: <T>(key: string) => Promise<T | null>
    set: <T>(key: string, value: T) => Promise<void>
  }
  tmdb: {
    status: () => Promise<tmdbConfig>
    search: (q: string, kind?: MediaKind) => Promise<CatalogItem[]>
    trending: () => Promise<CatalogItem[]>
    details: (tmdbId: number, kind: MediaKind) => Promise<LiveDetails>
    trailer: (tmdbId: number, kind: MediaKind) => Promise<VideoInfo | null>
    providers: (tmdbId: number, kind: MediaKind) => Promise<WatchProviders>
    season: (tmdbId: number, season: number) => Promise<SeasonInfo>
    discover: (filters: DiscoverFilters, page?: number) => Promise<DiscoverPage>
    genres: () => Promise<Record<MediaKind, Genre[]>>
    trendingBy: (
      mediaType: 'movie' | 'tv' | 'all',
      window: 'day' | 'week'
    ) => Promise<CatalogItem[]>
    topRated: (kind: MediaKind) => Promise<CatalogItem[]>
    nowPlaying: () => Promise<CatalogItem[]>
    upcoming: () => Promise<CatalogItem[]>
    onTheAir: (window: 'day' | 'week') => Promise<CatalogItem[]>
    person: (id: number) => Promise<PersonDetails>
    collection: (id: number) => Promise<CollectionDetails>
    findImdb: (imdbId: string) => Promise<{ movieId: number | null; tvId: number | null }>
    episodeGroups: (
      tvId: number
    ) => Promise<{ id: number; name: string; description: string | null; type: number; groupCount: number }[]>
  }
  subtitles: {
    search: (
      imdbId: string,
      season?: number | null,
      episode?: number | null,
      languageCode?: string
    ) => Promise<SubtitleCandidate[]>
    load: (
      candidate: SubtitleCandidate,
      tmdbId: number,
      kind: MediaKind,
      season?: number | null,
      episode?: number | null
    ) => Promise<SubtitleTrack>
    cached: (
      tmdbId: number,
      kind: MediaKind,
      languageCode: string,
      season?: number | null,
      episode?: number | null
    ) => Promise<SubtitleTrack | null>
    stats: () => Promise<{ files: number; bytes: number }>
    clear: () => Promise<{ files: number }>
  }
  collections: {
    list: () => Promise<Collection[]>
    create: (name: string, description: string | null) => Promise<Collection>
    rename: (id: number, name: string, description: string | null) => Promise<void>
    delete: (id: number) => Promise<void>
    items: (id: number) => Promise<CatalogItem[]>
    add: (collectionId: number, item: CatalogItem) => Promise<void>
    remove: (collectionId: number, catalogId: number) => Promise<void>
    containing: (catalogId: number) => Promise<number[]>
  }
  notifications: {
    list: () => Promise<NotificationItem[]>
    dismiss: (id: number) => Promise<void>
    check: () => Promise<NotificationItem[]>
  }
  backup: {
    export: (passphrase: string) => Promise<{ path: string; size: number }>
    import: (passphrase: string) => Promise<{ size: number }>
    setFolder: () => Promise<string | null>
    status: () => Promise<BackupStatus>
    setOnExit: (on: boolean) => Promise<void>
    auto: (passphrase: string, folder: string) => Promise<{ path: string; size: number }>
  }
  app: {
    openDataDir: () => Promise<void>
    version: () => Promise<string>
  },
  adblock: {
    set: (on: boolean) => Promise<void>
    status: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    api: CineTrackApi
  }
}

export const api: CineTrackApi = window.api

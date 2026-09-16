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
  NotificationItem
} from '@shared/types'

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
      patch: Partial<Pick<LibraryItem, 'status' | 'rating' | 'notes' | 'watchedAt'>>
    ) => Promise<void>
    remove: (libraryId: number) => Promise<void>
    logEpisode: (libraryId: number, season: number, episode: number) => Promise<EpisodeLog>
    episodes: (libraryId: number) => Promise<EpisodeLog[]>
    importImdb: () => Promise<{ imported: number; skipped: number }>
    logViewing: (libraryId: number) => Promise<void>
    viewings: (libraryId: number) => Promise<ViewingEntry[]>
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
  }
  app: {
    openDataDir: () => Promise<void>
    version: () => Promise<string>
  }
}

declare global {
  interface Window {
    api: CineTrackApi
  }
}

export const api: CineTrackApi = window.api

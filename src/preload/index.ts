import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
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

const api = {
  catalog: {
    search: (q: string, limit?: number): Promise<CatalogItem[]> =>
      ipcRenderer.invoke(IPC.CATALOG_SEARCH, q, limit),
    get: (id: number): Promise<CatalogItem | null> => ipcRenderer.invoke(IPC.CATALOG_GET, id),
    trending: (): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.CATALOG_TRENDING),
    ensure: (item: CatalogItem): Promise<CatalogItem> =>
      ipcRenderer.invoke(IPC.CATALOG_ENSURE, item)
  },
  library: {
    list: (): Promise<LibraryItem[]> => ipcRenderer.invoke(IPC.LIBRARY_LIST),
    add: (catalogId: number, status: WatchStatus): Promise<LibraryItem> =>
      ipcRenderer.invoke(IPC.LIBRARY_ADD, catalogId, status),
    update: (
      libraryId: number,
      patch: Partial<Pick<LibraryItem, 'status' | 'rating' | 'notes' | 'watchedAt'>>
    ): Promise<void> => ipcRenderer.invoke(IPC.LIBRARY_UPDATE, libraryId, patch),
    remove: (libraryId: number): Promise<void> => ipcRenderer.invoke(IPC.LIBRARY_REMOVE, libraryId),
    logEpisode: (libraryId: number, season: number, episode: number): Promise<EpisodeLog> =>
      ipcRenderer.invoke(IPC.LIBRARY_LOG_EPISODE, libraryId, season, episode),
    episodes: (libraryId: number): Promise<EpisodeLog[]> =>
      ipcRenderer.invoke(IPC.LIBRARY_EPISODES, libraryId),
    importImdb: (): Promise<{ imported: number; skipped: number }> =>
      ipcRenderer.invoke(IPC.LIBRARY_IMPORT_IMDB),
    logViewing: (libraryId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.LIBRARY_LOG_VIEWING, libraryId),
    viewings: (libraryId: number): Promise<ViewingEntry[]> =>
      ipcRenderer.invoke(IPC.LIBRARY_VIEWINGS, libraryId)
  },
  stats: {
    get: (): Promise<Stats> => ipcRenderer.invoke(IPC.STATS_GET)
  },
  settings: {
    get: <T>(key: string): Promise<T | null> => ipcRenderer.invoke(IPC.SETTINGS_GET, key),
    set: <T>(key: string, value: T): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, key, value)
  },
  tmdb: {
    status: (): Promise<tmdbConfig> => ipcRenderer.invoke(IPC.TMDB_STATUS),
    search: (q: string, kind?: MediaKind): Promise<CatalogItem[]> =>
      ipcRenderer.invoke(IPC.TMDB_SEARCH, q, kind),
    trending: (): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.TMDB_TRENDING),
    details: (tmdbId: number, kind: MediaKind): Promise<LiveDetails> =>
      ipcRenderer.invoke(IPC.TMDB_DETAILS, tmdbId, kind),
    trailer: (tmdbId: number, kind: MediaKind): Promise<VideoInfo | null> =>
      ipcRenderer.invoke(IPC.TMDB_TRAILER, tmdbId, kind),
    providers: (tmdbId: number, kind: MediaKind): Promise<WatchProviders> =>
      ipcRenderer.invoke(IPC.TMDB_PROVIDERS, tmdbId, kind),
    season: (tmdbId: number, season: number): Promise<SeasonInfo> =>
      ipcRenderer.invoke(IPC.TMDB_SEASON, tmdbId, season),
    discover: (filters: DiscoverFilters, page?: number): Promise<DiscoverPage> =>
      ipcRenderer.invoke(IPC.TMDB_DISCOVER, filters, page),
    genres: (): Promise<Record<MediaKind, Genre[]>> => ipcRenderer.invoke(IPC.TMDB_GENRES)
  },
  collections: {
    list: (): Promise<Collection[]> => ipcRenderer.invoke(IPC.COLLECTION_LIST),
    create: (name: string, description: string | null): Promise<Collection> =>
      ipcRenderer.invoke(IPC.COLLECTION_CREATE, name, description),
    rename: (id: number, name: string, description: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.COLLECTION_RENAME, id, name, description),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.COLLECTION_DELETE, id),
    items: (id: number): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.COLLECTION_ITEMS, id),
    add: (collectionId: number, item: CatalogItem): Promise<void> =>
      ipcRenderer.invoke(IPC.COLLECTION_ADD, collectionId, item),
    remove: (collectionId: number, catalogId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.COLLECTION_REMOVE, collectionId, catalogId),
    containing: (catalogId: number): Promise<number[]> =>
      ipcRenderer.invoke(IPC.COLLECTION_MOVE, catalogId)
  },
  notifications: {
    list: (): Promise<NotificationItem[]> => ipcRenderer.invoke(IPC.NOTIFICATIONS_LIST),
    dismiss: (id: number): Promise<void> => ipcRenderer.invoke(IPC.NOTIFICATIONS_DISMISS, id),
    check: (): Promise<NotificationItem[]> => ipcRenderer.invoke(IPC.NOTIFICATIONS_CHECK)
  },
  backup: {
    export: (passphrase: string): Promise<{ path: string; size: number }> =>
      ipcRenderer.invoke(IPC.BACKUP_EXPORT, passphrase),
    import: (passphrase: string): Promise<{ size: number }> =>
      ipcRenderer.invoke(IPC.BACKUP_IMPORT, passphrase)
  },
  app: {
    openDataDir: (): Promise<void> => ipcRenderer.invoke(IPC.APP_OPEN_DATA_DIR),
    version: (): Promise<string> => ipcRenderer.invoke(IPC.APP_VERSION)
  }
} as const

export type CineTrackApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error fallback for non-isolated context
  window.api = api
}

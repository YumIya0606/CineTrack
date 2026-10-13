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
      patch: Partial<
        Pick<
          LibraryItem,
          'status' | 'rating' | 'notes' | 'watchedAt' | 'episodesTotal' | 'seasonsTotal' | 'episodesRuntime'
        >
      >
    ): Promise<void> => ipcRenderer.invoke(IPC.LIBRARY_UPDATE, libraryId, patch),
    remove: (libraryId: number): Promise<void> => ipcRenderer.invoke(IPC.LIBRARY_REMOVE, libraryId),
    logEpisode: (libraryId: number, season: number, episode: number): Promise<EpisodeLog> =>
      ipcRenderer.invoke(IPC.LIBRARY_LOG_EPISODE, libraryId, season, episode),
    episodes: (libraryId: number): Promise<EpisodeLog[]> =>
      ipcRenderer.invoke(IPC.LIBRARY_EPISODES, libraryId),
    importImdb: (): Promise<{ imported: number; skipped: number }> =>
      ipcRenderer.invoke(IPC.LIBRARY_IMPORT_IMDB),
    logViewing: (libraryId: number, watchedAt?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.LIBRARY_LOG_VIEWING, libraryId, watchedAt),
    viewings: (libraryId: number): Promise<ViewingEntry[]> =>
      ipcRenderer.invoke(IPC.LIBRARY_VIEWINGS, libraryId),
    bulkAdd: (
      items: CatalogItem[],
      status: WatchStatus,
      opts?: BulkAddOptions
    ): Promise<BulkAddResult> => ipcRenderer.invoke(IPC.LIBRARY_BULK_ADD, items, status, opts),
    backfill: (): Promise<BackfillResult> => ipcRenderer.invoke(IPC.LIBRARY_BACKFILL),
    board: (filters: BoardFilters, sort?: BoardSort): Promise<BoardResult> =>
      ipcRenderer.invoke(IPC.LIBRARY_BOARD, filters, sort)
  },
  statuses: {
    list: (): Promise<StatusDef[]> => ipcRenderer.invoke(IPC.STATUS_LIST),
    rows: (): Promise<StatusDef[]> => ipcRenderer.invoke(IPC.STATUS_ROWS),
    create: (input: CreateStatusInput): Promise<StatusDef> =>
      ipcRenderer.invoke(IPC.STATUS_CREATE, input),
    update: (
      id: number,
      patch: Partial<Pick<StatusDef, 'label' | 'color' | 'countsTowardWatchTime' | 'derivable' | 'position'>>
    ): Promise<StatusDef[]> => ipcRenderer.invoke(IPC.STATUS_UPDATE, id, patch),
    remove: (id: number): Promise<{ reassigned: number; statuses: StatusDef[] }> =>
      ipcRenderer.invoke(IPC.STATUS_DELETE, id),
    reorder: (order: { id: number; position: number }[]): Promise<StatusDef[]> =>
      ipcRenderer.invoke(IPC.STATUS_REORDER, order)
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
    genres: (): Promise<Record<MediaKind, Genre[]>> => ipcRenderer.invoke(IPC.TMDB_GENRES),
    trendingBy: (
      mediaType: 'movie' | 'tv' | 'all',
      window: 'day' | 'week'
    ): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.TMDB_TRENDING_BY, mediaType, window),
    topRated: (kind: MediaKind): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.TMDB_TOP_RATED, kind),
    nowPlaying: (): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.TMDB_NOW_PLAYING),
    upcoming: (): Promise<CatalogItem[]> => ipcRenderer.invoke(IPC.TMDB_UPCOMING),
    onTheAir: (window: 'day' | 'week'): Promise<CatalogItem[]> =>
      ipcRenderer.invoke(IPC.TMDB_ON_THE_AIR, window),
    person: (id: number): Promise<PersonDetails> => ipcRenderer.invoke(IPC.TMDB_PERSON, id),
    collection: (id: number): Promise<CollectionDetails> =>
      ipcRenderer.invoke(IPC.TMDB_COLLECTION, id),
    findImdb: (imdbId: string): Promise<{ movieId: number | null; tvId: number | null }> =>
      ipcRenderer.invoke(IPC.TMDB_FIND_IMDB, imdbId),
    episodeGroups: (tvId: number): Promise<{ id: number; name: string; description: string | null; type: number; groupCount: number }[]> =>
      ipcRenderer.invoke(IPC.TMDB_EPISODE_GROUPS, tvId)
  },
  subtitles: {
    search: (
      imdbId: string,
      season?: number | null,
      episode?: number | null,
      languageCode?: string
    ): Promise<SubtitleCandidate[]> =>
      ipcRenderer.invoke(IPC.SUBTITLES_SEARCH, imdbId, season, episode, languageCode),
    load: (
      candidate: SubtitleCandidate,
      tmdbId: number,
      kind: MediaKind,
      season?: number | null,
      episode?: number | null
    ): Promise<SubtitleTrack> =>
      ipcRenderer.invoke(IPC.SUBTITLES_LOAD, candidate, tmdbId, kind, season, episode),
    cached: (
      tmdbId: number,
      kind: MediaKind,
      languageCode: string,
      season?: number | null,
      episode?: number | null
    ): Promise<SubtitleTrack | null> =>
      ipcRenderer.invoke(IPC.SUBTITLES_CACHED, tmdbId, kind, languageCode, season, episode),
    stats: (): Promise<{ files: number; bytes: number }> =>
      ipcRenderer.invoke(IPC.SUBTITLES_STATS),
    clear: (): Promise<{ files: number }> => ipcRenderer.invoke(IPC.SUBTITLES_CLEAR)
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
      ipcRenderer.invoke(IPC.BACKUP_IMPORT, passphrase),
    setFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.BACKUP_SET_FOLDER),
    status: (): Promise<BackupStatus> => ipcRenderer.invoke(IPC.BACKUP_STATUS),
    setOnExit: (on: boolean): Promise<void> => ipcRenderer.invoke(IPC.BACKUP_SET_ON_EXIT, on),
    auto: (passphrase: string, folder: string): Promise<{ path: string; size: number }> =>
      ipcRenderer.invoke(IPC.BACKUP_AUTO, passphrase, folder)
  },
  app: {
    openDataDir: (): Promise<void> => ipcRenderer.invoke(IPC.APP_OPEN_DATA_DIR),
    version: (): Promise<string> => ipcRenderer.invoke(IPC.APP_VERSION)
  },
  adblock: {
    set: (on: boolean): Promise<void> => ipcRenderer.invoke(IPC.ADBLOCK_SET, on),
    status: (): Promise<boolean> => ipcRenderer.invoke(IPC.ADBLOCK_STATUS)
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

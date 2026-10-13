import { ipcMain, dialog, shell, app } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  MediaKind,
  WatchStatus,
  DiscoverFilters,
  Collection,
  NotificationItem
} from '@shared/types'
import { getDataDir } from '../db'
import {
  searchCatalog,
  getCatalogItem,
  getTrending,
  ensureCatalogItem,
  listLibrary,
  addToLibrary,
  updateLibrary,
  removeFromLibrary,
  logEpisode,
  listEpisodes,
  getStats,
  getSetting,
  setSetting
} from '../db/queries'
import {
  getTmdbConfig,
  searchTmdb,
  trendingTmdb,
  detailsTmdb,
  tmdbToCatalog,
  trailerTmdb,
  watchProvidersTmdb,
  seasonTmdb,
  discoverTmdb,
  genresTmdb,
  trendingByTmdb,
  topRatedTmdb,
  nowPlayingTmdb,
  upcomingTmdb,
  onTheAirTmdb,
  personTmdb,
  collectionTmdb,
  findByImdbTmdb,
  episodeGroupsTmdb
} from '../tmdb/client'
import {
  searchSubtitles,
  loadSubtitle,
  readCachedTrack,
  subtitleCacheKey,
  cacheStats,
  clearSubtitleCache
} from '../subtitles/client'
import type { SubtitleCandidate } from '../subtitles/client'
import type { LiveDetails, CatalogItem } from '@shared/types'
import {
  listCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  listCollectionItems,
  addToCollection,
  removeFromCollection,
  collectionsForItem
} from '../db/collections'
import { logViewing, listViewings } from '../db/viewings'
import { bulkAddToLibrary, backfillRuntimes, enrichCatalogRow, enrichForLibraryRow } from '../db/bulk'
import { queryBoard } from '../db/board'
import {
  listStatuses,
  listStatusRows,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses
} from '../db/statuses'
import type { CreateStatusInput } from '../db/statuses'
import { setAdBlockerEnabled, isAdBlockerEnabled } from '../adblock'
import {
  listPendingNotifications,
  dismissNotification
} from '../db/notifications'
import { checkAndFireNotifications, setNotificationsEnabled } from '../notifications'
import {
  exportBackup,
  importBackup,
  chooseBackupFolder,
  getBackupStatus,
  setBackupOnExit,
  runAutoBackup
} from '../backup'
import type { BulkAddOptions, BoardFilters, BoardSort } from '@shared/types'

export function registerIpcHandlers(): void {
  /* ---------- Catalog (local) ---------- */
  ipcMain.handle(IPC.CATALOG_SEARCH, (_e, q: string, limit?: number) => searchCatalog(q, limit))
  ipcMain.handle(IPC.CATALOG_GET, (_e, id: number) => getCatalogItem(id))
  ipcMain.handle(IPC.CATALOG_TRENDING, () => getTrending())
  ipcMain.handle(IPC.CATALOG_ENSURE, (_e, item) => ensureCatalogItem(item))

  /* ---------- Library ---------- */
  ipcMain.handle(IPC.LIBRARY_LIST, () => listLibrary())
  ipcMain.handle(IPC.LIBRARY_ADD, async (_e, catalogId: number, status: WatchStatus) => {
    // Runtimes arrive here: a movie added from a live search has no runtime,
    // and a series needs its episode count. Fetched once, stored on the row.
    const counts = await enrichCatalogRow(catalogId)
    return addToLibrary(catalogId, status, counts)
  })
  ipcMain.handle(
    IPC.LIBRARY_UPDATE,
    async (
      _e,
      libraryId: number,
      patch: Parameters<typeof updateLibrary>[1]
    ) => {
      if (patch.status === 'completed') {
        const counts = await enrichForLibraryRow(libraryId)
        updateLibrary(libraryId, {
          ...patch,
          // Enrichment returns nulls when TMDB is unreachable or the key
          // expired — writing those over the row wiped the episode totals the
          // user could already see. Only fill in what we actually learned.
          ...(counts.episodesTotal != null ? { episodesTotal: counts.episodesTotal } : {}),
          ...(counts.seasonsTotal != null ? { seasonsTotal: counts.seasonsTotal } : {})
        })
        return
      }
      updateLibrary(libraryId, patch)
    }
  )
  ipcMain.handle(IPC.LIBRARY_REMOVE, (_e, libraryId: number) => removeFromLibrary(libraryId))
  ipcMain.handle(
    IPC.LIBRARY_LOG_EPISODE,
    (_e, libraryId: number, season: number, episode: number) =>
      logEpisode(libraryId, season, episode)
  )
  ipcMain.handle(IPC.LIBRARY_EPISODES, (_e, libraryId: number) => listEpisodes(libraryId))

  ipcMain.handle(
    IPC.LIBRARY_BULK_ADD,
    async (_e, items: CatalogItem[], status: WatchStatus, opts?: BulkAddOptions) =>
      bulkAddToLibrary(items, status, opts ?? {})
  )
  ipcMain.handle(IPC.LIBRARY_BACKFILL, async () => backfillRuntimes())
  ipcMain.handle(
    IPC.LIBRARY_BOARD,
    (_e, filters: BoardFilters, sort?: BoardSort) => queryBoard(filters ?? {}, sort ?? 'updated')
  )

  /* ---------- Status palette ---------- */
  ipcMain.handle(IPC.STATUS_LIST, () => listStatuses())
  ipcMain.handle(IPC.STATUS_ROWS, () => listStatusRows())
  ipcMain.handle(IPC.STATUS_CREATE, (_e, input: CreateStatusInput) => createStatus(input))
  ipcMain.handle(IPC.STATUS_UPDATE, (_e, id: number, patch: Parameters<typeof updateStatus>[1]) => {
    updateStatus(id, patch)
    return listStatuses()
  })
  ipcMain.handle(IPC.STATUS_DELETE, (_e, id: number) => {
    const res = deleteStatus(id)
    return { ...res, statuses: listStatuses() }
  })
  ipcMain.handle(IPC.STATUS_REORDER, (_e, order: { id: number; position: number }[]) => {
    reorderStatuses(order)
    return listStatuses()
  })

  ipcMain.handle(IPC.LIBRARY_IMPORT_IMDB, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import IMDb ratings',
      filters: [{ name: 'IMDb ratings export', extensions: ['csv'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { imported: 0, skipped: 0 }
    const { importImdbRatings } = await import('./imdb')
    return importImdbRatings(result.filePaths[0])
  })

  /* ---------- Stats & settings ---------- */
  ipcMain.handle(IPC.STATS_GET, () => getStats())
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => getSetting(key))
  ipcMain.handle(IPC.SETTINGS_SET, async (_e, key: string, value: unknown) => {
    setSetting(key, value)
    if (key === 'notifications.enabled') setNotificationsEnabled(Boolean(value))
  })

  /* ---------- TMDB ---------- */
  ipcMain.handle(IPC.TMDB_STATUS, () => getTmdbConfig())

  ipcMain.handle(IPC.TMDB_SEARCH, async (_e, q: string, kind?: MediaKind) => {
    if (!getTmdbConfig().connected) return []
    const results = await searchTmdb(q, kind)
    return results.map(r => tmdbToCatalog(r, (r.media_type === 'tv' ? 'series' : 'movie') as MediaKind))
  })

  ipcMain.handle(IPC.TMDB_TRENDING, async () => {
    if (!getTmdbConfig().connected) return []
    const results = await trendingTmdb()
    return results.map(r =>
      tmdbToCatalog(r, ((r.media_type === 'tv' ? 'series' : 'movie') as MediaKind))
    )
  })

  ipcMain.handle(IPC.TMDB_DETAILS, async (_e, tmdbId: number, kind: MediaKind) => {
    const d = await detailsTmdb(tmdbId, kind)
    const base = tmdbToCatalog(d, kind)
    const detail: LiveDetails = {
      ...base,
      tagline: d.tagline ?? null,
      seasons: d.number_of_seasons ?? null,
      episodes: d.number_of_episodes ?? null,
      cast: (d.credits?.cast ?? [])
        .sort((a, b) => a.order - b.order)
        .slice(0, 14)
        .map(c => ({
          name: c.name,
          character: c.character,
          job: null,
          profilePath: c.profile_path
        })),
      crew: (d.credits?.crew ?? [])
        .filter(c => c.job === 'Director' || c.job === 'Creator' || c.job === 'Writer')
        .slice(0, 6)
        .map(c => ({
          name: c.name,
          character: null,
          job: c.job,
          profilePath: c.profile_path
        })),
      similar: (d.recommendations?.results?.length ? d.recommendations.results : d.similar?.results ?? [])
        .slice(0, 10)
        .map(r =>
          tmdbToCatalog(r, (r.media_type === 'tv' ? 'series' : 'movie') as MediaKind)
        )
    }
    return detail
  })

  /* ---------- App ---------- */
  ipcMain.handle(IPC.APP_OPEN_DATA_DIR, async () => {
    shell.openPath(getDataDir())
  })
  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion())

  /* ---------- Ad blocker ---------- */
  ipcMain.handle(IPC.ADBLOCK_SET, async (_e, on: boolean) => {
    await setAdBlockerEnabled(on)
  })
  ipcMain.handle(IPC.ADBLOCK_STATUS, () => isAdBlockerEnabled())

  /* ---------- Live enrichment ---------- */
  ipcMain.handle(IPC.TMDB_TRAILER, async (_e, tmdbId: number, kind: MediaKind) => {
    const v = await trailerTmdb(tmdbId, kind)
    return v ? { key: v.key, name: v.name, site: v.site, type: v.type } : null
  })

  ipcMain.handle(IPC.TMDB_PROVIDERS, async (_e, tmdbId: number, kind: MediaKind) =>
    watchProvidersTmdb(tmdbId, kind)
  )

  ipcMain.handle(IPC.TMDB_SEASON, async (_e, tmdbId: number, season: number) =>
    seasonTmdb(tmdbId, season)
  )

  ipcMain.handle(IPC.TMDB_DISCOVER, async (_e, filters: DiscoverFilters, page?: number) => {
    const kind = filters.kind ?? 'movie'
    const data = await discoverTmdb(filters, page ?? 1)
    return {
      page: data.page,
      totalPages: data.totalPages,
      items: data.results.map(r => tmdbToCatalog(r, kind))
    }
  })

  ipcMain.handle(IPC.TMDB_GENRES, async () => genresTmdb())

  /* ---------- TMDB browse rows, people, collections ---------- */
  ipcMain.handle(
    IPC.TMDB_TRENDING_BY,
    async (_e, mediaType: 'movie' | 'tv' | 'all', window: 'day' | 'week') =>
      trendingByTmdb(mediaType, window)
  )
  ipcMain.handle(IPC.TMDB_TOP_RATED, async (_e, kind: MediaKind) => topRatedTmdb(kind))
  ipcMain.handle(IPC.TMDB_NOW_PLAYING, async () => nowPlayingTmdb())
  ipcMain.handle(IPC.TMDB_UPCOMING, async () => upcomingTmdb())
  ipcMain.handle(IPC.TMDB_ON_THE_AIR, async (_e, window: 'day' | 'week') => onTheAirTmdb(window))
  ipcMain.handle(IPC.TMDB_PERSON, async (_e, id: number) => {
    const p = await personTmdb(id)
    return {
      id: p.id,
      name: p.name,
      biography: p.biography ?? null,
      birthday: p.birthday ?? null,
      deathday: p.deathday ?? null,
      placeOfBirth: p.place_of_birth ?? null,
      profilePath: p.profile_path ?? null,
      alsoKnownAs: p.also_known_as ?? [],
      credits: p.credits
    }
  })
  ipcMain.handle(IPC.TMDB_COLLECTION, async (_e, id: number) => {
    const c = await collectionTmdb(id)
    return {
      id: c.id,
      name: c.name,
      overview: c.overview,
      posterPath: c.poster_path,
      backdropPath: c.backdrop_path,
      parts: c.parts
    }
  })
  ipcMain.handle(IPC.TMDB_FIND_IMDB, async (_e, imdbId: string) => findByImdbTmdb(imdbId))
  ipcMain.handle(IPC.TMDB_EPISODE_GROUPS, async (_e, tvId: number) => episodeGroupsTmdb(tvId))

  /* ---------- Subtitles ---------- */
  ipcMain.handle(
    IPC.SUBTITLES_SEARCH,
    async (
      _e,
      imdbId: string,
      season?: number | null,
      episode?: number | null,
      languageCode?: string
    ) => searchSubtitles(imdbId, season ?? null, episode ?? null, { languageCode })
  )
  ipcMain.handle(
    IPC.SUBTITLES_LOAD,
    async (
      _e,
      candidate: SubtitleCandidate,
      tmdbId: number,
      kind: MediaKind,
      season?: number | null,
      episode?: number | null
    ) => loadSubtitle(candidate, tmdbId, kind, season ?? null, episode ?? null)
  )
  ipcMain.handle(
    IPC.SUBTITLES_CACHED,
    (_e, tmdbId: number, kind: MediaKind, languageCode: string, season?, episode?) =>
      readCachedTrack(subtitleCacheKey(tmdbId, kind, languageCode, season, episode))
  )
  ipcMain.handle(IPC.SUBTITLES_STATS, () => cacheStats())
  ipcMain.handle(IPC.SUBTITLES_CLEAR, () => clearSubtitleCache())

  /* ---------- Collections (user lists) ---------- */
  ipcMain.handle(IPC.COLLECTION_LIST, (): Collection[] => listCollections())
  ipcMain.handle(IPC.COLLECTION_CREATE, (_e, name: string, description: string | null) =>
    createCollection(name, description)
  )
  ipcMain.handle(
    IPC.COLLECTION_RENAME,
    (_e, id: number, name: string, description: string | null) =>
      renameCollection(id, name, description)
  )
  ipcMain.handle(IPC.COLLECTION_DELETE, (_e, id: number) => deleteCollection(id))
  ipcMain.handle(IPC.COLLECTION_ITEMS, (_e, id: number) => listCollectionItems(id))
  ipcMain.handle(IPC.COLLECTION_ADD, (_e, collectionId: number, item: CatalogItem) => {
    const catalogId = item.id > 0 ? item.id : ensureCatalogItem(item).id
    addToCollection(collectionId, catalogId)
  })
  ipcMain.handle(IPC.COLLECTION_REMOVE, (_e, collectionId: number, catalogId: number) =>
    removeFromCollection(collectionId, catalogId)
  )
  ipcMain.handle(IPC.COLLECTION_MOVE, (_e, catalogId: number) => collectionsForItem(catalogId))

  /* ---------- Rewatch / viewing log ---------- */
  ipcMain.handle(IPC.LIBRARY_LOG_VIEWING, (_e, libraryId: number, watchedAt?: string) =>
    logViewing(libraryId, watchedAt)
  )
  ipcMain.handle(IPC.LIBRARY_VIEWINGS, (_e, libraryId: number) => listViewings(libraryId))

  /* ---------- Notifications ---------- */
  ipcMain.handle(IPC.NOTIFICATIONS_LIST, (): NotificationItem[] => listPendingNotifications())
  ipcMain.handle(IPC.NOTIFICATIONS_DISMISS, (_e, id: number) => dismissNotification(id))
  ipcMain.handle(IPC.NOTIFICATIONS_CHECK, async () => checkAndFireNotifications())

  /* ---------- Encrypted backup ---------- */
  ipcMain.handle(IPC.BACKUP_EXPORT, async (_e, passphrase: string) => exportBackup(passphrase))
  ipcMain.handle(IPC.BACKUP_IMPORT, async (_e, passphrase: string) => importBackup(passphrase))
  ipcMain.handle(IPC.BACKUP_SET_FOLDER, async () => chooseBackupFolder())
  ipcMain.handle(IPC.BACKUP_STATUS, () => getBackupStatus())
  ipcMain.handle(IPC.BACKUP_SET_ON_EXIT, (_e, on: boolean) => setBackupOnExit(on))
  ipcMain.handle(IPC.BACKUP_AUTO, async (_e, passphrase: string, folder: string) =>
    runAutoBackup(passphrase, folder)
  )
}

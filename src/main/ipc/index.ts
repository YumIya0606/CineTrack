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
  genresTmdb
} from '../tmdb/client'
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
import {
  listPendingNotifications,
  dismissNotification
} from '../db/notifications'
import { checkForNotifications, setNotificationsEnabled } from '../notifications'
import { exportBackup, importBackup } from '../backup'

export function registerIpcHandlers(): void {
  /* ---------- Catalog (local) ---------- */
  ipcMain.handle(IPC.CATALOG_SEARCH, (_e, q: string, limit?: number) => searchCatalog(q, limit))
  ipcMain.handle(IPC.CATALOG_GET, (_e, id: number) => getCatalogItem(id))
  ipcMain.handle(IPC.CATALOG_TRENDING, () => getTrending())
  ipcMain.handle(IPC.CATALOG_ENSURE, (_e, item) => ensureCatalogItem(item))

  /* ---------- Library ---------- */
  ipcMain.handle(IPC.LIBRARY_LIST, () => listLibrary())
  ipcMain.handle(IPC.LIBRARY_ADD, (_e, catalogId: number, status: WatchStatus) =>
    addToLibrary(catalogId, status)
  )
  ipcMain.handle(
    IPC.LIBRARY_UPDATE,
    (
      _e,
      libraryId: number,
      patch: Parameters<typeof updateLibrary>[1]
    ) => updateLibrary(libraryId, patch)
  )
  ipcMain.handle(IPC.LIBRARY_REMOVE, (_e, libraryId: number) => removeFromLibrary(libraryId))
  ipcMain.handle(
    IPC.LIBRARY_LOG_EPISODE,
    (_e, libraryId: number, season: number, episode: number) =>
      logEpisode(libraryId, season, episode)
  )
  ipcMain.handle(IPC.LIBRARY_EPISODES, (_e, libraryId: number) => listEpisodes(libraryId))

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
  ipcMain.handle(IPC.LIBRARY_LOG_VIEWING, (_e, libraryId: number) =>
    logViewing(libraryId)
  )
  ipcMain.handle(IPC.LIBRARY_VIEWINGS, (_e, libraryId: number) => listViewings(libraryId))

  /* ---------- Notifications ---------- */
  ipcMain.handle(IPC.NOTIFICATIONS_LIST, (): NotificationItem[] => listPendingNotifications())
  ipcMain.handle(IPC.NOTIFICATIONS_DISMISS, (_e, id: number) => dismissNotification(id))
  ipcMain.handle(IPC.NOTIFICATIONS_CHECK, async () => checkForNotifications())

  /* ---------- Encrypted backup ---------- */
  ipcMain.handle(IPC.BACKUP_EXPORT, async (_e, passphrase: string) => exportBackup(passphrase))
  ipcMain.handle(IPC.BACKUP_IMPORT, async (_e, passphrase: string) => importBackup(passphrase))
}

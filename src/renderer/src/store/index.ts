import { create } from 'zustand'
import { api } from '../lib/api'
import type { CreateStatusInput } from '../lib/api'
import type {
  CatalogItem,
  LibraryItem,
  Stats,
  WatchStatus,
  Collection,
  NotificationItem,
  BulkAddOptions,
  BulkAddResult,
  BackfillResult,
  StatusDef
} from '@shared/types'

export type View = 'home' | 'discover' | 'board' | 'library' | 'watchlist' | 'lists' | 'stats'

interface UIState {
  view: View
  detailItem: LibraryItem | CatalogItem | null
  commandOpen: boolean
  bulkOpen: boolean
  settingsOpen: boolean
  statsOpen: boolean
  loading: boolean
  reduceMotion: boolean

  setView: (view: View) => void
  openDetail: (item: LibraryItem | CatalogItem) => void
  closeDetail: () => void
  setCommandOpen: (open: boolean) => void
  setBulkOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setStatsOpen: (open: boolean) => void
  setLoading: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
}

interface DataState {
  library: LibraryItem[]
  /**
   * Lookup index over `library`, keyed by TMDB id and by catalog id. Every
   * poster used to subscribe to the whole array and run its own `.find()` —
   * N cards × N rows on every mutation. Cards now read a single key from here.
   */
  libraryIndex: Map<string, LibraryItem>
  trending: CatalogItem[]
  stats: Stats | null

  loadLibrary: () => Promise<void>
  loadTrending: () => Promise<void>
  loadStats: () => Promise<void>
  addItem: (item: CatalogItem, status: WatchStatus) => Promise<void>
  bulkAdd: (items: CatalogItem[], status: WatchStatus, opts?: BulkAddOptions) => Promise<BulkAddResult>
  backfillRuntimes: () => Promise<BackfillResult>
  updateItem: (
    libraryId: number,
    patch: Partial<
      Pick<
        LibraryItem,
        'status' | 'rating' | 'notes' | 'watchedAt' | 'episodesTotal' | 'seasonsTotal' | 'episodesRuntime'
      >
    >
  ) => Promise<void>
  removeItem: (libraryId: number) => Promise<void>
  logEpisode: (libraryId: number, season: number, episode: number) => Promise<void>
}

interface CollectionsState {
  collections: Collection[]
  /**
   * Bumped whenever a shelf's membership changes. ListsView listens to it so a
   * title added from the detail panel appears in the grid without leaving and
   * re-entering the tab.
   */
  itemsVersion: number
  loadCollections: () => Promise<void>
  createCollection: (name: string, description: string | null) => Promise<void>
  renameCollection: (id: number, name: string, description: string | null) => Promise<void>
  deleteCollection: (id: number) => Promise<void>
  bumpItems: () => void
}

interface NotificationsState {
  notifications: NotificationItem[]
  loadNotifications: () => Promise<void>
  dismiss: (id: number) => Promise<void>
  /** Clears the whole bell in one reload — avoids N racing list refreshes. */
  dismissAll: () => Promise<void>
}

interface StatusesState {
  statuses: StatusDef[]
  /** Keyed lookup so pills and chips don't scan the array on every render. */
  byKey: Record<string, StatusDef>
  loadStatuses: () => Promise<void>
  createStatus: (input: CreateStatusInput) => Promise<StatusDef>
  updateStatus: (
    id: number,
    patch: Partial<Pick<StatusDef, 'label' | 'color' | 'countsTowardWatchTime' | 'derivable' | 'position'>>
  ) => Promise<void>
  deleteStatus: (id: number) => Promise<number>
  reorderStatuses: (order: { id: number; position: number }[]) => Promise<void>
}

export const useUI = create<UIState>(set => ({
  view: 'home',
  detailItem: null,
  commandOpen: false,
  bulkOpen: false,
  settingsOpen: false,
  statsOpen: false,
  loading: true,
  reduceMotion: false,

  setView: view => set({ view }),
  openDetail: item => set({ detailItem: item }),
  closeDetail: () => set({ detailItem: null }),
  setCommandOpen: open => set({ commandOpen: open }),
  setBulkOpen: open => set({ bulkOpen: open }),
  setSettingsOpen: open => set({ settingsOpen: open }),
  setStatsOpen: open => set({ statsOpen: open }),
  setLoading: on => set({ loading: on }),
  setReduceMotion: on => set({ reduceMotion: on })
}))

/** Index key for a title: TMDB id wins, then catalog id. */
export function libraryKey(id: number, tmdbId: number | null): string {
  return tmdbId != null ? `t${tmdbId}` : `d${id}`
}

function buildIndex(library: LibraryItem[]): Map<string, LibraryItem> {
  const map = new Map<string, LibraryItem>()
  for (const item of library) {
    map.set(libraryKey(item.id, item.tmdbId), item)
  }
  return map
}

/**
 * Reuses the previous object when nothing a card renders has changed. The DB
 * returns fresh objects on every query, so without this every reload gave
 * PosterCard new props and defeated its `memo` — one add re-rendered the
 * entire grid.
 */
function reconcileLibrary(prev: LibraryItem[], next: LibraryItem[]): LibraryItem[] {
  const prevByKey = buildIndex(prev)
  return next.map(item => {
    const old = prevByKey.get(libraryKey(item.id, item.tmdbId))
    if (!old) return item
    if (
      old.status === item.status &&
      old.rating === item.rating &&
      old.notes === item.notes &&
      old.watchedAt === item.watchedAt &&
      old.updatedAt === item.updatedAt &&
      old.episodesWatched === item.episodesWatched &&
      old.episodesTotal === item.episodesTotal &&
      old.playCount === item.playCount
    ) {
      return old
    }
    return item
  })
}

export const useData = create<DataState>((set, get) => ({
  library: [],
  libraryIndex: new Map(),
  trending: [],
  stats: null,

  loadLibrary: async () => {
    const fresh = await api.library.list()
    const library = reconcileLibrary(get().library, fresh)
    set({ library, libraryIndex: buildIndex(library) })
  },

  loadTrending: async () => {
    const trending = await api.catalog.trending()
    set({ trending })
  },

  loadStats: async () => {
    const stats = await api.stats.get()
    set({ stats })
  },

  addItem: async (item, status) => {
    // Live TMDB results arrive with id 0 — persist them to the local catalog
    // before they can join the library.
    const catalogId = item.id > 0 ? item.id : (await api.catalog.ensure(item)).id
    await api.library.add(catalogId, status)
    await get().loadLibrary()
    await get().loadStats()
  },

  bulkAdd: async (items, status, opts) => {
    const result = await api.library.bulkAdd(items, status, opts)
    await get().loadLibrary()
    await get().loadStats()
    return result
  },

  backfillRuntimes: async () => {
    const result = await api.library.backfill()
    await get().loadLibrary()
    await get().loadStats()
    return result
  },

  updateItem: async (libraryId, patch) => {
    await api.library.update(libraryId, patch)
    await get().loadLibrary()
    await get().loadStats()
  },

  removeItem: async libraryId => {
    await api.library.remove(libraryId)
    await get().loadLibrary()
    await get().loadStats()
  },

  logEpisode: async (libraryId, season, episode) => {
    await api.library.logEpisode(libraryId, season, episode)
    await get().loadLibrary()
    await get().loadStats()
  }
}))

export const useCollections = create<CollectionsState>((set, get) => ({
  collections: [],
  itemsVersion: 0,

  loadCollections: async () => {
    const collections = await api.collections.list()
    set({ collections })
  },

  bumpItems: () => set(s => ({ itemsVersion: s.itemsVersion + 1 })),

  createCollection: async (name, description) => {
    await api.collections.create(name, description)
    await get().loadCollections()
  },

  renameCollection: async (id, name, description) => {
    await api.collections.rename(id, name, description)
    await get().loadCollections()
  },

  deleteCollection: async id => {
    await api.collections.delete(id)
    await get().loadCollections()
  }
}))

export const useNotifications = create<NotificationsState>((set, get) => ({
  notifications: [],

  loadNotifications: async () => {
    const notifications = await api.notifications.list()
    set({ notifications })
  },

  dismiss: async id => {
    await api.notifications.dismiss(id)
    await get().loadNotifications()
  },

  // "Clear all" used to fan out dismiss() per notification, and each one ran
  // its own full list reload. A response fetched before a later delete landed
  // last and repopulated the rows the user had just cleared.
  dismissAll: async () => {
    const ids = get().notifications.map(n => n.id)
    await Promise.all(ids.map(id => api.notifications.dismiss(id)))
    set({ notifications: [] })
    await get().loadNotifications()
  }
}))

function indexStatuses(list: StatusDef[]): Record<string, StatusDef> {
  const map: Record<string, StatusDef> = {}
  for (const s of list) map[s.key] = s
  return map
}

export const useStatuses = create<StatusesState>((set, get) => ({
  statuses: [],
  byKey: {},

  loadStatuses: async () => {
    const statuses = await api.statuses.list()
    set({ statuses, byKey: indexStatuses(statuses) })
  },

  createStatus: async input => {
    const created = await api.statuses.create(input)
    await get().loadStatuses()
    // Refresh anything that renders statuses so a new one shows immediately.
    await useData.getState().loadLibrary()
    return created
  },

  updateStatus: async (id, patch) => {
    const statuses = await api.statuses.update(id, patch)
    set({ statuses, byKey: indexStatuses(statuses) })
    // A rename or a "counts toward watch time" change alters every chip and
    // the stats totals, so refresh the derived data too.
    await useData.getState().loadLibrary()
    await useData.getState().loadStats()
  },

  deleteStatus: async id => {
    const res = await api.statuses.remove(id)
    set({ statuses: res.statuses, byKey: indexStatuses(res.statuses) })
    await useData.getState().loadLibrary()
    await useData.getState().loadStats()
    return res.reassigned
  },

  reorderStatuses: async order => {
    const statuses = await api.statuses.reorder(order)
    set({ statuses, byKey: indexStatuses(statuses) })
  }
}))

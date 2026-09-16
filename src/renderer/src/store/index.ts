import { create } from 'zustand'
import { api } from '../lib/api'
import type {
  CatalogItem,
  LibraryItem,
  Stats,
  WatchStatus,
  Collection,
  NotificationItem
} from '@shared/types'

export type View = 'home' | 'discover' | 'library' | 'watchlist' | 'lists' | 'stats'

interface UIState {
  view: View
  detailItem: LibraryItem | CatalogItem | null
  commandOpen: boolean
  settingsOpen: boolean
  statsOpen: boolean
  loading: boolean
  reduceMotion: boolean

  setView: (view: View) => void
  openDetail: (item: LibraryItem | CatalogItem) => void
  closeDetail: () => void
  setCommandOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setStatsOpen: (open: boolean) => void
  setLoading: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
}

interface DataState {
  library: LibraryItem[]
  trending: CatalogItem[]
  stats: Stats | null

  loadLibrary: () => Promise<void>
  loadTrending: () => Promise<void>
  loadStats: () => Promise<void>
  addItem: (item: CatalogItem, status: WatchStatus) => Promise<void>
  updateItem: (
    libraryId: number,
    patch: Partial<Pick<LibraryItem, 'status' | 'rating' | 'notes' | 'watchedAt'>>
  ) => Promise<void>
  removeItem: (libraryId: number) => Promise<void>
  logEpisode: (libraryId: number, season: number, episode: number) => Promise<void>
}

interface CollectionsState {
  collections: Collection[]
  loadCollections: () => Promise<void>
  createCollection: (name: string, description: string | null) => Promise<void>
  renameCollection: (id: number, name: string, description: string | null) => Promise<void>
  deleteCollection: (id: number) => Promise<void>
}

interface NotificationsState {
  notifications: NotificationItem[]
  loadNotifications: () => Promise<void>
  dismiss: (id: number) => Promise<void>
}

export const useUI = create<UIState>(set => ({
  view: 'home',
  detailItem: null,
  commandOpen: false,
  settingsOpen: false,
  statsOpen: false,
  loading: true,
  reduceMotion: false,

  setView: view => set({ view }),
  openDetail: item => set({ detailItem: item }),
  closeDetail: () => set({ detailItem: null }),
  setCommandOpen: open => set({ commandOpen: open }),
  setSettingsOpen: open => set({ settingsOpen: open }),
  setStatsOpen: open => set({ statsOpen: open }),
  setLoading: on => set({ loading: on }),
  setReduceMotion: on => set({ reduceMotion: on })
}))

export const useData = create<DataState>((set, get) => ({
  library: [],
  trending: [],
  stats: null,

  loadLibrary: async () => {
    const library = await api.library.list()
    set({ library })
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

  loadCollections: async () => {
    const collections = await api.collections.list()
    set({ collections })
  },

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
  }
}))

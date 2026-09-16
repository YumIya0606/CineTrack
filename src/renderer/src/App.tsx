import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TopBar from './components/TopBar'
import CommandPalette from './components/CommandPalette'
import DetailPanel from './components/DetailPanel'
import SettingsOverlay from './components/SettingsOverlay'
import LoadingScreen from './components/LoadingScreen'
import HomeView from './views/HomeView'
import DiscoverView from './views/DiscoverView'
import LibraryView from './views/LibraryView'
import WatchlistView from './views/WatchlistView'
import ListsView from './views/ListsView'
import StatsView from './views/StatsView'
import { useUI, useData } from './store'
import { api } from './lib/api'

export default function App() {
  const view = useUI(s => s.view)
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const setSettingsOpen = useUI(s => s.setSettingsOpen)
  const setView = useUI(s => s.setView)
  const detailItem = useUI(s => s.detailItem)
  const closeDetail = useUI(s => s.closeDetail)
  const setLoading = useUI(s => s.setLoading)
  const setReduceMotion = useUI(s => s.setReduceMotion)
  const loadLibrary = useData(s => s.loadLibrary)
  const loadTrending = useData(s => s.loadTrending)
  const loadStats = useData(s => s.loadStats)

  /* Initial boot: hydrate library + apply persisted preferences. */
  useEffect(() => {
    const boot = async () => {
      await Promise.all([loadLibrary(), loadTrending(), loadStats()])
      const quality = await api.settings.get<string>('app.quality')
      if (quality === 'battery') setReduceMotion(true)
      setTimeout(() => setLoading(false), 550)
    }
    boot()
  }, [loadLibrary, loadTrending, loadStats, setLoading, setReduceMotion])

  /* Global keyboard shortcuts. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault()
        setCommandOpen(true)
        return
      }
      if (e.code === 'Slash' && !typing) {
        e.preventDefault()
        setCommandOpen(true)
        return
      }
      if (e.code === 'Escape') {
        if (detailItem) closeDetail()
        return
      }
      if (typing) return

      // Quick view switching: 1–6
      if (e.code === 'Digit1') setView('home')
      if (e.code === 'Digit2') setView('discover')
      if (e.code === 'Digit3') setView('library')
      if (e.code === 'Digit4') setView('watchlist')
      if (e.code === 'Digit5') setView('lists')
      if (e.code === 'Digit6') setView('stats')
      if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) setView('stats')
      if (e.code === 'Comma') setSettingsOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen, setSettingsOpen, setView, detailItem, closeDetail])

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      {/* Ambient backdrop — slow-drifting aurora blobs + grain keep the flat UI alive */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[15%] h-[55vh] w-[55vh] animate-[drift_26s_ease-in-out_infinite] rounded-full bg-gold/[0.07] blur-[90px]" />
        <div className="absolute -right-[5%] top-[25%] h-[45vh] w-[45vh] animate-[drift_34s_ease-in-out_infinite_reverse] rounded-full bg-azure/[0.06] blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[50vh] w-[50vh] animate-[drift_30s_ease-in-out_infinite] rounded-full bg-crimson/[0.05] blur-[110px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.4)_100%)]" />

      <main className="relative h-full overflow-y-auto pt-[84px] pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {view === 'home' && <HomeView />}
            {view === 'discover' && <DiscoverView />}
            {view === 'library' && <LibraryView />}
            {view === 'watchlist' && <WatchlistView />}
            {view === 'lists' && <ListsView />}
            {view === 'stats' && <StatsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <TopBar />

      {/* Overlays */}
      <CommandPalette />
      <DetailPanel />
      <SettingsOverlay />
      <LoadingScreen />
    </div>
  )
}

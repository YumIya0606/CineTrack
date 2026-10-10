import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TopBar from './components/TopBar'
import CommandPalette from './components/CommandPalette'
import BulkAddModal from './components/BulkAddModal'
import DetailPanel from './components/DetailPanel'
import SettingsOverlay from './components/SettingsOverlay'
import LoadingScreen from './components/LoadingScreen'
import HomeView from './views/HomeView'
import DiscoverView from './views/DiscoverView'
import StatusBoardView from './views/StatusBoardView'
import LibraryView from './views/LibraryView'
import WatchlistView from './views/WatchlistView'
import ListsView from './views/ListsView'
import StatsView from './views/StatsView'
import { useUI, useData, useStatuses } from './store'
import { api } from './lib/api'
import { applyAccent, applyDensity } from './lib/theme'
import type { Density } from './lib/theme'

export default function App() {
  const view = useUI(s => s.view)
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const setBulkOpen = useUI(s => s.setBulkOpen)
  const setSettingsOpen = useUI(s => s.setSettingsOpen)
  const setView = useUI(s => s.setView)
  const detailItem = useUI(s => s.detailItem)
  const closeDetail = useUI(s => s.closeDetail)
  const setLoading = useUI(s => s.setLoading)
  const setReduceMotion = useUI(s => s.setReduceMotion)
  const loadLibrary = useData(s => s.loadLibrary)
  const loadTrending = useData(s => s.loadTrending)
  const loadStats = useData(s => s.loadStats)
  const loadStatuses = useStatuses(s => s.loadStatuses)
  const scrollRef = useRef<HTMLElement | null>(null)

  // The scroll container lives outside the animated view wrapper, so its
  // scrollTop survived every navigation — jumping from the bottom of Library
  // to Home scrolled you past Home's header. Reset it on view change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [view])

  /* Initial boot: hydrate library + apply persisted preferences. */
  useEffect(() => {
    const boot = async () => {
      // A single rejected IPC call used to leave `loading` true forever, so the
      // app sat behind the splash with no UI and no way forward. Every step is
      // independent and failures are contained so a broken subsystem (TMDB
      // offline, a corrupt row) can't brick startup.
      await Promise.allSettled([loadLibrary(), loadTrending(), loadStats(), loadStatuses()])

      const [quality, accent, density] = await Promise.allSettled([
        api.settings.get<string>('app.quality'),
        api.settings.get<string>('app.accent'),
        api.settings.get<Density>('app.density')
      ])
      if (quality.status === 'fulfilled' && quality.value === 'battery') setReduceMotion(true)
      // Re-skin before the loading curtain lifts so the accent is correct
      // from the very first paint.
      if (accent.status === 'fulfilled') applyAccent(accent.value)
      if (density.status === 'fulfilled') applyDensity(density.value)
      setTimeout(() => setLoading(false), 550)
    }
    boot().catch(err => {
      console.error('[boot] failed', err)
      setLoading(false)
    })
  }, [loadLibrary, loadTrending, loadStats, loadStatuses, setLoading, setReduceMotion])

  /* Global keyboard shortcuts. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A <select> renders as a text-like control but typing digits into it
      // should not switch views, and typing in any field should not trigger a
      // shortcut. contenteditable is included because a rich-text field would
      // otherwise be treated as "not typing".
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
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
      if (e.code === 'KeyB' && !typing) {
        e.preventDefault()
        setBulkOpen(true)
        return
      }
      // Escape must not close the detail panel while the notes box has focus:
      // React doesn't fire onBlur on unmount, so the only save trigger is
      // skipped and the typed text is lost.
      if (e.code === 'Escape') {
        if (detailItem && !typing) closeDetail()
        return
      }
      if (typing) return

      // Quick view switching: 1–7
      if (e.code === 'Digit1') setView('home')
      if (e.code === 'Digit2') setView('discover')
      if (e.code === 'Digit3') setView('board')
      if (e.code === 'Digit4') setView('library')
      if (e.code === 'Digit5') setView('watchlist')
      if (e.code === 'Digit6') setView('lists')
      if (e.code === 'Digit7') setView('stats')
      if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) setView('stats')
      if (e.code === 'Comma') setSettingsOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen, setBulkOpen, setSettingsOpen, setView, detailItem, closeDetail])

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      {/* Ambient backdrop — slow-drifting aurora blobs + grain keep the flat UI alive */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[15%] h-[55vh] w-[55vh] animate-[drift_26s_ease-in-out_infinite] rounded-full bg-gold/[0.07] blur-[90px]" />
        <div className="absolute -right-[5%] top-[25%] h-[45vh] w-[45vh] animate-[drift_34s_ease-in-out_infinite_reverse] rounded-full bg-azure/[0.06] blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[50vh] w-[50vh] animate-[drift_30s_ease-in-out_infinite] rounded-full bg-crimson/[0.05] blur-[110px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.4)_100%)]" />

      {/* pb-24 clears the fixed TMDB/Import pills pinned to the bottom, so the
          last row of a long board is never hidden underneath them. */}
      <main
        ref={scrollRef}
        className="relative h-full overflow-y-auto pt-[84px]"
        style={{ paddingBottom: '7.5rem' }}
      >
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
            {view === 'board' && <StatusBoardView />}
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
      <BulkAddModal />
      <DetailPanel />
      <SettingsOverlay />
      <LoadingScreen />
    </div>
  )
}

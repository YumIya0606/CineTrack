import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../lib/api'
import { useUI, useData } from '../store'
import { applyDensity } from '../lib/theme'
import { cn } from '../lib/utils'
import { formatYear, catalogKey } from '@shared/utils'
import type { CatalogItem } from '@shared/types'
import ProceduralPoster from './ProceduralPoster'

const RECENT_KEY = 'cinetrack.recent-searches'

interface PaletteAction {
  id: string
  label: string
  hint: string
  icon: string
  run: () => void | Promise<void>
}

type PaletteRow =
  | { kind: 'action'; action: PaletteAction }
  | { kind: 'item'; item: CatalogItem }

export default function CommandPalette() {
  const open = useUI(s => s.commandOpen)
  const setOpen = useUI(s => s.setCommandOpen)
  const openDetail = useUI(s => s.openDetail)
  const setView = useUI(s => s.setView)
  const setBulkOpen = useUI(s => s.setBulkOpen)
  const setSettingsOpen = useUI(s => s.setSettingsOpen)
  const setShortcutsOpen = useUI(s => s.setShortcutsOpen)
  const addItem = useData(s => s.addItem)
  const loadLibrary = useData(s => s.loadLibrary)
  const loadStats = useData(s => s.loadStats)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Live TMDB connection gates access to the full (~1M title) catalog.
  useEffect(() => {
    if (!open) return
    api.tmdb.status().then(c => setConnected(c.connected))
  }, [open])

  // Debounced search against the catalog
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const q = query.trim()
      if (!q) {
        const recent = await loadRecent()
        if (!cancelled) {
          setResults(recent)
          setSelected(0)
          setLoading(false)
        }
        return
      }
      try {
        const [local, live] = await Promise.all([
          api.catalog.search(q, 12),
          connected ? api.tmdb.search(q).catch(() => [] as CatalogItem[]) : Promise.resolve([])
        ])
        // Local rows win; live results fill the rest (deduped by tmdbId + title).
        const seen = new Set<string>()
        const merged: CatalogItem[] = []
        for (const item of [...local, ...live]) {
          const key = item.tmdbId ? `t${item.tmdbId}` : `s${item.title.toLowerCase()}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(item)
        }
        if (!cancelled) {
          setResults(merged.slice(0, 24))
          setSelected(0)
        }
      } catch {
        // Without this the spinner cleared only on the success path, so one
        // failed query left "Searching the catalog…" up forever.
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, open, connected])

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  /* Quick actions make the palette a command surface, not only a search box.
     They are always reachable by name, so "settings" or "stats" works without
     knowing the shortcut. */
  const actions = useMemo<PaletteAction[]>(() => {
    const compact = document.documentElement.classList.contains('density-compact')
    return [
      { id: 'home', label: 'Go to Home', hint: 'Continue watching', icon: '⌂', run: () => setView('home') },
      { id: 'discover', label: 'Go to Discover', hint: 'Browse the live catalog', icon: '◈', run: () => setView('discover') },
      { id: 'board', label: 'Open Status board', hint: 'Filter and re-status titles', icon: '▦', run: () => setView('board') },
      { id: 'library', label: 'Go to Library', hint: 'Everything you have tracked', icon: '▤', run: () => setView('library') },
      { id: 'watchlist', label: 'Open Watchlist', hint: 'Titles queued up', icon: '☆', run: () => setView('watchlist') },
      { id: 'lists', label: 'Open Lists', hint: 'Shelves and collections', icon: '☰', run: () => setView('lists') },
      { id: 'stats', label: 'Open Insights', hint: 'Your watching patterns', icon: '◔', run: () => setView('stats') },
      { id: 'bulk', label: 'Add watched history', hint: 'Paste titles or import CSV', icon: '＋', run: () => setBulkOpen(true) },
      {
        id: 'density',
        label: compact ? 'Switch to comfortable density' : 'Switch to compact density',
        hint: 'Fit more posters on screen',
        icon: '▥',
        run: () => {
          const next = compact ? 'comfortable' : 'compact'
          applyDensity(next)
          api.settings.set('app.density', next).catch(() => undefined)
        }
      },
      {
        id: 'imdb',
        label: 'Import IMDb ratings',
        hint: 'Merge your IMDb export',
        icon: '↓',
        run: async () => {
          await api.library.importImdb()
          await loadLibrary()
          await loadStats()
        }
      },
      { id: 'settings', label: 'Open Settings', hint: 'Keys, playback, backup', icon: '⚙', run: () => setSettingsOpen(true) },
      { id: 'shortcuts', label: 'Keyboard shortcuts', hint: 'See every shortcut', icon: '⌨', run: () => setShortcutsOpen(true) }
    ]
  }, [setView, setBulkOpen, setSettingsOpen, setShortcutsOpen, loadLibrary, loadStats])

  const q = query.trim().toLowerCase()
  const matchingActions = useMemo(
    () =>
      q
        ? actions.filter(a => `${a.label} ${a.hint}`.toLowerCase().includes(q))
        : actions,
    [actions, q]
  )

  // Empty query: actions first, then recents. Query: results first, then any
  // matching actions, so a real title still beats a menu item with a similar
  // name.
  const rows = useMemo<PaletteRow[]>(() => {
    const actionRows = matchingActions.map(a => ({ kind: 'action' as const, action: a }))
    const itemRows = results.map(item => ({ kind: 'item' as const, item }))
    return q ? [...itemRows, ...actionRows] : [...actionRows, ...itemRows]
  }, [matchingActions, results, q])

  const actionOffset = q ? results.length : 0
  const itemOffset = q ? 0 : matchingActions.length

  const runAction = async (action: PaletteAction) => {
    setOpen(false)
    try {
      await action.run()
    } catch (err) {
      console.error('[palette] action failed', action.id, err)
    }
  }

  const handleSelect = async (item: CatalogItem) => {
    openDetail(item)
    setOpen(false)
    await saveRecent(item)
  }

  const handleQuickAdd = async (item: CatalogItem, status: 'completed' | 'planned') => {
    await addItem(item, status)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && rows[selected]) {
      e.preventDefault()
      const row = rows[selected]!
      if (row.kind === 'action') runAction(row.action)
      else handleSelect(row.item)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            className="glass-strong relative flex h-fit max-h-[68vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gold">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search titles, or type a command…"
                className="no-drag w-full bg-transparent text-[15px] text-ink placeholder:text-ink-dim focus:outline-none"
                spellCheck={false}
              />
              <kbd className="shrink-0 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
                ESC
              </kbd>
              {connected && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald/40 bg-emerald/10 px-2 py-0.5 text-[10px] font-semibold text-emerald">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                  Live catalog
                </span>
              )}
            </div>

            {/* Results */}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              {q && loading && (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-ink-dim">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-gold" />
                  Searching the catalog…
                </div>
              )}

              {!q && (
                <PaletteLabel>Quick actions</PaletteLabel>
              )}
              {!q &&
                matchingActions.map((action, i) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    selected={selected === actionOffset + i}
                    onHover={() => setSelected(actionOffset + i)}
                    onRun={() => runAction(action)}
                  />
                ))}

              {!q && results.length > 0 && <PaletteLabel>Recent</PaletteLabel>}
              {q && results.length > 0 && (
                <PaletteLabel>
                  {loading ? 'Best matches so far' : `${results.length} matches`}
                </PaletteLabel>
              )}
              {results.map((item, i) => (
                <ItemRow
                  key={catalogKey(item)}
                  item={item}
                  selected={selected === itemOffset + i}
                  onHover={() => setSelected(itemOffset + i)}
                  onOpen={() => handleSelect(item)}
                  onQuickAdd={status => handleQuickAdd(item, status)}
                />
              ))}

              {q && !loading && matchingActions.length > 0 && (
                <PaletteLabel>Actions</PaletteLabel>
              )}
              {q &&
                matchingActions.map((action, i) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    selected={selected === results.length + i}
                    onHover={() => setSelected(results.length + i)}
                    onRun={() => runAction(action)}
                  />
                ))}

              {!q && !loading && results.length === 0 && (
                <div className="px-3 py-3 text-center text-[11px] text-ink-dim">
                  Type to search the catalog, or pick an action above.
                </div>
              )}
              {q && !loading && rows.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-ink-dim">
                  {connected
                    ? 'No matches found. Try a different spelling or title.'
                    : 'No matches in the bundled catalog. Add a TMDB key in Settings for the full live catalog.'}
                </div>
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[11px] text-ink-dim">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="rounded border border-line bg-surface-2 px-1">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="rounded border border-line bg-surface-2 px-1">↵</kbd> run
                </span>
              </div>
              <span>
                {rows.length} {q ? 'results' : 'commands'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PaletteLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
      {children}
    </div>
  )
}

function ActionRow({
  action,
  selected,
  onHover,
  onRun
}: {
  action: PaletteAction
  selected: boolean
  onHover: () => void
  onRun: () => void
}) {
  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
        selected ? 'bg-surface-3' : 'hover:bg-surface-2'
      )}
      onMouseEnter={onHover}
      onClick={onRun}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-sm text-gold">
        {action.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{action.label}</div>
        <div className="truncate text-[11px] text-ink-dim">{action.hint}</div>
      </div>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-dim">
        Run
      </span>
    </div>
  )
}

function ItemRow({
  item,
  selected,
  onHover,
  onOpen,
  onQuickAdd
}: {
  item: CatalogItem
  selected: boolean
  onHover: () => void
  onOpen: () => void
  onQuickAdd: (status: 'completed' | 'planned') => void
}) {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
        selected ? 'bg-surface-3' : 'hover:bg-surface-2'
      )}
      onMouseEnter={onHover}
      onClick={onOpen}
    >
      <div className="h-12 w-[34px] shrink-0 overflow-hidden rounded">
        {item.posterPath ? (
          <img
            src={`https://image.tmdb.org/t/p/w185${item.posterPath}`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <ProceduralPoster title={item.title} year={item.year} className="h-full w-full" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{item.title}</div>
        <div className="flex items-center gap-2 text-xs text-ink-dim">
          <span className="capitalize">{item.kind}</span>
          <span>•</span>
          <span>{formatYear(item.year, item.endYear)}</span>
          {item.runtimeMinutes ? (
            <>
              <span>•</span>
              <span>{item.runtimeMinutes}m</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-gold hover:text-gold"
          onClick={e => {
            e.stopPropagation()
            onQuickAdd('completed')
          }}
        >
          Completed
        </button>
        <button
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-gold hover:text-gold"
          onClick={e => {
            e.stopPropagation()
            onQuickAdd('planned')
          }}
        >
          Planned
        </button>
      </div>
    </div>
  )
}

async function loadRecent(): Promise<CatalogItem[]> {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CatalogItem[]
  } catch {
    return []
  }
}

async function saveRecent(item: CatalogItem): Promise<void> {
  try {
    const cur = await loadRecent()
    // Dedupe by catalogKey, not by local id: every live TMDB row has id 0, so
    // opening two different live titles used to overwrite each other.
    const key = catalogKey(item)
    const next = [item, ...cur.filter(i => catalogKey(i) !== key)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* non-fatal */
  }
}

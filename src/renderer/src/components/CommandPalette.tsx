import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../lib/api'
import { useUI, useData } from '../store'
import { cn } from '../lib/utils'
import { formatYear } from '@shared/utils'
import type { CatalogItem } from '@shared/types'
import ProceduralPoster from './ProceduralPoster'

const RECENT_KEY = 'cinetrack.recent-searches'

export default function CommandPalette() {
  const open = useUI(s => s.commandOpen)
  const setOpen = useUI(s => s.setCommandOpen)
  const openDetail = useUI(s => s.openDetail)
  const addItem = useData(s => s.addItem)
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
        }
      } else {
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
      }
      if (!cancelled) setLoading(false)
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

  const grouped = useMemo(() => {
    return results
  }, [results])

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
      setSelected(s => Math.min(s + 1, grouped.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && grouped[selected]) {
      e.preventDefault()
      handleSelect(grouped[selected]!)
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
            className="glass-strong relative flex h-fit max-h-[64vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
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
                placeholder="Search movies & series…"
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
              {loading && (
                <div className="px-3 py-6 text-center text-sm text-ink-dim">Searching the catalog…</div>
              )}
              {!loading && grouped.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-ink-dim">
                  {query.trim()
                    ? connected
                      ? 'No matches found. Try a different spelling or title.'
                      : 'No matches in the bundled catalog. Add a TMDB key in Settings for the full live catalog.'
                    : 'Start typing to search.'}
                </div>
              )}
              {!loading &&
                grouped.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn(
                      'group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
                      idx === selected ? 'bg-surface-3' : 'hover:bg-surface-2'
                    )}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => handleSelect(item)}
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
                          handleQuickAdd(item, 'completed')
                        }}
                      >
                        Watched
                      </button>
                      <button
                        className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-gold hover:text-gold"
                        onClick={e => {
                          e.stopPropagation()
                          handleQuickAdd(item, 'planned')
                        }}
                      >
                        Plan
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[11px] text-ink-dim">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="rounded border border-line bg-surface-2 px-1">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="rounded border border-line bg-surface-2 px-1">↵</kbd> open
                </span>
              </div>
              <span>{grouped.length} results</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
    const next = [item, ...cur.filter(i => i.id !== item.id)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* non-fatal */
  }
}

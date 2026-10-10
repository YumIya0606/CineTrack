import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../lib/api'
import { useUI, useData, useStatuses } from '../store'
import { cn } from '../lib/utils'
import { catalogKey, formatYear, parseTitleLines } from '@shared/utils'
import { statusColorDot } from '@shared/status'
import type { CatalogItem, WatchStatus } from '@shared/types'
import ProceduralPoster from './ProceduralPoster'

type Mode = 'pick' | 'paste'

/** How far back to scatter watched dates when back-filling history. */
const WINDOWS: { label: string; months: number }[] = [
  { label: 'All marked today', months: 0 },
  { label: 'Spread over last 3 months', months: 3 },
  { label: 'Spread over last year', months: 12 },
  { label: 'Spread over last 5 years', months: 60 }
]

interface ResolvedLine {
  line: string
  item: CatalogItem | null
  checked: boolean
  resolving: boolean
}

export default function BulkAddModal() {
  const open = useUI(s => s.bulkOpen)
  const setOpen = useUI(s => s.setBulkOpen)
  const library = useData(s => s.library)
  const bulkAdd = useData(s => s.bulkAdd)
  const statusPalette = useStatuses(s => s.statuses)

  const [mode, setMode] = useState<Mode>('pick')
  const [status, setStatus] = useState<WatchStatus>('completed')
  const [windowMonths, setWindowMonths] = useState(12)

  // Pick mode
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [connected, setConnected] = useState(false)

  // Paste mode
  const [paste, setPaste] = useState('')
  const [lines, setLines] = useState<ResolvedLine[]>([])

  const [selected, setSelected] = useState<Map<string, CatalogItem>>(new Map())
  const [working, setWorking] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Bumped per resolve run so a superseded pass can't write into state. */
  const resolveToken = useRef(0)

  useEffect(() => {
    if (!open) return
    api.tmdb.status().then(c => setConnected(c.connected))
    // Reset everything on open so a previous session's leftovers never leak in.
    // Deliberately not dependent on library.length — an add changes it, which
    // would re-run this and yank the user out of the mode they picked.
    setQuery('')
    setResults([])
    setPaste('')
    setLines([])
    setSelected(new Map())
    setResultMsg(null)
    setMode(library.length === 0 ? 'paste' : 'pick')
  }, [open])

  // Debounced search, local catalog first then live TMDB.
  useEffect(() => {
    if (!open || mode !== 'pick') return
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      const q = query.trim()
      if (!q) {
        if (!cancelled) {
          setResults([])
          setSearching(false)
        }
        return
      }
      try {
        const [local, live] = await Promise.all([
          api.catalog.search(q, 10),
          connected ? api.tmdb.search(q).catch(() => [] as CatalogItem[]) : Promise.resolve([])
        ])
        const seen = new Set<string>()
        const merged: CatalogItem[] = []
        for (const item of [...local, ...live]) {
          const key = catalogKey(item)
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(item)
        }
        if (!cancelled) setResults(merged.slice(0, 30))
      } catch {
        // Cleared only on the success path before, so a failed search left
        // the list stuck on "Searching…".
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, open, mode, connected])

  // Resolve a pasted list against the catalog, a few lines at a time so a long
  // list doesn't fire fifty TMDB requests at once.
  const resolveLines = async () => {
    const parsed = parseTitleLines(paste)
    if (!parsed.length) return
    setWorking(true)
    try {
      const initial = parsed.map(p => ({
        line: p.title + (p.year ? ` (${p.year})` : ''),
        item: null,
        checked: false,
        resolving: true
      }))
      setLines(initial)
      // The old list is being replaced wholesale, so its selections have to
      // go too — otherwise handleAdd() submits titles the user already deleted.
      setSelected(new Map())
      // Workers index into `initial`; ignore anything that resolves after the
      // user re-runs, so a stale response can't overwrite the new list.
      const token = ++resolveToken.current

      let cursor = 0
      const workers = Array.from({ length: Math.min(4, parsed.length) }, async () => {
        for (;;) {
          const i = cursor++
          if (i >= parsed.length) break
          const { title, year } = parsed[i]!
          try {
            const [local, live] = await Promise.all([
              api.catalog.search(title, 3),
              connected ? api.tmdb.search(title).catch(() => [] as CatalogItem[]) : Promise.resolve([])
            ])
            if (token !== resolveToken.current) return
            const pool = [...local, ...live]
            const exact =
              (year && pool.find(p => p.year === year)) ||
              pool.find(p => p.title.toLowerCase() === title.toLowerCase()) ||
              pool[0] ||
              null
            setLines(prev => {
              const next = [...prev]
              next[i] = { ...next[i]!, item: exact, checked: Boolean(exact), resolving: false }
              return next
            })
            if (exact) {
              setSelected(prev => {
                const next = new Map(prev)
                next.set(catalogKey(exact), exact)
                return next
              })
            }
          } catch {
            if (token !== resolveToken.current) return
            setLines(prev => {
              const next = [...prev]
              next[i] = { ...next[i]!, resolving: false }
              return next
            })
          }
        }
      })
      await Promise.all(workers)
    } finally {
      setWorking(false)
    }
  }

  const toggle = (item: CatalogItem, on: boolean) => {
    setSelected(prev => {
      const next = new Map(prev)
      if (on) next.set(catalogKey(item), item)
      else next.delete(catalogKey(item))
      return next
    })
  }

  const shelved = (item: CatalogItem): boolean =>
    library.some(l => (item.tmdbId != null && l.tmdbId === item.tmdbId) || (item.id > 0 && l.id === item.id))

  const selectedCount = selected.size

  const handleAdd = async () => {
    if (!selectedCount || working) return
    setWorking(true)
    setResultMsg(null)
    const items = [...selected.values()]
    try {
      const res = await bulkAdd(items, status, { windowMonths })
      setSelected(new Map())
      setLines([])
      setPaste('')
      const bits = [`Added ${res.added}`]
      if (res.skipped) bits.push(`${res.skipped} already shelved`)
      setResultMsg(`${bits.join(' · ')} — watch time has been recalculated.`)
    } catch (e) {
      // Never leave the spinner nailed on: a failed import must hand control
      // straight back so the user can retry or fix the list.
      setResultMsg(`Could not add: ${(e as Error).message}`)
    } finally {
      setWorking(false)
    }
  }

  // Lines the user still has to act on: not yet resolved, or resolved with no
  // match. Counting every finished line made a list of 10 with 3 misses report
  // "10 lines matched".
const pasteNeedsAttention = useMemo(
  () => lines.filter(l => l.resolving || !l.item).length,
  [lines]
)
const pasteUnmatched = useMemo(
  () => lines.filter(l => !l.resolving && !l.item).length,
  [lines]
)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => !working && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            className="glass-strong relative flex h-fit max-h-[86vh] w-[min(720px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h10M4 18h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M17 8.5l2.5 2.5 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-bold text-ink">Add watched history</h2>
                <p className="mt-0.5 text-[11px] text-ink-dim">
                  Shelf many titles at once under the same statuses your library uses. Runtimes are
                  pulled from TMDB so watch time counts.
                </p>
              </div>
              <div className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
                {(['pick', 'paste'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={working}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                      mode === m ? 'bg-gold/15 text-gold' : 'text-ink-soft hover:text-ink'
                    )}
                  >
                    {m === 'pick' ? 'Search' : 'Paste a list'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={working}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-gold hover:text-gold disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Options */}
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
                Status
              </span>
              {/* Only the statuses that make sense for bulk import — the full palette is
                  available one title at a time in the detail panel. */}
              {(['completed', 'watching', 'planned'] as WatchStatus[])
                .filter(key => statusPalette.some(s => s.key === key))
                .map(key => {
                  const def = statusPalette.find(s => s.key === key)!
                  return (
                    <button
                      key={key}
                      onClick={() => setStatus(key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        status === key
                          ? 'border-gold bg-gold/15 text-gold'
                          : 'border-line bg-surface text-ink-soft hover:border-gold/50 hover:text-ink'
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', statusColorDot(def.color))} />
                      {def.label}
                    </button>
                  )
                })}
              {status === 'completed' && (
                <select
                  value={windowMonths}
                  onChange={e => setWindowMonths(Number(e.target.value))}
                  className="no-drag ml-auto cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft focus:border-gold focus:outline-none"
                  title="Scatter watched dates so back-filled history doesn't pile onto one day"
                >
                  {WINDOWS.map(w => (
                    <option key={w.months} value={w.months} className="bg-surface text-ink">
                      {w.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {mode === 'pick' ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gold">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search titles to add…"
                      className="no-drag w-full bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
                      spellCheck={false}
                    />
                    {connected && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald/40 bg-emerald/10 px-2 py-0.5 text-[10px] font-semibold text-emerald">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                        Live
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-1">
                    {searching && (
                      <div className="px-3 py-5 text-center text-sm text-ink-dim">Searching…</div>
                    )}
                    {!searching && !query.trim() && (
                      <div className="px-3 py-5 text-center text-sm text-ink-dim">
                        Type a title to find movies and series. Check as many as you like, then add them in one go.
                      </div>
                    )}
                    {!searching &&
                      results.map(item => {
                        const key = catalogKey(item)
                        const on = selected.has(key)
                        const already = shelved(item)
                        return (
                          <button
                            key={key}
                            onClick={() => !already && toggle(item, !on)}
                            disabled={already}
                            className={cn(
                              'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                              already
                                ? 'cursor-not-allowed opacity-45'
                                : on
                                  ? 'bg-gold/10'
                                  : 'hover:bg-surface-2'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition',
                                on
                                  ? 'border-gold bg-gold text-canvas'
                                  : 'border-line bg-surface text-transparent group-hover:border-gold/50'
                              )}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <div className="h-11 w-[31px] shrink-0 overflow-hidden rounded">
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
                            {already && (
                              <span className="shrink-0 rounded border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-dim">
                                Shelved
                              </span>
                            )}
                          </button>
                        )
                      })}
                    {!searching && query.trim() && results.length === 0 && (
                      <div className="px-3 py-5 text-center text-sm text-ink-dim">
                        No matches. {connected ? 'Try a different spelling.' : 'Add a TMDB key in Settings for the full catalog.'}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    value={paste}
                    onChange={e => setPaste(e.target.value)}
                    disabled={working}
                    placeholder={'One title per line — years optional:\n\nInception (2010)\nThe Matrix\nBreaking Bad\nCorsage (2022)'}
                    rows={6}
                    className="no-drag w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none disabled:opacity-50"
                    spellCheck={false}
                  />
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={resolveLines}
                      disabled={!paste.trim() || working}
                      className="rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Match titles
                    </button>
                    <span className="text-[11px] text-ink-dim">
                      {lines.length === 0
                        ? 'Titles resolve against your catalog and TMDB'
                        : pasteNeedsAttention > 0
                          ? `${pasteUnmatched} of ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} couldn't be matched — fix or skip ${pasteUnmatched === 1 ? 'it' : 'them'}`
                          : `All ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} matched — uncheck any wrong guess`}
                    </span>
                  </div>

                  {lines.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1">
                      {lines.map((l, i) => (
                        <div
                          key={`${i}-${l.line}`}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-2.5 py-2',
                            l.checked ? 'bg-gold/10' : 'bg-surface/50'
                          )}
                        >
                          <button
                            onClick={() => {
                              setLines(prev => {
                                const next = [...prev]
                                next[i] = { ...next[i]!, checked: !next[i]!.checked }
                                return next
                              })
                              if (l.item) toggle(l.item, !l.checked)
                            }}
                            disabled={!l.item}
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition',
                              l.checked
                                ? 'border-gold bg-gold text-canvas'
                                : 'border-line bg-surface text-transparent',
                              !l.item && 'cursor-not-allowed opacity-40'
                            )}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-ink">
                              {l.item ? l.item.title : <span className="italic text-ink-dim">{l.line}</span>}
                            </div>
                            <div className="truncate text-[11px] text-ink-dim">
                              {l.resolving
                                ? 'matching…'
                                : l.item
                                  ? `${l.item.kind} · ${formatYear(l.item.year, l.item.endYear)}`
                                  : 'no match found — fix the line or skip it'}
                            </div>
                          </div>
                          {l.item && shelved(l.item) && (
                            <span className="shrink-0 rounded border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-dim">
                              Shelved
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
              {resultMsg ? (
                <span className="flex-1 text-[11px] leading-relaxed text-emerald">{resultMsg}</span>
              ) : (
                <span className="text-[11px] text-ink-dim">
                  {selectedCount > 0
                    ? `${selectedCount} ${selectedCount === 1 ? 'title' : 'titles'} selected`
                    : 'Nothing selected yet'}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {selectedCount > 0 && (
                  <button
                    onClick={() => setSelected(new Map())}
                    disabled={working}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-medium text-ink-soft transition hover:text-ink disabled:opacity-40"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handleAdd}
                  disabled={!selectedCount || working}
                  className="flex items-center gap-2 rounded-lg border border-gold bg-gold px-4 py-2 text-xs font-semibold text-canvas transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {working ? (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.3" />
                      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  ) : null}
                  {working ? 'Adding…' : `Add ${selectedCount} ${selectedCount === 1 ? 'title' : 'titles'}`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

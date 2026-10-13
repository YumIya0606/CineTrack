import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { useUI, useData } from '../store'
import { cn } from '../lib/utils'
import PosterCard from '../components/PosterCard'
import { ChartRows } from '../components/ChartRows'
import type { CatalogItem, MediaKind, Genre, DiscoverFilters } from '@shared/types'

const SORTS = [
  { id: 'popularity.desc', label: 'Most popular' },
  { id: 'vote_average.desc', label: 'Highest rated' },
  { id: 'primary_release_date.desc', label: 'Newest' },
  { id: 'primary_release_date.asc', label: 'Oldest' },
  { id: 'vote_count.desc', label: 'Most voted' },
  { id: 'revenue.desc', label: 'Biggest box office' },
  { id: 'title.asc', label: 'Title A–Z' }
]

const SERIES_SORTS = [
  { id: 'popularity.desc', label: 'Most popular' },
  { id: 'vote_average.desc', label: 'Highest rated' },
  { id: 'first_air_date.desc', label: 'Newest' },
  { id: 'first_air_date.asc', label: 'Oldest' },
  { id: 'vote_count.desc', label: 'Most voted' },
  { id: 'name.asc', label: 'Title A–Z' }
]

/** The sort list valid for a given kind — used to validate a carried-over sort. */
const sortOptionsFor = (k: MediaKind) => (k === 'series' ? SERIES_SORTS : SORTS)

const RATINGS = [0, 7, 8, 9]

const RUNTIMES = [
  { value: 0, label: 'Any length' },
  { value: 90, label: 'Under 1.5h' },
  { value: 120, label: 'Under 2h' },
  { value: 150, label: 'Under 2.5h' }
]

export default function DiscoverView() {
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const library = useData(s => s.library)
  const [kind, setKind] = useState<MediaKind>('movie')
  const [genres, setGenres] = useState<Record<MediaKind, Genre[]>>({
    movie: [],
    series: []
  })
  const [genreIds, setGenreIds] = useState<number[]>([])
  const [genrePanelOpen, setGenrePanelOpen] = useState(false)
  const [hideInLibrary, setHideInLibrary] = useState(false)
  const [minRating, setMinRating] = useState(0)
  const [maxRuntime, setMaxRuntime] = useState(0)
  const [fromYear, setFromYear] = useState<number | undefined>(undefined)
  const [toYear, setToYear] = useState<number | undefined>(undefined)
  const [sortBy, setSortBy] = useState('popularity.desc')
  // Charts add a dozen network calls, so they are opt-out and hidden whenever
  // the user is actually filtering — otherwise the grid the user asked for is
  // pushed a full screen down by suggestions they didn't request.
  const [showCharts, setShowCharts] = useState(true)
  const [chartsExpanded, setChartsExpanded] = useState(false)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  // Sequence token: every filter change bumps it, and a response whose token
  // is stale is dropped. Without it a slow earlier request could land after a
  // newer one and repopulate the grid with results for filters the user has
  // already changed.
  const searchToken = useRef(0)

  // TMDB ids the user already owns, so "hide in library" can filter results
  // locally — the discover endpoint has no notion of the user's collection.
  const ownedTmdbIds = useMemo(
    () => new Set(library.map(l => l.tmdbId).filter((id): id is number => id != null)),
    [library]
  )

  useEffect(() => {
    api.tmdb.genres().then(setGenres).catch(() => undefined)
  }, [])

  const runSearch = useCallback(
    async (pageToFetch: number, reset: boolean) => {
      const token = ++searchToken.current
      setLoading(true)
      const filters: DiscoverFilters = {
        kind,
        genreIds: genreIds.length ? genreIds : undefined,
        minRating: minRating || undefined,
        maxRuntime: maxRuntime || undefined,
        fromYear,
        toYear,
        sortBy
      }
      try {
        const data = await api.tmdb.discover(filters, pageToFetch)
        if (token !== searchToken.current) return
        setTotalPages(data.totalPages)
        if (reset) {
          setPage(1)
          setItems(data.items)
        } else {
          setItems(prev => [...prev, ...data.items])
        }
      } catch {
        /* network hiccup — keep what we have */
      } finally {
        if (token === searchToken.current) setLoading(false)
      }
    },
    [kind, genreIds, minRating, maxRuntime, fromYear, toYear, sortBy]
  )

  // Re-run whenever any filter changes.
  useEffect(() => {
    runSearch(1, true)
  }, [kind, genreIds, minRating, maxRuntime, fromYear, toYear, sortBy, runSearch])

  const activeFilters =
    genreIds.length + (minRating ? 1 : 0) + (maxRuntime ? 1 : 0) + (fromYear ? 1 : 0) + (toYear ? 1 : 0)

  const resetFilters = () => {
    setGenreIds([])
    setMinRating(0)
    setMaxRuntime(0)
    setFromYear(undefined)
    setToYear(undefined)
    setSortBy('popularity.desc')
    setHideInLibrary(false)
  }

  const toggleGenre = (id: number) =>
    setGenreIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const shown = hideInLibrary ? items.filter(i => !ownedTmdbIds.has(i.tmdbId ?? -1)) : items

  const sortOptions = kind === 'series' ? SERIES_SORTS : SORTS

  return (
    <div className="min-h-full px-8 py-7">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <h1 className="font-display text-3xl font-bold text-ink">Discover</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Browse the full catalog by genre, rating, and era
        </p>
      </motion.div>

      {/* Curated charts sit above the filterable grid: they answer "what should
          I watch" before the user has committed to any filter at all. */}
      {activeFilters > 0 && showCharts && (
        <button
          onClick={() => setShowCharts(false)}
          className="mb-5 text-xs text-ink-dim transition hover:text-gold"
        >
          Show suggestions above filtered results
        </button>
      )}

      {/* Suggestions are capped to one screen. Three full chart rows pushed the
          filter bar and the results grid a full viewport down, so the page's
          own subtitle — "browse by genre, rating and era" — described controls
          you could not see. */}
      {showCharts && activeFilters === 0 && (
        <div className="mb-7">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-dim">
              Suggestions
            </h2>
            <button
              onClick={() => setShowCharts(false)}
              className="text-xs text-ink-dim transition hover:text-gold"
            >
              Hide
            </button>
            <button
              onClick={() => setChartsExpanded(v => !v)}
              className="ml-auto text-xs text-ink-dim transition hover:text-gold"
            >
              {chartsExpanded ? 'Collapse' : 'Show all'}
            </button>
          </div>
          <ChartRows kind={kind} expanded={chartsExpanded} />
        </div>
      )}

      {activeFilters === 0 && !showCharts && (
        <button
          onClick={() => setShowCharts(true)}
          className="mb-7 text-xs text-ink-dim transition hover:text-gold"
        >
          Show suggestions
        </button>
      )}

      {/* Filter bar */}
      <div className="mb-7 flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface/60 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          {(['movie', 'series'] as MediaKind[]).map(k => (
            <button
              key={k}
              onClick={() => {
                setKind(k)
                setGenreIds([])
                // The two lists have disjoint sorts (revenue/primary_release_date
                // vs first_air_date/name). Carrying one over sent a movie-only
                // sort to /discover/tv, and the controlled <select> — whose value
                // matched no option — displayed "Most popular" while the query
                // asked for something else entirely.
                if (!sortOptionsFor(k).some(o => o.id === sortBy)) setSortBy('popularity.desc')
              }}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                kind === k ? 'bg-gold/15 text-gold' : 'text-ink-soft hover:text-ink'
              )}
            >
              {k === 'movie' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setGenrePanelOpen(o => !o)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition',
            genreIds.length
              ? 'border-gold/60 bg-gold/15 text-gold'
              : 'border-line bg-surface text-ink-soft hover:border-gold/40 hover:text-ink'
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Genres
          {genreIds.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-black">
              {genreIds.length}
            </span>
          )}
        </button>

        <select
          value={minRating}
          onChange={e => setMinRating(Number(e.target.value))}
          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
        >
          {RATINGS.map(r => (
            <option key={r} value={r} className="bg-surface text-ink">
              {r === 0 ? 'Any rating' : `${r}+ stars`}
            </option>
          ))}
        </select>

        <select
          value={maxRuntime}
          onChange={e => setMaxRuntime(Number(e.target.value))}
          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
        >
          {RUNTIMES.map(r => (
            <option key={r.value} value={r.value} className="bg-surface text-ink">
              {r.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1900}
            max={2099}
            value={fromYear ?? ''}
            onChange={e => setFromYear(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="From"
            className="no-drag w-16 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
          />
          <span className="text-xs text-ink-dim">→</span>
          <input
            type="number"
            min={1900}
            max={2099}
            value={toYear ?? ''}
            onChange={e => setToYear(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="To"
            className="no-drag w-16 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
          />
        </div>

        <button
          onClick={() => setHideInLibrary(h => !h)}
          title="Hide titles already in your library"
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition',
            hideInLibrary
              ? 'border-azure/60 bg-azure/15 text-azure'
              : 'border-line bg-surface text-ink-soft hover:border-azure/40 hover:text-azure'
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={hideInLibrary ? 'currentColor' : 'none'}>
            <path
              d="M4 12.5l5 5L20 6.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Not in library
        </button>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
        >
          {sortOptions.map(s => (
            <option key={s.id} value={s.id} className="bg-surface text-ink">
              {s.label}
            </option>
          ))}
        </select>

        {activeFilters > 0 || hideInLibrary ? (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-2 text-xs font-medium text-crimson-soft transition hover:bg-crimson/20"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Clear
          </button>
        ) : null}

        <div className="flex-1" />

        <button
          onClick={() => setCommandOpen(true)}
          className="rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-medium text-gold transition hover:bg-gold/20"
        >
          Search instead
        </button>
      </div>

      {/* Active filters as removable pills — always visible so the applied
          filters are obvious at a glance instead of buried in the dropdowns. */}
      {(activeFilters > 0 || hideInLibrary) && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {genreIds.map(id => {
            const g = genres[kind].find(x => x.id === id)
            return g ? (
              <FilterPill key={`g${id}`} label={g.name} onRemove={() => toggleGenre(id)} />
            ) : null
          })}
          {minRating > 0 && (
            <FilterPill label={`${minRating}+ stars`} onRemove={() => setMinRating(0)} />
          )}
          {maxRuntime > 0 && (
            <FilterPill
              label={RUNTIMES.find(r => r.value === maxRuntime)?.label ?? 'Length'}
              onRemove={() => setMaxRuntime(0)}
            />
          )}
          {fromYear && <FilterPill label={`From ${fromYear}`} onRemove={() => setFromYear(undefined)} />}
          {toYear && <FilterPill label={`To ${toYear}`} onRemove={() => setToYear(undefined)} />}
          {hideInLibrary && (
            <FilterPill label="Not in library" onRemove={() => setHideInLibrary(false)} />
          )}
        </div>
      )}

      {/* Genre chip panel — multi-select, matched as "any of" */}
      <AnimatePresence initial={false}>
        {genrePanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mb-7 overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-surface/60 p-3 backdrop-blur-sm">
              {genres[kind].map(g => {
                const on = genreIds.includes(g.id)
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGenre(g.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-medium transition',
                      on
                        ? 'border-gold bg-gold/15 text-gold'
                        : 'border-line bg-surface text-ink-soft hover:border-gold/40 hover:text-ink'
                    )}
                  >
                    {g.name}
                  </button>
                )
              })}
              {genreIds.length > 1 && (
                <span className="ml-auto self-center text-[10.5px] text-ink-dim">
                  Matching any of {genreIds.length} genres
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {shown.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {shown.map((item, i) => (
              <PosterCard key={`${item.tmdbId ?? item.id}-${i}`} item={item} index={i} className="w-full" />
            ))}
          </div>
          {page < totalPages && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => {
                  const next = page + 1
                  setPage(next)
                  runSearch(next, false)
                }}
                disabled={loading}
                className="rounded-xl border border-gold/40 bg-gold/10 px-6 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:opacity-50"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-16 text-center">
          {loading ? (
            <div className="text-sm text-ink-dim">Browsing the catalog…</div>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-ink-dim">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-ink">No titles match</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
                  {hideInLibrary
                    ? 'Everything on this page is already in your library. Load more, or turn off the filter.'
                    : 'Try loosening the year range or lowering the rating threshold.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** A single active filter, removable with one click. */
function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      className="group flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 py-1 pl-3 pr-2 text-[11px] font-medium text-gold transition hover:bg-gold/20"
    >
      {label}
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gold/20 text-gold transition group-hover:bg-gold/40">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
          <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    </button>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { useUI } from '../store'
import { cn } from '../lib/utils'
import PosterCard from '../components/PosterCard'
import type { CatalogItem, MediaKind, Genre, DiscoverFilters } from '@shared/types'

const SORTS = [
  { id: 'popularity.desc', label: 'Most popular' },
  { id: 'vote_average.desc', label: 'Highest rated' },
  { id: 'primary_release_date.desc', label: 'Newest' },
  { id: 'primary_release_date.asc', label: 'Oldest' },
  { id: 'vote_count.desc', label: 'Most voted' }
]

const SERIES_SORTS = [
  { id: 'popularity.desc', label: 'Most popular' },
  { id: 'vote_average.desc', label: 'Highest rated' },
  { id: 'first_air_date.desc', label: 'Newest' },
  { id: 'first_air_date.asc', label: 'Oldest' },
  { id: 'vote_count.desc', label: 'Most voted' }
]

const RATINGS = [0, 7, 8, 9]

export default function DiscoverView() {
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const [kind, setKind] = useState<MediaKind>('movie')
  const [genres, setGenres] = useState<Record<MediaKind, Genre[]>>({
    movie: [],
    series: []
  })
  const [genreId, setGenreId] = useState<number | undefined>(undefined)
  const [minRating, setMinRating] = useState(0)
  const [fromYear, setFromYear] = useState<number | undefined>(undefined)
  const [toYear, setToYear] = useState<number | undefined>(undefined)
  const [sortBy, setSortBy] = useState('popularity.desc')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.tmdb.genres().then(setGenres).catch(() => undefined)
  }, [])

  const runSearch = useCallback(
    async (pageToFetch: number, reset: boolean) => {
      setLoading(true)
      const filters: DiscoverFilters = {
        kind,
        genreId,
        minRating: minRating || undefined,
        fromYear,
        toYear,
        sortBy
      }
      try {
        const data = await api.tmdb.discover(filters, pageToFetch)
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
        setLoading(false)
      }
    },
    [kind, genreId, minRating, fromYear, toYear, sortBy]
  )

  // Re-run whenever any filter changes.
  useEffect(() => {
    runSearch(1, true)
  }, [kind, genreId, minRating, fromYear, toYear, sortBy, runSearch])

  const activeFilters =
    (genreId ? 1 : 0) + (minRating ? 1 : 0) + (fromYear ? 1 : 0) + (toYear ? 1 : 0)

  const resetFilters = () => {
    setGenreId(undefined)
    setMinRating(0)
    setFromYear(undefined)
    setToYear(undefined)
    setSortBy('popularity.desc')
  }

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

      {/* Filter bar */}
      <div className="mb-7 flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface/60 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          {(['movie', 'series'] as MediaKind[]).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                kind === k ? 'bg-gold/15 text-gold' : 'text-ink-soft hover:text-ink'
              )}
            >
              {k === 'movie' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>

        <select
          value={genreId ?? ''}
          onChange={e => setGenreId(e.target.value ? Number(e.target.value) : undefined)}
          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
        >
          <option value="">All genres</option>
          {genres[kind].map(g => (
            <option key={g.id} value={g.id} className="bg-surface text-ink">
              {g.name}
            </option>
          ))}
        </select>

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

        {activeFilters > 0 && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-2 text-xs font-medium text-crimson-soft transition hover:bg-crimson/20"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Clear {activeFilters}
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setCommandOpen(true)}
          className="rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-medium text-gold transition hover:bg-gold/20"
        >
          Search instead
        </button>
      </div>

      {/* Results */}
      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item, i) => (
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
                  Try loosening the year range or lowering the rating threshold.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

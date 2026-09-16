import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useUI, useData } from '../store'
import { cn } from '../lib/utils'
import type { WatchStatus } from '@shared/types'
import PosterCard from '../components/PosterCard'

type SortKey = 'updated' | 'title' | 'year' | 'rating'
type FilterKind = 'all' | WatchStatus

const FILTERS: { id: FilterKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'watching', label: 'Watching' },
  { id: 'rewatching', label: 'Rewatching' },
  { id: 'dropped', label: 'Dropped' }
]

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'year', label: 'Year' },
  { id: 'rating', label: 'Your rating' }
]

export default function LibraryView() {
  const library = useData(s => s.library)
  const setCommandOpen = useUI(s => s.setCommandOpen)

  const [filter, setFilter] = useState<FilterKind>('all')
  const [sort, setSort] = useState<SortKey>('updated')
  const [localQuery, setLocalQuery] = useState('')

  // Library excludes the planned list — that lives in Watchlist.
  const items = useMemo(() => {
    let out = library.filter(l => l.status !== 'planned')
    if (filter !== 'all') out = out.filter(l => l.status === filter)
    if (localQuery.trim()) {
      const q = localQuery.trim().toLowerCase()
      out = out.filter(l => l.title.toLowerCase().includes(q))
    }
    const sorted = [...out]
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'year':
        sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
        break
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        break
      default:
        sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return sorted
  }, [library, filter, sort, localQuery])

  return (
    <div className="min-h-full px-8 py-7">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <h1 className="font-display text-3xl font-bold text-ink">Library</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          {items.length} {items.length === 1 ? 'title' : 'titles'} you have tracked
        </p>
      </motion.div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface/60 p-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition',
                filter === f.id ? 'bg-gold/15 text-gold' : 'text-ink-soft hover:text-ink'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <input
          value={localQuery}
          onChange={e => setLocalQuery(e.target.value)}
          placeholder="Filter in library…"
          className="no-drag w-52 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
        />

        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
        >
          {SORTS.map(s => (
            <option key={s.id} value={s.id} className="bg-surface text-ink">
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item, i) => (
            <PosterCard key={item.libraryId} item={item} index={i} className="w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-ink-dim">
              <rect x="3" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.8" />
              <rect x="9" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 5l4 1-3 14-4-1 3-14z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Nothing here yet</h3>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
              {library.length === 0
                ? 'Your library is empty — search for a title to add your first movie or series.'
                : 'No titles match the current filter. Try “All” or clear the filter box.'}
            </p>
          </div>
          {library.length === 0 && (
            <button
              onClick={() => setCommandOpen(true)}
              className="rounded-xl border border-gold bg-gold/15 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/25"
            >
              Search to add
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useUI, useData } from '../store'
import { cn } from '../lib/utils'
import PosterCard from '../components/PosterCard'

type SortKey = 'updated' | 'title' | 'year' | 'popularity'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'updated', label: 'Recently added' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'year', label: 'Newest first' },
  { id: 'popularity', label: 'Most popular' }
]

export default function WatchlistView() {
  const library = useData(s => s.library)
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const updateItem = useData(s => s.updateItem)
  const [sort, setSort] = useState<SortKey>('updated')

  const planned = useMemo(() => {
    const sorted = [...library.filter(l => l.status === 'planned')]
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'year':
        sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
        break
      case 'popularity':
        sorted.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        break
      default:
        sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return sorted
  }, [library, sort])

  return (
    <div className="min-h-full px-8 py-7">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <h1 className="font-display text-3xl font-bold text-ink">Watchlist</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          {planned.length} {planned.length === 1 ? 'title' : 'titles'} queued up to watch
        </p>
      </motion.div>

      {planned.length > 0 ? (
        <>
          <div className="mb-6 flex items-center justify-end">
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

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {planned.map((item, i) => (
              <PosterCard key={item.libraryId} item={item} index={i} className="w-full" />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-ink-dim">
              <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Your watchlist is empty</h3>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
              Search a movie or series and mark it <span className="text-azure">Planned</span> to keep
              a list of things you want to get to.
            </p>
          </div>
          <button
            onClick={() => setCommandOpen(true)}
            className="rounded-xl border border-gold bg-gold/15 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/25"
          >
            Find something to watch
          </button>
        </div>
      )}

      {/* Bulk “mark watched” shortcut when there is a queue */}
      {planned.length > 0 && (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-line bg-surface/50 p-4">
          <div className="text-xs text-ink-soft">
            Finished something from your list? Open it and set the status to{' '}
            <span className="font-medium text-gold">Completed</span>.
          </div>
          <div className="flex-1" />
          <button
            onClick={async () => {
              const first = planned[0]
              if (first) await updateItem(first.libraryId, { status: 'completed' })
            }}
            className={cn(
              'rounded-lg border border-gold bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/25'
            )}
          >
            Mark first as watched
          </button>
        </div>
      )}
    </div>
  )
}

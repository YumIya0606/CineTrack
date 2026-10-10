import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { useUI, useData, useStatuses } from '../store'
import { cn } from '../lib/utils'
import { formatYear } from '@shared/utils'
import { statusColorDot, progressOf } from '@shared/status'
import StatusPill, { formatShortMinutes } from '../components/StatusPill'
import ProceduralPoster from '../components/ProceduralPoster'
import type {
  BoardFilters,
  BoardResult,
  BoardRow,
  BoardSort,
  BoardGroupBy,
  MediaKind,
  WatchStatus
} from '@shared/types'

type GroupBy = BoardGroupBy

const SORTS: { id: BoardSort; label: string }[] = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'year', label: 'Newest first' },
  { id: 'rating', label: 'Your rating' },
  { id: 'runtime', label: 'Longest' },
  { id: 'watchedAt', label: 'Watched date' },
  { id: 'status', label: 'Status' },
  { id: 'progress', label: 'Progress' }
]

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'kind', label: 'Type' },
  { id: 'genre', label: 'Genre' },
  { id: 'decade', label: 'Decade' },
  { id: 'none', label: 'Flat' }
]

const RATING_FLOOR = [0, 6, 8, 9]

export default function StatusBoardView() {
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const openDetail = useUI(s => s.openDetail)
  const statuses = useStatuses(s => s.statuses)
  const library = useData(s => s.library)

  const [data, setData] = useState<BoardResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sort, setSort] = useState<BoardSort>('updated')
  const [group, setGroup] = useState<GroupBy>('status')

  // Filters
  const [selStatuses, setSelStatuses] = useState<string[]>([])
  const [kind, setKind] = useState<MediaKind | ''>('')
  const [genre, setGenre] = useState<string>('')
  const [ratingFloor, setRatingFloor] = useState(0)
  const [watchedOnly, setWatchedOnly] = useState(false)
  const [inProgressOnly, setInProgressOnly] = useState(false)
  const [unratedOnly, setUnratedOnly] = useState(false)
  const [query, setQuery] = useState('')

  const filters: BoardFilters = useMemo(
    () => ({
      statuses: selStatuses.length ? selStatuses : undefined,
      kind: kind || undefined,
      genres: genre ? [genre] : undefined,
      ratingMin: ratingFloor > 0 ? ratingFloor : undefined,
      rated: unratedOnly ? false : undefined,
      watchedOnly: watchedOnly || undefined,
      inProgressOnly: inProgressOnly || undefined,
      query: query.trim() || undefined
    }),
    [selStatuses, kind, genre, ratingFloor, watchedOnly, inProgressOnly, unratedOnly, query]
  )

  // Fetch whenever any filter changes. A sequence token drops stale responses.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.library
      .board(filters, sort)
      .then(res => {
        if (!cancelled) setData(res)
      })
      .catch(e => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, sort])

  const activeFilterCount =
    (selStatuses.length ? 1 : 0) +
    (kind ? 1 : 0) +
    (genre ? 1 : 0) +
    (ratingFloor ? 1 : 0) +
    (watchedOnly ? 1 : 0) +
    (inProgressOnly ? 1 : 0) +
    (unratedOnly ? 1 : 0) +
    (query.trim() ? 1 : 0)

  const clearAll = () => {
    setSelStatuses([])
    setKind('')
    setGenre('')
    setRatingFloor(0)
    setWatchedOnly(false)
    setInProgressOnly(false)
    setUnratedOnly(false)
    setQuery('')
  }

  const toggleStatus = (key: string) =>
    setSelStatuses(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))

  // Group rows for the visible headers. For 'status' grouping the rows are
  // ordered by the palette so the board mirrors the summary strip.
  const grouped = useMemo(() => {
    const rows = data?.rows ?? []
    if (group === 'none') return [{ key: '__all', label: '', rows }]
    const map = new Map<string, BoardRow[]>()
    for (const row of rows) {
      const keys =
        group === 'status'
          ? [row.status]
          : group === 'kind'
            ? [row.kind]
            : group === 'genre'
              ? row.genres.length
                ? row.genres
                : ['Uncategorised']
              : [row.year ? `${Math.floor(row.year / 10) * 10}s` : 'Unknown year']
      for (const k of keys) {
        const list = map.get(k) ?? []
        list.push(row)
        map.set(k, list)
      }
    }
    const entries = [...map.entries()].map(([key, groupRows]) => ({ key, rows: groupRows }))
    if (group === 'status') {
      const order = new Map(statuses.map((s, i) => [s.key, i]))
      entries.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
    } else {
      entries.sort((a, b) => b.rows.length - a.rows.length)
    }
    return entries
  }, [data, group, statuses])

  const groupLabel = (key: string) => {
    if (group === 'status') {
      return statuses.find(s => s.key === key)?.label ?? key
    }
    return key
  }

  return (
    <div className="min-h-full px-8 py-7" style={{ paddingLeft: 'var(--view-pad)', paddingRight: 'var(--view-pad)' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Status board</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Every movie and series in one place — filter, group, and re-status in bulk.
          </p>
        </div>
        <button
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add titles
        </button>
      </motion.div>

      {/* Summary strip — one card per status, clickable to filter */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(data?.summary ?? []).map(s => {
          const active = selStatuses.includes(s.key)
          const dot = statusColorDot(s.color)
          return (
            <button
              key={s.key}
              onClick={() => toggleStatus(s.key)}
              className={cn(
                'group rounded-2xl border p-4 text-left transition',
                active
                  ? 'border-gold/60 bg-gold/10'
                  : 'border-line bg-surface/60 hover:border-gold/40'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', dot)} />
                <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  {s.label}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-gradient-gold">{s.count}</span>
                {s.minutes > 0 && (
                  <span className="text-[11px] text-ink-dim">{formatShortMinutes(s.minutes)}</span>
                )}
              </div>
            </button>
          )
        })}
        {loading && !data && (
          <div className="col-span-full rounded-2xl border border-line bg-surface/40 py-8 text-center text-sm text-ink-dim">
            Loading your board…
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded-2xl border border-line bg-surface/50 p-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by title…"
            className="no-drag w-56 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
          />
          <select
            value={kind}
            onChange={e => setKind(e.target.value as MediaKind | '')}
            className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
          >
            <option value="" className="bg-surface text-ink">Movies & series</option>
            <option value="movie" className="bg-surface text-ink">Movies only</option>
            <option value="series" className="bg-surface text-ink">Series only</option>
          </select>
          <select
            value={genre}
            onChange={e => setGenre(e.target.value)}
            className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
          >
            <option value="" className="bg-surface text-ink">Any genre</option>
            {(data?.genres ?? []).map(g => (
              <option key={g} value={g} className="bg-surface text-ink">
                {g}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as BoardSort)}
            className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
          >
            {SORTS.map(s => (
              <option key={s.id} value={s.id} className="bg-surface text-ink">
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
            {GROUPS.map(g => (
              <button
                key={g.id}
                onClick={() => setGroup(g.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-medium transition',
                  group === g.id ? 'bg-gold/15 text-gold' : 'text-ink-soft hover:text-ink'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-medium text-ink-soft transition hover:border-crimson/50 hover:text-crimson"
            >
              Clear ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Secondary toggles */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {RATING_FLOOR.slice(1).map(r => (
            <button
              key={r}
              onClick={() => setRatingFloor(ratingFloor === r ? 0 : r)}
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-medium transition',
                ratingFloor === r
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-line bg-surface text-ink-soft hover:text-ink'
              )}
            >
              ★ {r}+
            </button>
          ))}
          <ToggleChip on={watchedOnly} onClick={() => setWatchedOnly(v => !v)} label="Finished only" />
          <ToggleChip
            on={inProgressOnly}
            onClick={() => setInProgressOnly(v => !v)}
            label="Mid-series"
          />
          <ToggleChip on={unratedOnly} onClick={() => setUnratedOnly(v => !v)} label="Unrated" />
        </div>
      </div>

      {/* Results meta */}
      <div className="mb-3 flex items-center justify-between text-[11px] text-ink-dim">
        <span>
          {data?.total ?? 0} {data?.total === 1 ? 'title' : 'titles'}
          {loading && ' · updating…'}
        </span>
        {library.length > 0 && data && data.total < library.length && (
          <span>
            filtered from {library.length}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-xs text-crimson-soft">
          Could not load the board: {error}
        </div>
      )}

      {/* Grouped rows */}
      <div className="flex flex-col gap-6">
        {/* Column header, so the fixed tracks read as a table rather than
            arbitrary gaps. */}
        {grouped.length > 0 && (
          <div className="hidden grid-cols-[minmax(0,1fr)_9rem_4rem_auto] items-center gap-4 px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim sm:grid">
            <span>Title</span>
            <span className="text-right">Progress</span>
            <span className="text-right">Watch time</span>
            <span className="w-[7.5rem] text-center">Status</span>
          </div>
        )}
        {grouped.map(g => (
          <section key={g.key}>
            {group !== 'none' && (
              <div className="mb-2.5 flex items-center gap-2">
                {group === 'status' && (
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      statusColorDot(statuses.find(s => s.key === g.key)?.color)
                    )}
                  />
                )}
                <h2 className="font-display text-sm font-bold text-ink">{groupLabel(g.key)}</h2>
                <span className="text-[11px] text-ink-dim">{g.rows.length}</span>
              </div>
            )}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface/40">
              {g.rows.map(row => (
                <BoardRowItem key={row.libraryId} row={row} onOpen={() => openDetail(row)} />
              ))}
            </div>
          </section>
        ))}

        {!loading && grouped.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-16 text-center">
            <h3 className="font-display text-lg font-bold text-ink">
              {library.length === 0 ? 'Your library is empty' : 'Nothing matches these filters'}
            </h3>
            <p className="max-w-xs text-sm text-ink-soft">
              {library.length === 0
                ? 'Add the movies and series you have watched to see them organized here.'
                : 'Try clearing a filter or two to widen the net.'}
            </p>
            {library.length > 0 && (
              <button
                onClick={clearAll}
                className="rounded-xl border border-gold bg-gold/15 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/25"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleChip({
  on,
  onClick,
  label
}: {
  on: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-medium transition',
        on ? 'border-gold bg-gold/15 text-gold' : 'border-line bg-surface text-ink-soft hover:text-ink'
      )}
    >
      {label}
    </button>
  )
}

/** One row of the board: poster, title/meta, progress, and an inline status menu. */
function BoardRowItem({ row, onOpen }: { row: BoardRow; onOpen: () => void }) {
  const statuses = useStatuses(s => s.statuses)
  const updateItem = useData(s => s.updateItem)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const progress = progressOf(row)
  const setStatus = async (s: WatchStatus) => {
    setMenuOpen(false)
    await updateItem(row.libraryId, { status: s })
  }

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line/60 px-4 py-3 transition last:border-b-0 hover:bg-surface-2/50 sm:grid-cols-[minmax(0,1fr)_9rem_4rem_auto]">
      <button onClick={onOpen} className="flex min-w-0 items-center gap-4 text-left">
        <div className="h-14 w-[38px] shrink-0 overflow-hidden rounded-lg">
          {row.posterPath ? (
            <img
              src={`https://image.tmdb.org/t/p/w185${row.posterPath}`}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ProceduralPoster title={row.title} year={row.year} className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{row.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-dim">
            <span className="capitalize">{row.kind}</span>
            <span>•</span>
            <span>{formatYear(row.year, row.endYear)}</span>
            {row.genres.slice(0, 2).map(g => (
              <span key={g} className="rounded border border-line bg-surface px-1.5 py-px">
                {g}
              </span>
            ))}
            {row.rating != null && (
              <>
                <span>•</span>
                <span className="text-gold">★ {row.rating}</span>
              </>
            )}
          </div>
        </div>
      </button>

      {/* Progress column — a fixed track so every row's bar starts at the same
          x, instead of drifting with the title length. */}
      <div className="hidden w-36 shrink-0 sm:block">
        {row.kind === 'series' && row.episodesTotal ? (
          <>
            <div className="flex items-center justify-between text-[10.5px] text-ink-dim">
              <span>
                {row.episodesWatched}/{row.episodesTotal} ep
              </span>
              {progress != null && <span>{Math.round(progress * 100)}%</span>}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold transition-all"
                style={{ width: `${(progress ?? 0) * 100}%` }}
              />
            </div>
          </>
        ) : row.kind === 'movie' && row.runtimeMinutes ? (
          <span className="text-[11px] text-ink-dim">{row.runtimeMinutes} min</span>
        ) : (
          <span className="text-[11px] text-ink-dim">—</span>
        )}
      </div>

      {/* Watch time contribution */}
      <span className="hidden w-16 shrink-0 text-right text-[11px] text-ink-dim sm:block">
        {row.watchMinutes > 0 ? formatShortMinutes(row.watchMinutes) : '—'}
      </span>

      {/* Inline status menu */}
      <div className="relative w-[7.5rem] shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex w-full items-center justify-center gap-1.5"
        >
          <StatusPill status={row.status} size="sm" />
          {!row.statusOverride && row.kind === 'series' && row.episodesTotal ? (
            <span
              title="Status follows episode progress"
              className="rounded border border-line bg-surface px-1 py-px text-[9px] font-medium text-ink-dim"
            >
              auto
            </span>
          ) : null}
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="glass-strong absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-white/10 py-1 shadow-xl"
            >
              {statuses.map(s => (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition',
                    s.key === row.status
                      ? 'bg-gold/10 text-gold'
                      : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', statusColorDot(s.color))} />
                  {s.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
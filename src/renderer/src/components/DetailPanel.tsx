import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUI, useData, useCollections } from '../store'
import { cn } from '../lib/utils'
import { posterUrl, backdropUrl, profileUrl, formatRuntime, formatYear } from '@shared/utils'
import type { WatchStatus, CatalogItem, LiveDetails, WatchProviders, ViewingEntry } from '@shared/types'
import ProceduralPoster from './ProceduralPoster'
import SeasonGrid from './SeasonGrid'
import TrailerModal from './TrailerModal'
import ListPicker from './ListPicker'
import { api } from '../lib/api'

const STATUSES: { value: WatchStatus; label: string }[] = [
  { value: 'watching', label: 'Watching' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
  { value: 'rewatching', label: 'Rewatching' },
  { value: 'dropped', label: 'Dropped' }
]

function isLibraryItem(item: unknown): item is {
  libraryId: number
  status: WatchStatus
  rating: number | null
  notes: string | null
  id: number
  title: string
  kind: string
  year: number | null
  endYear: number | null
  genres: string[]
  runtimeMinutes: number | null
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  episodesWatched: number
  voteAverage: number | null
} {
  return typeof (item as { libraryId?: number })?.libraryId === 'number'
}

export default function DetailPanel() {
  const item = useUI(s => s.detailItem)
  const closeDetail = useUI(s => s.closeDetail)
  const openDetail = useUI(s => s.openDetail)
  const addItem = useData(s => s.addItem)
  const updateItem = useData(s => s.updateItem)
  const removeItem = useData(s => s.removeItem)
  const logEpisode = useData(s => s.logEpisode)
  const library = useData(s => s.library)

  const [status, setStatus] = useState<WatchStatus | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<{ season: number; episode: number }[]>([])
  const [live, setLive] = useState<LiveDetails | null>(null)
  const [providers, setProviders] = useState<WatchProviders | null>(null)
  const [viewings, setViewings] = useState<ViewingEntry[]>([])
  const [trailerOpen, setTrailerOpen] = useState(false)
  const loadCollections = useCollections(s => s.loadCollections)
  const [containedIn, setContainedIn] = useState<number[]>([])

  const inLibrary = isLibraryItem(item) ? item : library.find(l => l.id === (item as CatalogItem)?.id)

  useEffect(() => {
    if (!item) return
    if (inLibrary) {
      setStatus(inLibrary.status)
      setRating(inLibrary.rating)
      setNotes(inLibrary.notes ?? '')
    } else {
      setStatus(null)
      setRating(null)
      setNotes('')
    }
  }, [item, inLibrary])

  useEffect(() => {
    if (!item || !isLibraryItem(item)) {
      setEpisodes([])
      return
    }
    let cancelled = false
    api.library.episodes(item.libraryId).then(logs => {
      if (!cancelled) setEpisodes(logs.map(l => ({ season: l.season, episode: l.episode })))
    })
    return () => {
      cancelled = true
    }
  }, [item])

  // Enrich with live cast + similar titles when a TMDB key is available.
  useEffect(() => {
    const tmdbId = (item as CatalogItem | null)?.tmdbId
    const kind = (item as CatalogItem | null)?.kind
    if (!item || !tmdbId || !kind) {
      setLive(null)
      setProviders(null)
      return
    }
    let cancelled = false
    api.tmdb
      .status()
      .then(status =>
        status.connected ? api.tmdb.details(tmdbId, kind) : Promise.resolve(null)
      )
      .then(d => !cancelled && setLive(d))
      .catch(() => !cancelled && setLive(null))
    api.tmdb
      .providers(tmdbId, kind)
      .then(p => !cancelled && setProviders(p))
      .catch(() => !cancelled && setProviders(null))
    return () => {
      cancelled = true
    }
  }, [item])

  // Rewatch history for a library title.
  useEffect(() => {
    const lid = (item as { libraryId?: number })?.libraryId
    if (!lid) {
      setViewings([])
      return
    }
    let cancelled = false
    api.library.viewings(lid).then(v => !cancelled && setViewings(v))
    return () => {
      cancelled = true
    }
  }, [item])

  // Which shelves already hold this title.
  useEffect(() => {
    const cid = (item as CatalogItem | null)?.id
    if (!item || !cid) {
      setContainedIn([])
      return
    }
    let cancelled = false
    api.collections
      .containing(cid)
      .then(ids => !cancelled && setContainedIn(ids))
      .catch(() => !cancelled && setContainedIn([]))
    return () => {
      cancelled = true
    }
  }, [item])

  if (!item) return null

  const title = item.title
  const kind = item.kind
  const year = item.year
  const endYear = item.endYear
  const genres = item.genres ?? []
  const runtime = item.runtimeMinutes
  const overview = item.overview
  const posterPath = item.posterPath
  const backdropPath = (item as { backdropPath?: string | null })?.backdropPath
  const voteAverage = item.voteAverage
  const libraryId = inLibrary?.libraryId

  const handleSaveStatus = async (s: WatchStatus) => {
    setStatus(s)
    if (libraryId) {
      await updateItem(libraryId, { status: s })
    } else {
      await addItem(item as CatalogItem, s)
    }
  }

  const handleSaveRating = async (r: number | null) => {
    setRating(r)
    if (libraryId) await updateItem(libraryId, { rating: r })
  }

  const handleSaveNotes = async () => {
    if (libraryId) await updateItem(libraryId, { notes })
  }

  const handleRemove = async () => {
    if (libraryId) await removeItem(libraryId)
    closeDetail()
  }

  /** Logs one episode from the season grid, then refreshes local history. */
  const handleLogEpisodeFromGrid = async (season: number, episode: number) => {
    if (!libraryId) return
    await logEpisode(libraryId, season, episode)
    const logs = await api.library.episodes(libraryId)
    setEpisodes(logs.map(l => ({ season: l.season, episode: l.episode })))
  }

  /** Records a full viewing — the backbone of rewatch counts. */
  const handleLogViewing = async () => {
    if (!libraryId) return
    await api.library.logViewing(libraryId)
    const v = await api.library.viewings(libraryId)
    setViewings(v)
  }

  const handleToggleList = async (collectionId: number) => {
    // Live-only items (id 0) must be persisted before they can join a shelf.
    const persisted =
      (item as CatalogItem).id > 0
        ? (item as CatalogItem)
        : await api.catalog.ensure(item as CatalogItem)
    if (containedIn.includes(collectionId)) {
      await api.collections.remove(collectionId, persisted.id)
    } else {
      await api.collections.add(collectionId, persisted)
    }
    const ids = await api.collections.containing(persisted.id)
    setContainedIn(ids)
  }

  const displayRating = hoverRating ?? rating

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-30 flex items-stretch justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closeDetail}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" />
          <motion.aside
            className="glass-strong relative flex h-full w-[min(520px,100vw)] flex-col overflow-hidden border-l border-white/10"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Backdrop hero */}
            <div className="relative h-44 shrink-0 overflow-hidden">
              {backdropPath ? (
                <img
                  src={backdropUrl(backdropPath, 'w1280') ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-surface-3 to-canvas" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c0f] via-[#0b0c0f]/55 to-transparent" />
              <button
                onClick={closeDetail}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-ink-soft backdrop-blur transition hover:border-gold hover:text-gold"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-8">
              {/* Title block */}
              <div className="-mt-16 flex gap-4">
                <div className="h-44 w-30 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-card">
                  {posterPath ? (
                    <img
                      src={posterUrl(posterPath, 'w342') ?? undefined}
                      alt={title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ProceduralPoster title={title} year={year} className="h-full w-full" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-16">
                  <h2 className="font-display text-2xl font-bold leading-tight text-ink">{title}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                    <span className="capitalize">{kind}</span>
                    <span>•</span>
                    <span>{formatYear(year, endYear)}</span>
                    {runtime ? (
                      <>
                        <span>•</span>
                        <span>{formatRuntime(runtime)}</span>
                      </>
                    ) : null}
                    {voteAverage ? (
                      <>
                        <span>•</span>
                        <span className="text-gold">★ {voteAverage.toFixed(1)}</span>
                      </>
                    ) : null}
                  </div>
                  {genres.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {genres.map(g => (
                        <span
                          key={g}
                          className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10.5px] text-ink-soft"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action row: trailer + shelves + log a viewing */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setTrailerOpen(true)}
                  disabled={!item.tmdbId}
                  className="flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Trailer
                </button>
                <ListPicker
                  containedIn={containedIn}
                  onToggle={handleToggleList}
                  onReload={loadCollections}
                />
                {libraryId && (
                  <button
                    onClick={handleLogViewing}
                    title="Record that you watched this again"
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-azure/40 hover:text-azure"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.7L3 8"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M3 3v5h5"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Log a viewing
                  </button>
                )}
              </div>

              {/* Rewatch history */}
              {libraryId && viewings.length > 0 && (
                <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-dim">
                  <span className="font-semibold uppercase tracking-wider">
                    {viewings.length} {viewings.length === 1 ? 'viewing' : 'viewings'}
                  </span>
                  <span>·</span>
                  <span>
                    last{' '}
                    {new Date(viewings[0]!.watchedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              )}

              {overview && <p className="mt-5 text-sm leading-relaxed text-ink-soft">{overview}</p>}

              {live?.tagline && (
                <p className="mt-3 border-l-2 border-gold/50 pl-3 text-sm italic text-ink-dim">
                  {live.tagline}
                </p>
              )}

              {live && live.crew.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-soft">
                  {live.crew.map(c => (
                    <span
                      key={`${c.name}-${c.job}`}
                      className="rounded-full border border-line bg-surface px-2.5 py-1"
                    >
                      <span className="text-ink-dim">{c.job}: </span>
                      {c.name}
                    </span>
                  ))}
                </div>
              )}

              {live && live.cast.length > 0 && (
                <div className="mt-6">
                  <Label>Cast</Label>
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                    {live.cast.map(c => (
                      <div key={c.name} className="w-[72px] shrink-0 text-center">
                        <div className="aspect-square overflow-hidden rounded-full border border-line bg-surface-2">
                          {c.profilePath ? (
                            <img
                              src={profileUrl(c.profilePath, 'w185') ?? undefined}
                              alt={c.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-3 to-surface text-[11px] font-semibold text-ink-dim">
                              {c.name
                                .split(' ')
                                .map(w => w[0])
                                .slice(0, 2)
                                .join('')}
                            </div>
                          )}
                        </div>
                        <div className="mt-1.5 truncate text-[10.5px] font-medium text-ink">
                          {c.name}
                        </div>
                        {c.character && (
                          <div className="truncate text-[9.5px] text-ink-dim">{c.character}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Where to watch */}
              {providers &&
                (providers.flatrate.length > 0 ||
                  providers.rent.length > 0 ||
                  providers.buy.length > 0) && (
                  <div className="mt-6">
                    <Label>Where to watch</Label>
                    <div className="mt-3 flex flex-col gap-2.5">
                      {providers.flatrate.length > 0 && (
                        <ProviderRow label="Stream" list={providers.flatrate} />
                      )}
                      {providers.rent.length > 0 && (
                        <ProviderRow label="Rent" list={providers.rent} />
                      )}
                      {providers.buy.length > 0 && (
                        <ProviderRow label="Buy" list={providers.buy} />
                      )}
                      {providers.link && (
                        <a
                          href={providers.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10.5px] text-ink-dim transition hover:text-gold"
                        >
                          All options on TMDB →
                        </a>
                      )}
                    </div>
                  </div>
                )}

              {/* Status chips */}
              <div className="mt-6">
                <Label>Status</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => handleSaveStatus(s.value)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        status === s.value
                          ? 'border-gold bg-gold/15 text-gold'
                          : 'border-line bg-surface text-ink-soft hover:border-gold/50 hover:text-ink'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Star rating */}
              <div className="mt-5">
                <Label>Your rating</Label>
                <div
                  className="mt-2 flex items-center gap-0.5"
                  onMouseLeave={() => setHoverRating(null)}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <button
                      key={n}
                      onMouseEnter={() => setHoverRating(n)}
                      onClick={() => handleSaveRating(displayRating === n ? null : n)}
                      className="p-0.5 transition hover:scale-110"
                      aria-label={`${n}/10`}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        className={cn(
                          'transition-colors',
                          displayRating && n <= displayRating ? 'fill-gold text-gold' : 'fill-transparent text-ink-dim'
                        )}
                      >
                        <path
                          d="M12 2.5l2.9 6.0 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                      </svg>
                    </button>
                  ))}
                  {displayRating ? (
                    <span className="ml-2 text-xs font-medium text-gold">{displayRating}/10</span>
                  ) : (
                    <span className="ml-2 text-xs text-ink-dim">Not rated</span>
                  )}
                </div>
              </div>

              {/* Episode grid for series */}
              {kind === 'series' ? (
                <div className="mt-5">
                  <Label>Episodes</Label>
                  <SeasonGrid
                    tmdbId={item.tmdbId}
                    seasonsTotal={live?.seasons ?? null}
                    episodesTotal={live?.episodes ?? null}
                    libraryId={libraryId}
                    onLogEpisode={handleLogEpisodeFromGrid}
                    loggedEpisodes={episodes.map(e => ({
                      libraryId: libraryId ?? 0,
                      season: e.season,
                      episode: e.episode,
                      watchedAt: ''
                    }))}
                  />
                </div>
              ) : null}

              {/* Notes */}
              {libraryId ? (
                <div className="mt-5">
                  <Label>Notes</Label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={handleSaveNotes}
                    placeholder="Your thoughts, quotes, or reminders…"
                    rows={4}
                    className="no-drag mt-2 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                  />
                </div>
              ) : null}

              {/* Danger zone */}
              {libraryId ? (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleRemove}
                    className="rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-xs font-medium text-crimson-soft transition hover:bg-crimson/20"
                  >
                    Remove from library
                  </button>
                </div>
              ) : null}

              {/* More like this */}
              {live && live.similar.length > 0 && (
                <div className="mt-8">
                  <Label>More like this</Label>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {live.similar.slice(0, 6).map(s => (
                      <button
                        key={`${s.tmdbId ?? s.id}-${s.title}`}
                        onClick={() => openDetail(s)}
                        className="group text-left"
                      >
                        <div className="aspect-[2/3] overflow-hidden rounded-lg border border-line bg-surface-2 transition group-hover:border-gold/50">
                          {s.posterPath ? (
                            <img
                              src={posterUrl(s.posterPath, 'w185') ?? undefined}
                              alt={s.title}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <ProceduralPoster
                              title={s.title}
                              year={s.year}
                              className="h-full w-full"
                            />
                          )}
                        </div>
                        <div className="mt-1.5 line-clamp-1 text-[10.5px] font-medium text-ink-soft">
                          {s.title}
                        </div>
                        <div className="text-[9.5px] text-ink-dim">
                          {formatYear(s.year, s.endYear)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}

      {trailerOpen && (
        <TrailerModal
          tmdbId={item.tmdbId}
          kind={item.kind}
          title={item.title}
          onClose={async () => setTrailerOpen(false)}
        />
      )}
    </AnimatePresence>
  )
}

function ProviderRow({
  label,
  list
}: {
  label: string
  list: { providerId: number; providerName: string; logoPath: string | null }[]
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-12 shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {list.slice(0, 8).map(p => (
          <span
            key={p.providerId}
            title={p.providerName}
            className="flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-line bg-surface pl-0.5 pr-2"
          >
            {p.logoPath ? (
              <img
                src={`https://image.tmdb.org/t/p/w92${p.logoPath}`}
                alt=""
                loading="lazy"
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-[9px] text-ink-dim">
                ?
              </span>
            )}
            <span className="text-[10.5px] text-ink-soft">{p.providerName}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{children}</div>
}

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUI, useData, useCollections, useStatuses } from '../store'
import { cn } from '../lib/utils'
import { posterUrl, backdropUrl, profileUrl, formatRuntime, formatYear } from '@shared/utils'
import { statusColorDot } from '@shared/status'
import type { WatchStatus, CatalogItem, LiveDetails, WatchProviders, ViewingEntry } from '@shared/types'
import ProceduralPoster from './ProceduralPoster'
import SeasonGrid from './SeasonGrid'
import TrailerModal from './TrailerModal'
import WatchModal from './WatchModal'
import ListPicker from './ListPicker'
import { api } from '../lib/api'

function isLibraryItem(item: unknown): item is {
  libraryId: number
  status: WatchStatus
  rating: number | null
  notes: string | null
  watchedAt: string | null
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

/** Today as a yyyy-mm-dd string for <input type="date">. */
function todayInput(): string {
  return toDateInput(new Date().toISOString())
}

/** An ISO timestamp -> the yyyy-mm-dd a date input expects (local-day safe). */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A yyyy-mm-dd -> ISO timestamp. Noon local avoids off-by-one date rolls. */
function fromDateInput(val: string): string {
  const [y, m, d] = val.split('-').map(Number)
  return new Date(y ?? 2020, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString()
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
  const statusPalette = useStatuses(s => s.statuses)

  const [status, setStatus] = useState<WatchStatus | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<{ season: number; episode: number }[]>([])
  const [live, setLive] = useState<LiveDetails | null>(null)
  const [providers, setProviders] = useState<WatchProviders | null>(null)
  const [viewings, setViewings] = useState<ViewingEntry[]>([])
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [watchOpen, setWatchOpen] = useState(false)
  const loadCollections = useCollections(s => s.loadCollections)
  const bumpItems = useCollections(s => s.bumpItems)
  const [containedIn, setContainedIn] = useState<number[]>([])
  /**
   * The watched-date prompt. "Completed" is the one status that carries a real
   * date, and "Log a viewing" is meaningless without one — both route through
   * here so the user can pin the exact day instead of accepting "now".
   */
  const [datePrompt, setDatePrompt] = useState<null | { mode: 'status' | 'viewing' }>(null)
  const [dateVal, setDateVal] = useState('')
  /** True while a date commit is in flight, so one viewing is never logged twice. */
  const [dateBusy, setDateBusy] = useState(false)
  /** Manual "minutes per episode" for series TMDB has no runtime for. */
  const [episodesRuntime, setEpisodesRuntime] = useState('')

  // Live TMDB results carry catalog id 0, so matching against the library by
  // id never finds them — a title shelved from Discover then showed as
  // un-shelved everywhere except the Library view. TMDB id is stable per
  // title, so match on that first and only fall back to the catalog id.
  // (This runs on every render, including when no detail is open and item is
  // null — guard first or the lookup throws and whites out the whole app.)
  const inLibrary = !item
    ? undefined
    : isLibraryItem(item)
      ? item
      : library.find(
          l =>
            (item.tmdbId != null && l.tmdbId === item.tmdbId) ||
            (item.id > 0 && l.id === item.id)
        )

  /**
   * Seed the editable fields when a *different* title is opened. This used to
   * depend on `inLibrary`, whose identity changes on every store reload, so
   * any background write (the player's 90s auto-mark, a bulk add) wiped the
   * notes the user was still typing. Keying on `item` alone means reloads
   * can't clobber in-progress edits.
   */
  useEffect(() => {
    if (!item) return
    if (inLibrary) {
      setStatus(inLibrary.status)
      setRating(inLibrary.rating)
      setNotes(inLibrary.notes ?? '')
      setEpisodesRuntime(
        inLibrary.episodesRuntime != null ? String(inLibrary.episodesRuntime) : ''
      )
    } else {
      setStatus(null)
      setRating(null)
      setNotes('')
      setEpisodesRuntime('')
    }
  }, [item])

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
    if (!item) {
      setContainedIn([])
      return
    }
    let cancelled = false
    // A live item has no catalog row yet — resolve (creating if needed) the
    // same way a shelf toggle would, so membership shows for it too.
    const cid = (item as CatalogItem).id
    const resolve = async () => {
      if (cid > 0) return cid
      return (item as CatalogItem).tmdbId ? (await api.catalog.ensure(item as CatalogItem)).id : 0
    }
    resolve().then(id => {
      if (cancelled || !id) {
        if (!cancelled) setContainedIn([])
        return
      }
      api.collections
        .containing(id)
        .then(ids => !cancelled && setContainedIn(ids))
        .catch(() => !cancelled && setContainedIn([]))
    })
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
    // "Completed" is worth remembering precisely — ask which day it happened
    // (with a Today shortcut) rather than silently stamping "now".
    if (s === 'completed') {
      setDateVal(toDateInput(inLibrary?.watchedAt) || todayInput())
      setDatePrompt({ mode: 'status' })
      return
    }
    setStatus(s)
    if (libraryId) {
      await updateItem(libraryId, { status: s })
    } else {
      await addItem(item as CatalogItem, s)
    }
  }

  const handleSaveRating = async (r: number | null) => {
    setRating(r)
    if (libraryId) {
      await updateItem(libraryId, { rating: r })
      return
    }
    // Rating a title that isn't shelved means it has been watched — add it as
    // completed, then attach the rating to the new row.
    await addItem(item as CatalogItem, 'completed')
    const tmdb = (item as CatalogItem).tmdbId
    const entry = useData.getState().library.find(l => tmdb != null && l.tmdbId === tmdb)
    if (entry) await updateItem(entry.libraryId, { rating: r })
  }

  const handleSaveNotes = async () => {
    if (libraryId) await updateItem(libraryId, { notes })
  }

  /** Persists the per-series episode runtime the user typed. */
  const handleSaveEpisodesRuntime = async () => {
    if (!libraryId) return
    const raw = episodesRuntime.trim()
    if (!raw) {
      if (inLibrary?.episodesRuntime != null) {
        await updateItem(libraryId, { episodesRuntime: null })
      }
      return
    }
    const minutes = Math.max(1, Math.min(400, Number(raw)))
    if (!Number.isFinite(minutes) || minutes === inLibrary?.episodesRuntime) return
    await updateItem(libraryId, { episodesRuntime: minutes })
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
    setDateVal(todayInput())
    setDatePrompt({ mode: 'viewing' })
  }

  /** Commits the date chosen in the watched-date prompt. */
const confirmDate = async () => {
    const prompt = datePrompt
    if (!prompt || !dateVal || dateBusy) return
    // setDatePrompt(null) doesn't unmount the button until React re-renders, so
    // a fast second click re-entered this with the stale non-null prompt and
    // logged the same viewing again. Guard on an explicit in-flight flag.
    setDateBusy(true)
    const iso = fromDateInput(dateVal)
    setDatePrompt(null)

    try {
      if (prompt.mode === 'status') {
        setStatus('completed')
        if (libraryId) {
          await updateItem(libraryId, { status: 'completed', watchedAt: iso })
          // Finishing a title is itself a viewing — log it against the history.
          await api.library.logViewing(libraryId, iso)
          setViewings(await api.library.viewings(libraryId))
        } else {
          await addItem(item as CatalogItem, 'completed')
          // addItem stamped watchedAt with "now"; correct it to the chosen day
          // and record the viewing. Match by TMDB id — a live item only has its
          // real catalog id after being persisted, so item.id can still be 0.
          const tmdb = (item as CatalogItem).tmdbId
          const catalogId = (item as CatalogItem).id
          const entry = useData
            .getState()
            .library.find((l) => (tmdb != null && l.tmdbId === tmdb) || (catalogId > 0 && l.id === catalogId))
          if (entry) {
            await updateItem(entry.libraryId, { watchedAt: iso })
            await api.library.logViewing(entry.libraryId, iso)
            setViewings(await api.library.viewings(entry.libraryId))
          }
        }
      } else {
        if (!libraryId) return
        await api.library.logViewing(libraryId, iso)
        await updateItem(libraryId, { watchedAt: iso })
        setViewings(await api.library.viewings(libraryId))
      }
    } catch (err) {
      console.error('[detail] could not save watched date:', err)
    } finally {
      setDateBusy(false)
    }
  }

  /**
   * Marks a title watched straight from the streaming player. Movies record a
   * full viewing; episodes log into the episode history (and refresh the grid).
   */
  const handleMarkWatchedFromPlayer = async (
    season: number | null,
    episode: number | null
  ) => {
    // The player is reachable from a live title that isn't shelved yet. Shelf
    // it first (as completed) so the view actually lands somewhere.
    let lid = libraryId
    if (!lid) {
      await addItem(item as CatalogItem, 'completed')
      const tmdb = (item as CatalogItem).tmdbId
      const entry = useData.getState().library.find(l => tmdb != null && l.tmdbId === tmdb)
      lid = entry?.libraryId ?? undefined
    }
    if (!lid) return
    if (season !== null && episode !== null) {
      await logEpisode(lid, season, episode)
      const logs = await api.library.episodes(lid)
      setEpisodes(logs.map(l => ({ season: l.season, episode: l.episode })))
    } else {
      await api.library.logViewing(lid)
      const v = await api.library.viewings(lid)
      setViewings(v)
    }
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
    // Refresh shelf counts everywhere and let the Lists view know its grid
    // is stale, so a title added from here shows up without leaving the tab.
    await loadCollections()
    bumpItems()
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
            {/*
              Backdrop hero — pinned to the top of the panel as a backdrop
              layer. It sits below the scrolling content (z-0) and never
              intercepts pointer events, so the poster, the title and every
              section below render above it and scroll over it instead of
              being hidden behind it.
            */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-56 overflow-hidden">
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
            </div>

            <button
              onClick={closeDetail}
              className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-ink-soft backdrop-blur transition hover:border-gold hover:text-gold"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-8">
              {/* Spacer that lets the backdrop show through above the title */}
              <div className="h-32 shrink-0" aria-hidden="true" />
              {/* Title block */}
              <div className="flex gap-4">
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
                      {genres.map((g, i) => (
                        <span
                          key={`${i}-${g}`}
                          className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10.5px] text-ink-soft"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action row: watch + trailer + shelves + log a viewing */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setWatchOpen(true)}
                  disabled={!item.tmdbId}
                  className="flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch free
                </button>
                <button
                  onClick={() => setTrailerOpen(true)}
                  disabled={!item.tmdbId}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
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
                  <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
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

              {/* Status chips — driven by the user's palette, so renamed and
                  custom statuses appear here automatically. */}
              <div className="mt-6">
                <Label>Status</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {statusPalette.map(s => (
                    <button
                      key={s.key}
                      onClick={() => handleSaveStatus(s.key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        status === s.key
                          ? 'border-gold bg-gold/15 text-gold'
                          : 'border-line bg-surface text-ink-soft hover:border-gold/50 hover:text-ink'
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', statusColorDot(s.color))} />
                      {s.label}
                    </button>
                  ))}
                </div>
                {inLibrary && !inLibrary.statusOverride && kind === 'series' && inLibrary.episodesTotal ? (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <span className="rounded border border-line bg-surface px-1.5 py-px text-[9px] font-medium">
                      auto
                    </span>
                    Status follows episode progress ({inLibrary.episodesWatched}/{inLibrary.episodesTotal}).
                  </div>
                ) : null}
                {inLibrary?.watchedAt && (
                  <div className="mt-2 text-[11px] text-ink-dim">
                    Watched on{' '}
                    {new Date(inLibrary.watchedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                )}
              </div>

              {datePrompt && (
                <div className="mt-3 rounded-xl border border-gold/30 bg-surface-2/95 p-3.5 shadow-lg">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gold">
                    {datePrompt.mode === 'status'
                      ? 'When did you finish it?'
                      : 'When did you watch it?'}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setDateVal(todayInput())}
                      className="rounded-lg border border-gold/40 bg-gold/15 px-2.5 py-1.5 text-[11px] font-medium text-gold transition hover:bg-gold/25"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setDateVal(toDateInput(new Date(Date.now() - 86400000).toISOString()))}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-gold/40 hover:text-ink"
                    >
                      Yesterday
                    </button>
                    <input
                      type="date"
                      value={dateVal}
                      max={todayInput()}
                      onChange={e => setDateVal(e.target.value)}
                      className="no-drag rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-soft focus:border-gold focus:outline-none"
                    />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => setDatePrompt(null)}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDate}
                      disabled={!dateVal || dateBusy}
                      className="rounded-lg border border-gold/50 bg-gold/20 px-3 py-1.5 text-[11px] font-semibold text-gold transition hover:bg-gold/30 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {dateBusy ? 'Saving…' : 'Save date'}
                    </button>
                  </div>
                </div>
              )}

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

                  {/* Episode-runtime override — the fix for a series TMDB has no
                      length for, which otherwise contributes zero watch time. */}
                  {libraryId && inLibrary && !inLibrary.runtimeMinutes ? (
                    <div className="mt-4 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
                      <div className="text-[11px] font-semibold text-ink-soft">
                        Average episode length
                      </div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-dim">
                        TMDB has no runtime for this series, so it adds nothing to your watch time.
                        Enter the typical episode length once and it counts from then on.
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={400}
                          value={episodesRuntime}
                          onChange={e => setEpisodesRuntime(e.target.value)}
                          onBlur={handleSaveEpisodesRuntime}
                          placeholder="e.g. 45"
                          className="no-drag w-24 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                        />
                        <span className="text-[11px] text-ink-dim">minutes per episode</span>
                      </div>
                    </div>
                  ) : null}
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

      {watchOpen && (
        <WatchModal
          tmdbId={item.tmdbId}
          kind={item.kind}
          title={item.title}
          seasonsTotal={live?.seasons ?? null}
          onClose={() => setWatchOpen(false)}
          onMarkWatched={handleMarkWatchedFromPlayer}
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

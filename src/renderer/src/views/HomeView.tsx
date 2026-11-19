import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useUI, useData } from '../store'
import { api } from '../lib/api'
import { useTilt } from '../lib/use-tilt'
import { backdropUrl, formatTotalRuntime, catalogKey } from '@shared/utils'
import { progressOf } from '@shared/status'
import type { CatalogItem } from '@shared/types'
import PosterCard from '../components/PosterCard'
import Logo from '../components/Logo'
import HudCorners from '../components/HudCorners'

export default function HomeView() {
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const setBulkOpen = useUI(s => s.setBulkOpen)
  const openDetail = useUI(s => s.openDetail)
  const reduceMotion = useUI(s => s.reduceMotion)
  const library = useData(s => s.library)
  const stats = useData(s => s.stats)
  const updateItem = useData(s => s.updateItem)

  const [trending, setTrending] = useState<CatalogItem[]>([])
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Stream the live weekly chart when a TMDB key is present; fall back
      // to the bundled catalog offline.
      const status = await api.tmdb.status()
      const live = status.connected ? await api.tmdb.trending().catch(() => []) : []
      const source = live.length ? live : await api.catalog.trending()
      if (!cancelled) setTrending(source)
    }
    load()
    // A key entered in Settings changes what Home can show. Without this the
    // offline catalog stayed on screen until the next app launch.
    const onChange = () => load()
    window.addEventListener('cinetrack:tmdb-changed', onChange)
    return () => {
      cancelled = true
      window.removeEventListener('cinetrack:tmdb-changed', onChange)
    }
  }, [])

  const watching = useMemo(() => library.filter(l => l.status === 'watching'), [library])
  const recent = useMemo(
    () => library.filter(l => l.status !== 'planned').slice(0, 12),
    [library]
  )

  const hourCount = stats ? Math.round(stats.totalRuntimeMinutes / 60) : 0

  // A single editorial spotlight above the shelves: the show you are in the
  // middle of, otherwise the most recently touched title with artwork.
  const featured = useMemo(
    () => watching[0] ?? library.find(l => l.backdropPath) ?? recent[0] ?? null,
    [watching, library, recent]
  )
  const featuredProgress = featured ? progressOf(featured) : null

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 5) return 'Still up'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const activity = (stats?.monthlyActivity ?? []).slice(-12).map(a => ({
    ...a,
    label: new Date(`${a.month}-01T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric'
    })
  }))
  const cards = [
    { label: 'In library', value: String(stats?.totalTitles ?? 0) },
    { label: 'Completed', value: String(stats?.completed ?? 0) },
    { label: 'Watch time', value: `${hourCount}h` },
    { label: 'Avg rating', value: stats?.averageRating ? stats.averageRating.toFixed(1) : '—' }
  ]

  return (
    <div className="min-h-full px-8 py-7" style={{ paddingLeft: 'var(--view-pad)', paddingRight: 'var(--view-pad)' }}>
      {/* Greeting header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">{greeting}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {library.length > 0
              ? `You have watched ${stats?.completed ?? 0} titles — ${formatTotalRuntime(stats?.totalRuntimeMinutes ?? 0)} of content.`
              : 'Your library is empty. Search for a movie or series to begin.'}
          </p>
        </div>
        <button
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Add watched history
          <kbd className="rounded border border-gold/40 bg-black/30 px-1.5 py-0.5 text-[10px]">B</kbd>
        </button>
      </motion.div>

      {/* Spotlight — one large editorial surface above the shelves. */}
      {featured && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-9 overflow-hidden rounded-3xl border border-line bg-surface"
        >
          {featured.backdropPath ? (
            <img
              src={backdropUrl(featured.backdropPath) ?? undefined}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-45"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(245,181,68,0.16),transparent_60%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/88 to-canvas/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-canvas/90 via-transparent to-transparent" />
          <HudCorners size={12} />
          <div className="relative flex flex-col gap-5 p-6 sm:p-8 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
                  {featured.status === 'watching' ? 'Continue watching' : 'Spotlight'}
                </span>
                <span className="rounded border border-line bg-black/30 px-1.5 py-0.5 text-[9px] text-ink-soft">
                  {featured.kind}
                </span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
                {featured.title}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-soft">
                <span>{featured.year ?? '—'}</span>
                {featured.genres.slice(0, 3).map(g => (
                  <span
                    key={g}
                    className="rounded border border-line/80 bg-black/20 px-1.5 py-px text-[10px] text-ink-dim"
                  >
                    {g}
                  </span>
                ))}
                {featured.kind === 'series' && featured.episodesTotal ? (
                  <span>
                    {featured.episodesWatched}/{featured.episodesTotal} episodes
                  </span>
                ) : featured.runtimeMinutes ? (
                  <span>{featured.runtimeMinutes} min</span>
                ) : null}
                {featured.rating ? <span className="text-gold">★ {featured.rating}/10</span> : null}
              </div>
              {featured.overview && (
                <p className="mt-3 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
                  {featured.overview}
                </p>
              )}
              {featuredProgress != null && (
                <div className="mt-4 max-w-sm">
                  <div className="mb-1 flex items-center justify-between text-[10.5px] text-ink-dim">
                    <span>Episode progress</span>
                    <span>{Math.round(featuredProgress * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold"
                      style={{ width: `${featuredProgress * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openDetail(featured)}
                  className="rounded-xl border border-gold bg-gold/15 px-4 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25"
                >
                  Open title
                </button>
                {featured.status !== 'watching' && (
                  <button
                    onClick={() => updateItem(featured.libraryId, { status: 'watching' })}
                    className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-soft transition hover:border-gold/40 hover:text-gold"
                  >
                    Start watching
                  </button>
                )}
                <span className="text-[10.5px] text-ink-dim">
                  {featured.statusOverride ? 'Pinned status' : 'Status follows your progress'}
                </span>
              </div>
            </div>
            <button
              onClick={() => openDetail(featured)}
              className="hidden w-[118px] shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-2xl transition hover:scale-[1.03] md:block"
            >
              {featured.posterPath ? (
                <img
                  src={`https://image.tmdb.org/t/p/w342${featured.posterPath}`}
                  alt={featured.title}
                  className="aspect-[2/3] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-surface-2 p-3 text-center font-display text-sm text-ink-soft">
                  {featured.title}
                </div>
              )}
            </button>
          </div>
        </motion.section>
      )}

      {/* Quick stats strip */}
      {library.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((s, i) => (
            <StatCard key={s.label} {...s} index={i} reduceMotion={reduceMotion} />
          ))}
        </div>
      )}

      {/* Recent-activity strip — the one place Home shows momentum
          rather than inventory counts. */}
      {activity.some(a => a.count > 0) && (
        <div className="mb-9 rounded-2xl border border-line bg-surface/50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
              Recent activity
            </span>
            <span className="text-[10.5px] text-ink-dim">
              {activity.length} {activity.length === 1 ? 'month' : 'months'} ·{' '}
              {activity.reduce((sum, a) => sum + a.count, 0)} titles added
            </span>
          </div>
          <div className="flex h-9 items-end gap-1">
            {activity.map(a => {
              const max = Math.max(1, ...activity.map(x => x.count))
              return (
                <div
                  key={a.month}
                  title={`${a.label}: ${a.count} ${a.count === 1 ? 'title' : 'titles'}`}
                  className="group relative flex h-full flex-1 items-end"
                >
                  <div
                    className="w-full rounded-sm bg-gold/25 transition-colors group-hover:bg-gold/60"
                    style={{ height: `${Math.max(3, (a.count / max) * 100)}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 flex gap-1">
            {activity.map(a => (
              <span
                key={`label-${a.month}`}
                className="flex-1 truncate text-center text-[9px] text-ink-dim"
              >
                {a.label.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Continue watching */}
      {watching.length > 0 && (
        <Section title="Continue watching" subtitle="Pick up where you left off">
          <Row>
            {watching.slice(0, 8).map((item, i) => (
              <PosterCard key={item.libraryId} item={item} index={i} style={{ width: "var(--poster-w)" }} />
            ))}
          </Row>
        </Section>
      )}

      {/* Recently watched */}
      {recent.length > 0 && (
        <Section title="Your library" subtitle="Recently updated">
          <Row>
            {recent.map((item, i) => (
              <PosterCard key={item.libraryId} item={item} index={i} style={{ width: "var(--poster-w)" }} />
            ))}
          </Row>
        </Section>
      )}

      {/* Trending / discover */}
      <Section
        title="Discover"
        subtitle={library.length ? 'Popular right now' : 'Add these to start your library'}
      >
        <Row>
          {trending.slice(0, 12).map((item, i) => (
            <PosterCard key={catalogKey(item)} item={item} index={i} style={{ width: "var(--poster-w)" }} />
          ))}
        </Row>
      </Section>

      {/* Empty state CTA */}
      {library.length === 0 && (
        <div className="mt-4 flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1d25] to-[#0b0c0f] text-gold shadow-glow">
            <Logo className="h-9 w-9" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-ink">Start your collection</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
              Search the world's movies and series, then mark what you have watched. CineTrack keeps
              your ratings, notes, and episode progress locally on this device.
            </p>
          </div>
          <button
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-gold bg-gold/15 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/25"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Search movies & series
            <kbd className="rounded border border-gold/40 bg-black/30 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
          </button>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10" style={{ marginBottom: 'var(--section-gap)' }}>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-dim">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="row-scroll flex overflow-x-auto pb-3"
      style={{ gap: 'var(--row-gap)' }}
    >
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  index,
  reduceMotion
}: {
  label: string
  value: string
  index: number
  reduceMotion: boolean
}) {
  const tilt = useTilt(6)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.06 * index, ease: [0.16, 1, 0.3, 1] }}
      className="tilt-stage h-full"
      onPointerMove={reduceMotion ? undefined : tilt.onMove}
      onPointerLeave={reduceMotion ? undefined : tilt.onLeave}
    >
      <div
        style={reduceMotion ? undefined : tilt.style}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface-2 to-surface p-4 [transform-style:preserve-3d] transition-colors hover:border-gold/40"
      >
        <HudCorners size={8} />
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
          {label}
        </div>
        <div
          className="mt-1.5 font-display text-2xl font-bold text-gradient-gold"
          style={reduceMotion ? undefined : { transform: 'translateZ(24px)' }}
        >
          {value}
        </div>
      </div>
    </motion.div>
  )
}

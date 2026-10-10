import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useUI, useData } from '../store'
import { api } from '../lib/api'
import { useTilt } from '../lib/use-tilt'
import { formatTotalRuntime, catalogKey } from '@shared/utils'
import type { CatalogItem } from '@shared/types'
import PosterCard from '../components/PosterCard'
import Logo from '../components/Logo'

export default function HomeView() {
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const setBulkOpen = useUI(s => s.setBulkOpen)
  const reduceMotion = useUI(s => s.reduceMotion)
  const library = useData(s => s.library)
  const stats = useData(s => s.stats)

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
    return () => {
      cancelled = true
    }
  }, [])

  const watching = useMemo(() => library.filter(l => l.status === 'watching'), [library])
  const recent = useMemo(
    () => library.filter(l => l.status !== 'planned').slice(0, 12),
    [library]
  )

  const hourCount = stats ? Math.round(stats.totalRuntimeMinutes / 60) : 0

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 5) return 'Still up'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

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

      {/* Quick stats strip */}
      {library.length > 0 && (
        <div className="mb-9 grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((s, i) => (
            <StatCard key={s.label} {...s} index={i} reduceMotion={reduceMotion} />
          ))}
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
      className="tilt-stage"
      onPointerMove={reduceMotion ? undefined : tilt.onMove}
      onPointerLeave={reduceMotion ? undefined : tilt.onLeave}
    >
      <div
        style={reduceMotion ? undefined : tilt.style}
        className="rounded-2xl border border-line bg-gradient-to-br from-surface-2 to-surface p-4 [transform-style:preserve-3d] transition-colors hover:border-gold/40"
      >
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

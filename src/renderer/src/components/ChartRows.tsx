import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import PosterCard from './PosterCard'
import type { CatalogItem } from '@shared/types'

/**
 * The chart rows TMDB exposes as cheap single endpoints. Each one is a
 * curated "what's hot right now" answer that the genre/filter discover grid
 * cannot produce: top rated is a floor on quality, trending is a floor on
 * attention, and now-playing/upcoming are floors on recency.
 *
 * Rows fail independently — a missing API key should blank one row, not the
 * whole page — so each loads and renders in isolation.
 */
interface ChartDef {
  id: string
  title: string
  hint: string
  load: () => Promise<CatalogItem[]>
}

const MOVIE_CHARTS: ChartDef[] = [
  { id: 'trending', title: 'Trending this week', hint: 'What everyone is watching right now', load: () => api.tmdb.trendingBy('movie', 'week') },
  { id: 'top', title: 'Top rated', hint: 'The highest-rated films on TMDB', load: () => api.tmdb.topRated('movie') },
  { id: 'playing', title: 'In theatres', hint: 'Playing now', load: () => api.tmdb.nowPlaying() },
  { id: 'soon', title: 'Coming soon', hint: 'Heading to a screen near you', load: () => api.tmdb.upcoming() }
]

const SERIES_CHARTS: ChartDef[] = [
  { id: 'trending', title: 'Trending this week', hint: 'What everyone is watching right now', load: () => api.tmdb.trendingBy('tv', 'week') },
  { id: 'top', title: 'Top rated', hint: 'The highest-rated shows on TMDB', load: () => api.tmdb.topRated('series') },
  { id: 'airing', title: 'Airing this week', hint: 'New episodes in the next seven days', load: () => api.tmdb.onTheAir('week') }
]

function ChartRow({ def }: { def: ChartDef }) {
  const [items, setItems] = useState<CatalogItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    def
      .load()
      .then(r => !cancelled && setItems(r.slice(0, 20)))
      // A chart that fails simply doesn't render. Blocking the page on one
      // missing endpoint would be worse than an absent row.
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [def.id])

  if (!items || items.length === 0) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-9"
    >
      <div className="mb-3.5 flex items-baseline gap-3">
        <h2 className="font-display text-lg font-bold text-ink">{def.title}</h2>
        <p className="text-xs text-ink-dim">{def.hint}</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(0,1fr))] gap-3 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {items.map((item, i) => (
          <PosterCard key={item.tmdbId} item={item} index={i} className="w-full" />
        ))}
      </div>
    </motion.section>
  )
}

/** The curated chart block shown above the filterable discover grid. */
export function ChartRows({ kind }: { kind: 'movie' | 'series' }) {
  const charts = kind === 'series' ? SERIES_CHARTS : MOVIE_CHARTS
  return (
    <div>
      {charts.map(def => (
        <ChartRow key={def.id} def={def} />
      ))}
    </div>
  )
}
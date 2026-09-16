import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { posterUrl } from '@shared/utils'
import type { SeasonInfo, EpisodeLog } from '@shared/types'

interface SeasonGridProps {
  tmdbId: number | null
  seasonsTotal: number | null
  episodesTotal: number | null
  libraryId: number | undefined
  onLogEpisode: (season: number, episode: number) => void
  loggedEpisodes: EpisodeLog[]
}

/**
 * Full per-season episode checklist. Loads each season on demand from TMDB and
 * overlays the user's watched episodes, with a progress bar and a "next up"
 * suggestion so it's easy to resume a show.
 */
export default function SeasonGrid({
  tmdbId,
  seasonsTotal,
  libraryId,
  onLogEpisode,
  loggedEpisodes
}: SeasonGridProps) {
  const [season, setSeason] = useState(1)
  const [data, setData] = useState<SeasonInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tmdbId) return
    setLoading(true)
    api.tmdb
      .season(tmdbId, season)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [tmdbId, season])

  if (!tmdbId) {
    return (
      <p className="mt-1 text-[11px] text-ink-dim">
        Connect TMDB in Settings to browse episodes and track progress.
      </p>
    )
  }

  const watchedSet = new Set(
    loggedEpisodes.map(e => `${e.season}-${e.episode}`)
  )
  const seasonNumbers = Array.from(
    { length: Math.max(1, seasonsTotal ?? 1) },
    (_, i) => i + 1
  )

  // Next unwatched episode within the loaded season.
  const nextUp = data?.episodes.find(e => !watchedSet.has(`${e.seasonNumber}-${e.episodeNumber}`))

  const seasonWatched = data
    ? data.episodes.filter(e => watchedSet.has(`${e.seasonNumber}-${e.episodeNumber}`)).length
    : 0
  const seasonTotal = data?.episodes.length ?? 0
  const pct = seasonTotal ? Math.round((seasonWatched / seasonTotal) * 100) : 0

  return (
    <div className="mt-5 rounded-2xl border border-line bg-surface/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={season}
          onChange={e => setSeason(Number(e.target.value))}
          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft focus:border-gold focus:outline-none"
        >
          {seasonNumbers.map(n => (
            <option key={n} value={n} className="bg-surface text-ink">
              Season {n}
            </option>
          ))}
        </select>

        <div className="flex flex-1 items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="shrink-0 text-[10.5px] font-medium text-ink-dim">
            {seasonWatched}/{seasonTotal}
          </span>
        </div>
      </div>

      {nextUp && (
        <button
          onClick={() => onLogEpisode(nextUp.seasonNumber, nextUp.episodeNumber)}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-3 py-2.5 text-left transition hover:bg-gold/10"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gold">
              Next up
            </div>
            <div className="truncate text-xs font-medium text-ink">
              S{nextUp.seasonNumber}E{nextUp.episodeNumber} · {nextUp.name}
            </div>
          </div>
          {nextUp.airDate && (
            <span className="shrink-0 text-[10.5px] text-ink-dim">
              {new Date(nextUp.airDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
          )}
        </button>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2.5 text-xs text-ink-dim">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          Loading episodes…
        </div>
      ) : data && data.episodes.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1.5">
          {data.episodes.map((ep, i) => {
            const watched = watchedSet.has(`${ep.seasonNumber}-${ep.episodeNumber}`)
            return (
              <motion.button
                key={ep.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.012, 0.3) }}
                onClick={() => onLogEpisode(ep.seasonNumber, ep.episodeNumber)}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                  watched
                    ? 'border-emerald/20 bg-emerald/[0.05]'
                    : 'border-line bg-surface/60 hover:border-gold/40'
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
                    watched
                      ? 'border-emerald/40 bg-emerald/15 text-emerald'
                      : 'border-line text-ink-dim group-hover:border-gold/50 group-hover:text-gold'
                  )}
                >
                  {watched ? '✓' : ep.episodeNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate text-xs font-medium',
                      watched ? 'text-ink-soft' : 'text-ink'
                    )}
                  >
                    {ep.name || `Episode ${ep.episodeNumber}`}
                  </div>
                  {ep.airDate && (
                    <div className="text-[10px] text-ink-dim">
                      {new Date(ep.airDate).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      {ep.runtime ? ` · ${ep.runtime}m` : ''}
                    </div>
                  )}
                </div>
                {ep.stillPath && (
                  <div className="h-9 w-16 shrink-0 overflow-hidden rounded">
                    <img
                      src={posterUrl(ep.stillPath, 'w185') ?? undefined}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover opacity-70"
                    />
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-dim">No episode data for this season.</p>
      )}

      {libraryId === undefined && (
        <p className="mt-3 text-[10.5px] text-ink-dim">
          Add this series to your library to start logging episodes.
        </p>
      )}
    </div>
  )
}

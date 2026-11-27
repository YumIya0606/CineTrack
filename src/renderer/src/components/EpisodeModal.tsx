import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { profileUrl } from '@shared/utils'
import type { EpisodeCredits } from '@shared/types'

/**
 * Cast, guest stars and key crew for one episode. It is reached from a small
 * info button on the season checklist, so the main row still does the common
 * thing: log the episode.
 */
export default function EpisodeModal({
  tvId,
  season,
  episode,
  title,
  onClose,
  onPickPerson
}: {
  tvId: number
  season: number
  episode: number
  title: string
  onClose: () => void
  onPickPerson: (personId: number) => void
}) {
  const [credits, setCredits] = useState<EpisodeCredits | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.tmdb
      .episodeCredits(tvId, season, episode)
      .then(c => !cancelled && setCredits(c))
      .catch(() => !cancelled && setError('Could not load episode credits.'))
    return () => {
      cancelled = true
    }
  }, [tvId, season, episode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        onClick={e => e.stopPropagation()}
        className="relative my-auto w-full max-w-3xl rounded-2xl border border-line bg-surface-2 p-7 shadow-2xl"
      >
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold">
          S{season}E{episode}
        </span>
        <h2 className="mt-2 font-display text-xl font-bold text-ink">{title}</h2>

        {error ? (
          <p className="py-8 text-center text-sm text-ink-dim">{error}</p>
        ) : !credits ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-gold" />
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {credits.guestStars.length > 0 && (
              <CreditRow
                label="Guest stars"
                people={credits.guestStars.map(p => ({
                  id: p.personId,
                  name: p.name,
                  sub: p.character,
                  profilePath: p.profilePath
                }))}
                onPick={onPickPerson}
              />
            )}
            {credits.cast.length > 0 && (
              <CreditRow
                label="Cast"
                people={credits.cast.map(p => ({
                  id: p.personId,
                  name: p.name,
                  sub: p.character,
                  profilePath: p.profilePath
                }))}
                onPick={onPickPerson}
              />
            )}
            {credits.crew.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                  Key crew
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {credits.crew.map(c => (
                    <button
                      key={`${c.personId}-${c.job}`}
                      onClick={() => onPickPerson(c.personId)}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-ink-soft transition hover:border-gold/50 hover:text-gold"
                    >
                      <span className="text-ink-dim">{c.job ?? c.department}: </span>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {credits.guestStars.length === 0 && credits.cast.length === 0 && (
              <p className="text-center text-sm text-ink-dim">No credits listed for this episode.</p>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink-soft transition hover:border-gold/50 hover:text-gold"
        >
          Close
        </button>
      </motion.div>
    </div>
  )
}

function CreditRow({
  label,
  people,
  onPick
}: {
  label: string
  people: { id: number; name: string; sub: string | null; profilePath: string | null }[]
  onPick: (id: number) => void
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{label}</div>
      <div className="row-scroll mt-2 flex gap-3 overflow-x-auto pb-2">
        {people.map(p => (
          <button
            key={`${p.id}-${p.name}`}
            onClick={() => onPick(p.id)}
            className="group w-[72px] shrink-0 text-center"
          >
            <div className="mx-auto h-14 w-14 overflow-hidden rounded-full border border-line bg-surface transition group-hover:border-gold/60">
              {p.profilePath ? (
                <img
                  src={profileUrl(p.profilePath, 'w185') ?? undefined}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-ink-dim">
                  {p.name
                    .split(' ')
                    .map(w => w[0])
                    .slice(0, 2)
                    .join('')}
                </div>
              )}
            </div>
            <div className="mt-1 truncate text-[10px] font-medium text-ink group-hover:text-gold">
              {p.name}
            </div>
            {p.sub && <div className="truncate text-[9px] text-ink-dim">{p.sub}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { profileUrl } from '@shared/utils'
import { Skeleton } from './Skeleton'
import type { TrendingPerson } from '@shared/types'

/**
 * Trending actors/creators from /trending/person. It reuses the person modal
 * already reachable from a cast row, so a face is a way into the catalog
 * rather than a dead-end profile. Failures hide the rail entirely.
 */
export default function PeopleRail({ onPick }: { onPick: (personId: number) => void }) {
  const [people, setPeople] = useState<TrendingPerson[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.tmdb
      .trendingPeople('week')
      .then(list => !cancelled && setPeople(list.slice(0, 14)))
      .catch(() => !cancelled && setPeople([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (people !== null && people.length === 0) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-7"
    >
      <div className="mb-3.5 flex items-baseline gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Trending people</h2>
        <p className="text-xs text-ink-dim">The faces everyone is talking about this week</p>
      </div>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-3">
        {people === null
          ? Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] w-[88px] shrink-0 rounded-full" />
            ))
          : people.map(p => (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                title={p.knownFor ? `Known for ${p.knownFor}` : p.name}
                className="group w-[88px] shrink-0 text-center"
              >
                <div className="mx-auto h-[76px] w-[76px] overflow-hidden rounded-full border border-line bg-surface-2 transition group-hover:border-gold/60">
                  {p.profilePath ? (
                    <img
                      src={profileUrl(p.profilePath, 'w185') ?? undefined}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-3 to-surface font-display text-sm font-semibold text-ink-dim">
                      {p.name
                        .split(' ')
                        .map(w => w[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                  )}
                </div>
                <div className="mt-1.5 truncate text-[10.5px] font-medium text-ink group-hover:text-gold">
                  {p.name}
                </div>
                <div className="truncate text-[9px] uppercase tracking-wide text-ink-dim">
                  {p.knownForDepartment ?? 'Acting'}
                </div>
              </button>
            ))}
      </div>
    </motion.section>
  )
}

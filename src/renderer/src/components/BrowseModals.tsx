import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import PosterCard from './PosterCard'
import type { PersonDetails, CollectionDetails, CatalogItem } from '@shared/types'
import { summaryToItem } from '@shared/utils'

/**
 * A person's filmography: the cast and directing credits TMDB knows about, in
 * reverse-chronological order. Clicking a credit opens that title like any
 * other poster, so a person's page is a way *into* the catalog rather than a
 * dead-end profile.
 */
export function PersonModal({
  personId,
  onClose,
  onPick
}: {
  personId: number
  onClose: () => void
  onPick: (item: CatalogItem) => void
}) {
  const [person, setPerson] = useState<PersonDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.tmdb
      .person(personId)
      .then(p => !cancelled && setPerson(p))
      .catch(() => !cancelled && setError('Could not load this person.'))
    return () => {
      cancelled = true
    }
  }, [personId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const credits: CatalogItem[] = (person?.credits ?? []).map(summaryToItem)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        onClick={e => e.stopPropagation()}
        className="my-auto w-full max-w-5xl rounded-2xl border border-line bg-surface-2 p-7 shadow-2xl"
      >
        {error ? (
          <p className="py-10 text-center text-sm text-ink-dim">{error}</p>
        ) : !person ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-gold" />
          </div>
        ) : (
          <>
            <div className="flex gap-5">
              {person.profilePath && (
                <img
                  src={person.profilePath}
                  alt=""
                  className="h-40 w-40 shrink-0 rounded-xl border border-line object-cover"
                />
              )}
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-bold text-ink">{person.name}</h2>
                {(person.birthday || person.placeOfBirth) && (
                  <p className="mt-1 text-xs text-ink-dim">
                    {person.birthday?.slice(0, 4)}
                    {person.deathday ? ` – ${person.deathday.slice(0, 4)}` : ''}
                    {person.placeOfBirth ? ` · ${person.placeOfBirth}` : ''}
                  </p>
                )}
                {person.biography && (
                  <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-relaxed text-ink-soft">
                    {person.biography}
                  </p>
                )}
              </div>
            </div>

            {credits.length > 0 && (
              <div className="mt-7">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                  Known for · {credits.length}
                </h3>
                <div className="mt-3 flex flex-wrap gap-3">
                  {credits.map(c => (
                    <PosterCard
                      key={c.tmdbId}
                      item={c}
                      onClick={() => onPick(c)}
                      className="w-[132px]"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
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

/**
 * A franchise in release order. Watching a franchise is sequential by nature,
 * so the parts are numbered rather than left to a poster wall to imply it.
 */
export function CollectionModal({
  collectionId,
  onClose,
  onPick
}: {
  collectionId: number
  onClose: () => void
  onPick: (item: CatalogItem) => void
}) {
  const [coll, setColl] = useState<CollectionDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.tmdb
      .collection(collectionId)
      .then(c => !cancelled && setColl(c))
      .catch(() => !cancelled && setError('Could not load this collection.'))
    return () => {
      cancelled = true
    }
  }, [collectionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const parts: CatalogItem[] = (coll?.parts ?? []).map(summaryToItem)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        onClick={e => e.stopPropagation()}
        className="relative my-auto w-full max-w-5xl rounded-2xl border border-line bg-surface-2 p-7 shadow-2xl"
      >
        {error ? (
          <p className="py-10 text-center text-sm text-ink-dim">{error}</p>
        ) : !coll ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-gold" />
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold text-ink">{coll.name}</h2>
            {coll.overview && (
              <p className="mt-2 max-h-24 overflow-y-auto text-sm leading-relaxed text-ink-soft">
                {coll.overview}
              </p>
            )}

            {parts.length > 0 && (
              <div className="mt-7 space-y-3">
                {parts.map((p, i) => (
                  <button
                    key={p.tmdbId}
                    onClick={() => onPick(p)}
                    className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-3 text-left transition hover:border-gold/40"
                  >
                    <span
                      className={cn(
                        'w-8 shrink-0 text-center font-display text-lg font-bold',
                        i === 0 ? 'text-gold' : 'text-ink-dim'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                      <span className="text-xs text-ink-dim">{p.year ?? '—'}</span>
                    </span>
                    {p.voteAverage != null && (
                      <span className="shrink-0 text-xs text-ink-soft">
                        {p.voteAverage.toFixed(1)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
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
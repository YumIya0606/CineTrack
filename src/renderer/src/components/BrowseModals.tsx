import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import PosterCard from './PosterCard'
import type { PersonDetails, CollectionDetails, CatalogItem } from '@shared/types'
import { summaryToItem, profileUrl } from '@shared/utils'

/** Credits shown before the user asks for the rest. */
const KNOWN_FOR_PAGE = 18

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
  const [showAllCredits, setShowAllCredits] = useState(false)

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
                  src={profileUrl(person.profilePath, 'h632') ?? undefined}
                  alt=""
                  loading="lazy"
                  className="h-44 w-44 shrink-0 rounded-xl border border-line object-cover"
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
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                    Known for · {credits.length}
                  </h3>
                  {credits.length > KNOWN_FOR_PAGE && (
                    <button
                      onClick={() => setShowAllCredits(v => !v)}
                      className="text-[11px] text-ink-dim transition hover:text-gold"
                    >
                      {showAllCredits ? 'Show less' : `Show all ${credits.length}`}
                    </button>
                  )}
                </div>
                {/* A prolific actor has hundreds of credits. Rendering all of
                    them is a wall of posters that hides the ones that matter —
                    TMDB already returns them newest-first, so the first page is
                    the recent and relevant work. */}
                <div className="mt-3 flex flex-wrap gap-3">
                  {(showAllCredits ? credits : credits.slice(0, KNOWN_FOR_PAGE)).map(c => (
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
/**
 * A keyword page. TMDB keywords are the closest thing to a mood/theme shelf,
 * so each chip on a detail panel becomes a browsable list of both films and
 * series. Name and titles arrive together from one IPC call.
 */
export function KeywordModal({
  keywordId,
  onClose,
  onPick
}: {
  keywordId: number
  onClose: () => void
  onPick: (item: CatalogItem) => void
}) {
  const [page, setPage] = useState<{ id: number; name: string; items: CatalogItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.tmdb
      .keywordPage(keywordId)
      .then(p => !cancelled && setPage(p))
      .catch(() => !cancelled && setError('Could not load this keyword.'))
    return () => {
      cancelled = true
    }
  }, [keywordId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <BrowseModalShell onClose={onClose} wide>
      {error ? (
        <p className="py-10 text-center text-sm text-ink-dim">{error}</p>
      ) : !page ? (
        <BrowseLoading />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold">
              Keyword
            </span>
            <h2 className="font-display text-2xl font-bold text-ink">{page.name}</h2>
            <span className="text-xs text-ink-dim">
              {page.items.length} {page.items.length === 1 ? 'title' : 'titles'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-dim">
            Movies and series tagged with this theme on TMDB.
          </p>

          {page.items.length > 0 ? (
            <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {page.items.slice(0, 36).map((item, i) => (
                <PosterCard
                  key={`${item.tmdbId ?? item.id}-${i}`}
                  item={item}
                  index={i}
                  onClick={() => onPick(item)}
                  className="w-full"
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-dim">
              No titles tagged with this keyword yet.
            </p>
          )}
        </>
      )}
    </BrowseModalShell>
  )
}

/**
 * A production company or TV network page. Both use the same shell because a
 * studio is just a name, a logo and a filmography; the discover parameter is
 * the only thing that differs.
 */
export function StudioModal({
  studioId,
  studioKind,
  onClose,
  onPick
}: {
  studioId: number
  studioKind: 'company' | 'network'
  onClose: () => void
  onPick: (item: CatalogItem) => void
}) {
  const [page, setPage] = useState<{
    id: number
    name: string
    description: string | null
    logoPath: string | null
    headquarters: string | null
    country: string | null
    kind: 'company' | 'network'
    items: CatalogItem[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.tmdb
      .studioPage(studioId, studioKind)
      .then(p => !cancelled && setPage(p))
      .catch(() => !cancelled && setError('Could not load this studio.'))
    return () => {
      cancelled = true
    }
  }, [studioId, studioKind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <BrowseModalShell onClose={onClose} wide>
      {error ? (
        <p className="py-10 text-center text-sm text-ink-dim">{error}</p>
      ) : !page ? (
        <BrowseLoading />
      ) : (
        <>
          <div className="flex items-start gap-4">
            {page.logoPath && (
              <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl border border-line bg-surface p-2">
                <img
                  src={`https://image.tmdb.org/t/p/w185${page.logoPath}`}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
            <div className="min-w-0">
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-dim">
                {page.kind === 'network' ? 'Network' : 'Studio'}
              </span>
              <h2 className="mt-1 font-display text-2xl font-bold text-ink">{page.name}</h2>
              {(page.headquarters || page.country) && (
                <p className="mt-1 text-xs text-ink-dim">
                  {[page.headquarters, page.country].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {page.description && (
            <p className="mt-4 max-h-28 overflow-y-auto text-sm leading-relaxed text-ink-soft">
              {page.description}
            </p>
          )}

          {page.items.length > 0 ? (
            <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {page.items.slice(0, 36).map((item, i) => (
                <PosterCard
                  key={`${item.tmdbId ?? item.id}-${i}`}
                  item={item}
                  index={i}
                  onClick={() => onPick(item)}
                  className="w-full"
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-dim">
              No titles found for this {page.kind}.
            </p>
          )}
        </>
      )}
    </BrowseModalShell>
  )
}

/** Shared modal chrome so keyword/studio pages read like the rest of the app. */
function BrowseModalShell({
  children,
  onClose,
  wide = false
}: {
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
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
        className={cn(
          'relative my-auto w-full rounded-2xl border border-line bg-surface-2 p-7 shadow-2xl',
          wide ? 'max-w-5xl' : 'max-w-3xl'
        )}
      >
        {children}
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

function BrowseLoading() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-gold" />
    </div>
  )
}

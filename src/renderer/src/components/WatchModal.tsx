import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { getResumePoint, saveResumePoint, clearResumePoint } from '../lib/watch-progress'
import SubtitleOverlay from './SubtitleOverlay'
import type { MediaKind } from '@shared/types'

interface WatchModalProps {
  tmdbId: number | null
  /** Needed for subtitle lookup — every subtitle provider keys on IMDb id. */
  imdbId?: string | null
  kind: MediaKind
  title: string
  /** Total season count for series — drives the season picker. */
  seasonsTotal?: number | null
  season?: number | null
  episode?: number | null
  onClose: () => void
  /** Called when the user marks an episode/movie as watched from the player. */
  onMarkWatched?: (season: number | null, episode: number | null) => void
}

/**
 * Free streaming sources. These are public TMDB-ID embed providers that play
 * in a sandboxed webview in the ad-blocked player partition — nothing is
 * downloaded to disk. Availability varies by title and region, and providers
 * do go dark, so the user can switch sources if one fails.
 *
 * Kept deliberately short — every entry below is verified working end to end:
 *   - VidLink    — cleanest player, TMDB-id native, plays in-page. Default.
 *   - MultiEmbed — TMDB-id native, plays in-page. Reliable second choice.
 *
 * Removed after real-world testing:
 *   - SmashyStream / VidSrc — render the embed shell but the inner player
 *     never produces a frame, so the panel goes blank once the loading veil
 *     drops.
 *   - StreamingNow — answers "Not found! This video doesn't exist." for both
 *     numeric TMDB ids and IMDb ids.
 *   - 2Embed — its embed does window.location.replace to a *detail* page (not
 *     a player) whenever it is the top-level frame, which a webview always is.
 */
const SOURCES = [
  {
    id: 'vidlink',
    label: 'VidLink',
    movie: (id: number) => `https://vidlink.pro/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}`
  },
  {
    id: 'multiembed',
    label: 'MultiEmbed',
    movie: (id: number) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tv: (id: number, s: number, e: number) =>
      `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
  }
]

/**
 * Free in-app streaming. Plays movies and series from public embed providers
 * keyed by TMDB id, with a source switcher for when a provider is down and a
 * season/episode picker for TV.
 */
export default function WatchModal({
  tmdbId,
  imdbId,
  kind,
  title,
  seasonsTotal,
  season: initialSeason,
  episode: initialEpisode,
  onClose,
  onMarkWatched
}: WatchModalProps) {
  const [sourceId, setSourceId] = useState(SOURCES[0]!.id)
  const [season, setSeason] = useState(initialSeason ?? 1)
  const [episode, setEpisode] = useState(initialEpisode ?? 1)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [autoMarked, setAutoMarked] = useState(false)
  const resumed = useRef(false)
  const watchedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wall-clock playback position for the subtitle overlay. The embed exposes no
  // <video> we can read (verified), so we own the clock and the user corrects
  // it with one-click sync.
  const [position, setPosition] = useState(0)
  const [subtitlesOn, setSubtitlesOn] = useState(false)
  const clockRef = useRef<number | null>(null)
  const startedAt = useRef<number>(Date.now())

  const source = SOURCES.find(s => s.id === sourceId)!
  const seasonCount = Math.max(1, seasonsTotal ?? 1)
  const webviewRef = useRef<HTMLWebViewElement>(null)
  const veilTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const src =
    tmdbId !== null
      ? kind === 'series'
        ? source.tv(tmdbId, season, episode)
        : source.movie(tmdbId)
      : null

  // Restore the last source + episode for this title on open.
  useEffect(() => {
    if (tmdbId === null || resumed.current) return
    resumed.current = true
    getResumePoint(tmdbId, kind).then(pos => {
      if (!pos) return
      if (pos.sourceId && SOURCES.some(s => s.id === pos.sourceId)) setSourceId(pos.sourceId)
      if (kind === 'series') {
        if (pos.season) setSeason(Math.min(pos.season, seasonCount))
        if (pos.episode) setEpisode(pos.episode)
      }
    })
  }, [tmdbId, kind, seasonCount])

  // Persist the current position whenever it changes.
  useEffect(() => {
    if (tmdbId === null) return
    const t = setTimeout(() => {
      saveResumePoint(tmdbId, kind, { sourceId, season, episode, updatedAt: Date.now() })
    }, 400)
    return () => clearTimeout(t)
  }, [tmdbId, kind, sourceId, season, episode])

  // Drive the subtitle clock. Restarting on episode/source change keeps the
  // timeline aligned with whatever the user just loaded.
  useEffect(() => {
    startedAt.current = Date.now()
    setPosition(0)
    clockRef.current = window.setInterval(() => {
      setPosition((Date.now() - startedAt.current) / 1000)
    }, 250)
    return () => {
      if (clockRef.current) window.clearInterval(clockRef.current)
      clockRef.current = null
    }
  }, [src, reloadKey])

  // Auto-mark watched after the player has been up long enough to count as a
  // real view (or 60% of a movie's runtime when known).
  useEffect(() => {
    if (!src || !onMarkWatched || autoMarked) return
    const t = setTimeout(() => {
      setAutoMarked(true)
      onMarkWatched(kind === 'series' ? season : null, kind === 'series' ? episode : null)
    }, 90_000)
    watchedTimer.current = t
    return () => clearTimeout(t)
  }, [src, onMarkWatched, autoMarked, kind, season, episode])

  // Dismiss the loading veil. Provider pages commonly never fire a clean
  // `load`: the ad blocker cancels and hangs sub-resources, so the page is
  // already visible (poster, skip button, player) while the load event never
  // completes. Clear the veil on any load signal the webview emits, and on a
  // safety timer as a last resort.
  const clearLoading = useCallback(() => {
    setLoading(false)
    if (veilTimer.current) {
      clearTimeout(veilTimer.current)
      veilTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (!src) return
    setLoading(true)
    setFailed(false)

    const wv = webviewRef.current
    if (wv) {
      // React's onLoad misses these pages; the raw element events fire even
      // when hanging sub-resources keep the document load event from settling.
      wv.addEventListener('did-stop-loading', clearLoading)
      wv.addEventListener('did-finish-load', clearLoading)
      wv.addEventListener('dom-ready', clearLoading)
      wv.addEventListener('load', clearLoading)
    }
    // Never leave the spinner up for long — even if every event above is
    // swallowed, the player has to stay reachable.
    veilTimer.current = setTimeout(clearLoading, 6000)

    return () => {
      if (wv) {
        wv.removeEventListener('did-stop-loading', clearLoading)
        wv.removeEventListener('did-finish-load', clearLoading)
        wv.removeEventListener('dom-ready', clearLoading)
        wv.removeEventListener('load', clearLoading)
      }
      if (veilTimer.current) {
        clearTimeout(veilTimer.current)
        veilTimer.current = null
      }
    }
  }, [src, reloadKey, clearLoading])

  // Manual "Mark watched" must claim the same one-shot the auto-timer uses,
  // otherwise a click inside the 90s window is followed by the timer firing
  // too and the same viewing is logged twice.
  const markWatched = () => {
    if (autoMarked) return
    setAutoMarked(true)
    onMarkWatched?.(kind === 'series' ? season : null, kind === 'series' ? episode : null)
  }

  const handleClose = () => {
    if (autoMarked && tmdbId) clearResumePoint(tmdbId, kind).catch(() => {})
    onClose()
  }

  // Kept in a ref so the Escape listener (registered once) always calls the
  // current close handler — it previously captured a stale one and skipped
  // clearing the resume point after an auto-mark.
  const closeRef = useRef(handleClose)
  closeRef.current = handleClose

  useEffect(() => {
    if (!tmdbId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tmdbId])

  if (!tmdbId || !src) return null

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <motion.div
        className="relative w-[min(1100px,95vw)] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
        initial={{ scale: 0.95, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <span className="truncate text-sm font-medium text-ink">
            <span className="text-ink-dim">Watch · </span>
            {title}
            {kind === 'series' && (
              <span className="text-ink-dim"> · S{season} E{episode}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {autoMarked && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1.5 text-[11px] font-medium text-emerald">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Logged as watched
              </span>
            )}
            {onMarkWatched && !autoMarked && (
              <button
                onClick={markWatched}
                className="flex items-center gap-1.5 rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1.5 text-[11px] font-medium text-emerald transition hover:bg-emerald/20"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Mark watched
              </button>
            )}
            <button
              onClick={() => setReloadKey(k => k + 1)}
              title="Reload the player"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-ink-soft transition hover:border-gold hover:text-gold"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 11a8 8 0 10-2.6 5.9M20 5v6h-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-ink-soft transition hover:border-gold hover:text-gold"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Source + episode controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0d0e12] px-5 py-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
            Source
          </span>
          {SOURCES.map(s => (
            <button
              key={s.id}
              onClick={() => setSourceId(s.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-medium transition',
                sourceId === s.id
                  ? 'border-gold/60 bg-gold/15 text-gold'
                  : 'border-line bg-surface text-ink-soft hover:border-gold/40 hover:text-ink'
              )}
            >
              {s.label}
            </button>
          ))}

          {kind === 'series' && (
            <div className="ml-auto flex items-center gap-2">
              <select
                value={season}
                onChange={e => {
                  setSeason(Number(e.target.value))
                  setEpisode(1)
                }}
                className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-soft focus:border-gold focus:outline-none"
              >
                {Array.from({ length: seasonCount }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n} className="bg-surface text-ink">
                    Season {n}
                  </option>
                ))}
              </select>
              <select
                value={episode}
                onChange={e => setEpisode(Number(e.target.value))}
                className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-soft focus:border-gold focus:outline-none"
              >
                {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n} className="bg-surface text-ink">
                    Episode {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="relative aspect-video w-full bg-black">
          <webview
            ref={webviewRef}
            key={`${sourceId}-${season}-${episode}-${reloadKey}`}
            src={src}
            // The dedicated partition is where the EasyList-grade blocker
            // lives — ads are cancelled at the network layer, so ad scripts
            // never run and can never spawn a popup in the first place. The
            // main process denies every popup these frames spawn too, so the
            // webview needs no allowpopups attribute (its absence denies them).
            partition="persist:player"
            className="h-full w-full"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
          />
          {loading && (
            // pointer-events-none on purpose: the veil is only decoration. The
            // provider's own skip/play buttons must stay clickable even while
            // the spinner is still up, because the load event that would
            // dismiss it often never comes on an ad-blocked page.
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 rounded-full bg-black/55 px-4 py-2 text-sm text-ink-dim backdrop-blur">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                Loading stream…
              </div>
            </div>
          )}
          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <div className="text-sm font-medium text-ink-soft">This source didn't load</div>
              <div className="text-[11px] text-ink-dim">
                Providers go down often — try another source below.
              </div>
              <button
                onClick={() => {
                  setFailed(false)
                  setReloadKey(k => k + 1)
                }}
                className="rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/25"
              >
                Retry
              </button>
            </div>
          )}

          {/* Subtitles render above the embed. The webview is cross-origin and
              exposes no <video> we can read (verified against the live
              providers), so the overlay drives off our own clock and the user
              calibrates it with Sync. */}
          {tmdbId !== null && (
            <SubtitleOverlay
              tmdbId={tmdbId}
              imdbId={imdbId ?? null}
              kind={kind}
              season={kind === 'series' ? season : null}
              episode={kind === 'series' ? episode : null}
              position={position}
              visible={subtitlesOn && !loading}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[10.5px] text-ink-dim">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/5 px-2 py-0.5 text-emerald">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
            Ad blocker on
          </span>
          <button
            onClick={() => setSubtitlesOn(v => !v)}
            className={cn(
              'rounded-full border px-2 py-0.5 transition',
              subtitlesOn
                ? 'border-gold/50 bg-gold/15 text-gold'
                : 'border-line bg-surface text-ink-soft hover:border-gold/40 hover:text-ink'
            )}
            title="Toggle the subtitle overlay"
          >
            Subtitles {subtitlesOn ? 'on' : 'off'}
          </button>
          <span>Streams come from third-party providers. If one fails, switch sources above.</span>
        </div>
      </motion.div>
    </motion.div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import type { SubtitleProviderReport, SubtitleCandidate, SubtitleCue, SubtitleTrack } from '../lib/api'
import { cn } from '../lib/utils'
import { SUB_LANGUAGES } from '../lib/languages'

interface SubtitleOverlayProps {
  tmdbId: number
  imdbId: string | null
  kind: 'movie' | 'series'
  season?: number | null
  episode?: number | null
  /** Wall-clock seconds since playback started. */
  position: number
  /**
   * True when `position` came from the provider's own reported currentTime
   * rather than our wall clock. Only then is the overlay frame-accurate.
   */
  exactClock?: boolean
  visible: boolean
  /** Preferred subtitle language (BCP-47-ish 2-letter code). */
  language: string
  onLanguageChange?: (code: string) => void
  onVisibilityChange?: (on: boolean) => void
}

/**
 * Renders subtitles above the provider webview.
 *
 * We cannot read the player's own clock — the embed chain is cross-origin and
 * exposes no <video> (verified by probing vidsrc.to). So we drive from our own
 * clock and let the user calibrate. `syncNow` is the important affordance: when
 * they spot a line they recognise, one key press pins that cue to the current
 * moment and rewrites the whole track's offset. That is what makes this more
 * accurate than trusting the provider, rather than less.
 */
export default function SubtitleOverlay(props: SubtitleOverlayProps) {
  const {
    tmdbId,
    imdbId,
    kind,
    season,
    episode,
    position,
    exactClock,
    visible,
    language,
    onLanguageChange
  } = props

  const [track, setTrack] = useState<SubtitleTrack | null>(null)
  const [offset, setOffset] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [candidates, setCandidates] = useState<SubtitleCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reports, setReports] = useState<SubtitleProviderReport[] | null>(null)

  // Offset is per (title, episode) so calibration survives a rewatch.
  const offsetKey = `cinetrack.sub-offset.${tmdbId}.${season ?? 'm'}.${episode ?? 'm'}`

  useEffect(() => {
    const stored = Number(localStorage.getItem(offsetKey) ?? '0')
    setOffset(Number.isFinite(stored) ? stored : 0)
  }, [offsetKey])

  // Restore a cached track on open — no network, works offline.
  useEffect(() => {
    let cancelled = false
    api.subtitles
      .cached(tmdbId, kind, language, season, episode)
      .then(t => {
        if (!cancelled) setTrack(t)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [tmdbId, kind, season, episode, language])

  // Current cue. Binary search keeps this cheap for long films.
  const activeCue = useMemo<SubtitleCue | null>(() => {
    if (!track) return null
    const t = position - offset
    const cues = track.cues
    let lo = 0
    let hi = cues.length - 1
    let found: SubtitleCue | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const c = cues[mid]!
      if (t < c.start) hi = mid - 1
      else if (t > c.end) {
        lo = mid + 1
      } else {
        found = c
        break
      }
    }
    return found
  }, [track, position, offset])

  /**
   * True when our clock is the player's real clock and no calibration is
   * needed. WatchModal tells us by passing an exact position; the offset is
   * then almost always zero, and we say so instead of showing a Sync button
   * that would do nothing.
   */
  const exactlySynced = Boolean(exactClock) && Math.abs(offset) < 0.4

  const persistOffset = useCallback(
    (next: number) => {
      const clamped = Math.max(-600, Math.min(600, next))
      setOffset(clamped)
      localStorage.setItem(offsetKey, String(clamped))
    },
    [offsetKey]
  )

  /**
   * One-click sync: pin the cue the user is looking at to "now". Everything
   * before it shifts by the difference.
   */
  const syncNow = useCallback(() => {
    if (!activeCue) return
    persistOffset(offset + (position - activeCue.start))
  }, [activeCue, position, offset, persistOffset])

const search = useCallback(async () => {
    setPickerOpen(true)
    setLoading(true)
    setError(null)
    setReports(null)
    try {
      const res = await api.subtitles.search(
        tmdbId,
        kind,
        imdbId,
        season ?? null,
        episode ?? null,
        language
      )
      setCandidates(res.candidates)
      setReports(res.providers)

      if (!res.candidates.length) {
        // Say *why* it was empty. "No subtitles found" for a rejected API key
        // is indistinguishable from a film that genuinely has none, and the
        // user has no way to tell which they are looking at.
        if (res.nothingConfigured) {
          setError('No subtitle source is set up. Add a SubDL key in Settings → Playback.')
          return
        }
        const failed = res.providers.filter(p => !p.ok)
        if (failed.length) {
          setError(failed.map(p => `${p.label}: ${p.error}`).join('\n'))
          return
        }
        setError(
          imdbId
            ? 'No subtitles found for this title.'
            : "No subtitles found. This title has no IMDb id yet, which some sources need — open it once with TMDB connected."
        )
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [imdbId, season, episode, language])

  const load = useCallback(
    async (candidate: SubtitleCandidate) => {
      setLoading(true)
      setError(null)
      try {
        const loaded = await api.subtitles.load(candidate, tmdbId, kind, season, episode)
        setTrack(loaded)
        setPickerOpen(false)
        persistOffset(0)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [tmdbId, kind, season, episode, persistOffset]
  )

  return (
    <>
      {/* ---------- Subtitle text ---------- */}
      <AnimatePresence>
        {visible && activeCue && (
          <motion.div
            key={activeCue.start}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-8"
          >
            <div className="max-w-[80%] whitespace-pre-line rounded-lg bg-black/75 px-4 py-2 text-center text-[17px] font-medium leading-snug text-white shadow-lg backdrop-blur-sm">
              {activeCue.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Controls strip ---------- */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        {track && (
          <>
            <button
              onClick={syncNow}
              title="Pin the current line to now (one-click sync)"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur transition',
                exactlySynced
                  ? 'border-emerald/40 bg-emerald/10 text-emerald'
                  : 'border-gold/50 bg-gold/15 text-gold hover:bg-gold/25'
              )}
            >
              {exactlySynced ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 12.5l5 5L20 6.5"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  In sync
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Sync
                </>
              )}
            </button>
            <div className="flex h-8 items-center gap-1 rounded-full border border-white/15 bg-black/60 px-1 backdrop-blur">
              <button
                onClick={() => persistOffset(offset - 0.5)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-white/80 transition hover:bg-white/10 hover:text-gold"
                title="Earlier by 0.5s"
              >
                −
              </button>
              <span className="min-w-[42px] text-center text-[10.5px] tabular-nums text-white/70">
                {offset >= 0 ? '+' : ''}
                {offset.toFixed(1)}s
              </span>
              <button
                onClick={() => persistOffset(offset + 0.5)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-white/80 transition hover:bg-white/10 hover:text-gold"
                title="Later by 0.5s"
              >
                +
              </button>
            </div>
          </>
        )}

        <button
          onClick={search}
          title={track ? 'Choose different subtitles' : 'Load subtitles'}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur transition',
            track
              ? 'border-white/15 bg-black/60 text-white/85 hover:border-gold/60 hover:text-gold'
              : 'border-gold/50 bg-gold/15 text-gold hover:bg-gold/25'
          )}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10 10.5a2 2 0 100 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {track ? 'CC' : 'Subtitles'}
        </button>
      </div>

      {/* ---------- Candidate picker ---------- */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute right-3 top-12 z-30 w-[min(460px,86vw)] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="text-xs font-semibold text-ink">Subtitles</div>
                <div className="mt-0.5 text-[10.5px] text-ink-dim">
                  {/* This was a raw internal label ("IMDbId tt0903747") that
                      said nothing useful to a person. Sources that key on IMDb
                      are listed instead, which is the actionable fact. */}
                  {imdbId ? 'Matched by IMDb and TMDB id' : 'Matched by TMDB id'}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={language}
                  onChange={e => onLanguageChange?.(e.target.value)}
                  className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft focus:border-gold focus:outline-none"
                >
                  {SUB_LANGUAGES.map(l => (
                    <option key={l.code} value={l.code} className="bg-surface text-ink">
                      {l.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition hover:text-crimson"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="max-h-[46vh] overflow-y-auto p-2">
              {loading && <div className="px-3 py-6 text-center text-xs text-ink-dim">Searching…</div>}
              {!loading && error && (
                <div className="px-3 py-5 text-center text-xs text-crimson-soft">
                  {error.split('\n').map((line, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {line}
                    </p>
                  ))}
                  {reports && reports.length > 0 && (
                    <ul className="mx-auto mt-3 max-w-xs space-y-1 text-left text-[10.5px] font-normal text-ink-dim">
                      {reports.map(p => (
                        <li key={p.id} className="flex items-start gap-1.5">
                          <span className={p.ok ? 'text-emerald' : 'text-crimson'}>
                            {p.ok ? '•' : '✕'}
                          </span>
                          <span>
                            <span className="text-ink-soft">{p.label}</span>{' '}
                            {p.ok
                              ? p.count > 0
                                ? `— ${p.count} found`
                                : '— nothing for this title'
                              : `— ${p.error}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!loading && !error && candidates.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-ink-dim">No results.</div>
              )}
              {!loading &&
                !error &&
                candidates.map(c => (
                  <button
                    key={`${c.provider}-${c.id}`}
                    onClick={() => load(c)}
                    className="flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-line bg-surface px-1.5 py-px text-[9.5px] uppercase text-ink-dim">
                        {c.format}
                      </span>
                      <span className="text-xs font-medium text-ink">{c.language}</span>
                      {c.hearingImpaired && (
                        <span className="rounded bg-azure/15 px-1.5 py-px text-[9.5px] font-medium text-azure">
                          SDH
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-ink-dim">
                        {/* SubDL reports no download count, so a bare "0" on
                            every row reads as a broken figure rather than an
                            absent one. Only show a number when there is one. */}
                        {c.downloads > 0 ? `${c.downloads.toLocaleString()} dl` : ''}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-ink-soft">{c.release}</div>
                  </button>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
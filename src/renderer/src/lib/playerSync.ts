import { useEffect, useRef, useState } from 'react'

/**
 * Player synchronisation via postMessage.
 *
 * WHY — some embed providers broadcast their playback state to the page that
 * embeds them. That is a deliberate feature of embed players: the host page
 * needs to know where playback is so it can offer a resume point, or render
 * its own next-episode button. Several major players use slightly different
 * message shapes for it.
 *
 * This matters enormously here. CineTrack probed vidsrc.to and its whole iframe
 * chain and found no <video> element, no readable currentTime, and no media
 * requests at all under CDP — so for those providers the only clock available
 * is a wall clock we start ourselves, which drifts and needs the user to
 * calibrate subtitles by hand.
 *
 * A provider that emits sync messages removes the guesswork entirely:
 *   - subtitles land exactly where they should, with no manual Sync step
 *   - watch time is *measured* rather than estimated from elapsed time
 *   - pause is detectable, so time spent paused no longer counts as watched
 *
 * When nothing arrives we degrade to the wall clock rather than showing nothing.
 * That fallback is the whole reason the overlay's manual Sync control still
 * exists — it is the tool for providers that stay silent.
 */

export interface PlayerSync {
  /** True once at least one usable sync message has been received. */
  synced: boolean
  /** Which provider's message shape matched, for the debug line in the UI. */
  source: string | null
  /** Real playback position in seconds. Null until/unless a provider reports. */
  currentTime: number | null
  /** Real media duration in seconds, when reported. */
  duration: number | null
  /** False while paused, so the caller can stop accruing watch time. */
  playing: boolean
}

export interface Normalized {
  event: string
  currentTime: number | null
  duration: number | null
  percent: number | null
  source: string
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Collapses the known provider shapes into one.
 *
 * Every field is read defensively — these payloads are third-party and have no
 * contract, so `data` may be a string, an object with nothing recognisable in
 * it, or missing entirely. Anything unrecognised must return null rather than
 * guess, or we would render subtitles at a nonsense offset.
 *
 * Exported for tests: this is the one function here that parses untrusted
 * input, and its rejections matter more than its successes.
 */
export function normalizePlayerMessage(raw: unknown): Normalized | null {
  let d: Record<string, unknown> | null = null
  if (typeof raw === 'string') {
    try {
      d = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  } else if (raw && typeof raw === 'object') {
    d = raw as Record<string, unknown>
  }
  if (!d) return null

  // MoviesAPI / MovieSap — tagged with an explicit source name.
  if (d.source === 'moviesapi-player') {
    return {
      event: typeof d.event === 'string' ? d.event : '',
      currentTime: num(d.currentTime),
      duration: num(d.duration),
      percent: num(d.percentage),
      source: 'MovieSap'
    }
  }

  // CineSrc — a namespaced event string with the payload alongside.
  if (typeof d.type === 'string' && d.type.startsWith('cinesrc:')) {
    return {
      event: d.type.slice('cinesrc:'.length),
      currentTime: num(d.currentTime),
      duration: num(d.duration),
      percent: null,
      source: 'CineSrc'
    }
  }

  // Everything else (Vidlove, Vidzen, Vidlink, Vidzee, and most simple
  // hls.js/video.js wrappers) either sends the fields flat or nests them one
  // level under `data`.
  const inner =
    d.data && typeof d.data === 'object' ? (d.data as Record<string, unknown>) : d

  const event =
    pickString(inner, ['event', 'type', 'eventType']) ??
    pickString(d, ['event', 'type', 'eventType']) ??
    ''

  const currentTime =
    num(inner.currentTime) ??
    num(inner.time) ??
    num(inner.position) ??
    num(inner.current_time) ??
    num(d.currentTime) ??
    num(d.time)

  const duration =
    num(inner.duration) ??
    num(inner.totalDuration) ??
    num(inner.total_duration) ??
    num(inner.totalTime) ??
    num(d.duration)

  const percent =
    num(inner.percent) ?? num(inner.progress) ?? num(inner.percentage) ?? num(d.percent)

  // A message with nothing positional in it is not a sync message.
  if (currentTime === null && duration === null && percent === null) return null

  return { event, currentTime, duration, percent, source: 'generic' }
}

function pickString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v !== '') return v
  }
  return null
}

const PLAY_EVENTS = new Set(['play', 'playing', 'timeupdate', 'resume', 'cinesrc:play'])
const PAUSE_EVENTS = new Set(['pause', 'waiting', 'stalled', 'ended', 'cinesrc:pause'])

/**
 * Subscribes to player sync messages.
 *
 * `target` defaults to `window` because the provider's iframe is a child of our
 * renderer document, and `postMessage` from an iframe reaches the parent's
 * window listener.
 */
export function usePlayerSync(target: Window | null = window): PlayerSync {
  const [state, setState] = useState<PlayerSync>({
    synced: false,
    source: null,
    currentTime: null,
    duration: null,
    playing: false
  })
  // Kept in a ref so the interval below never closes over stale values.
  const live = useRef(state)
  live.current = state

  useEffect(() => {
    if (!target) return

    const onMessage = (e: MessageEvent) => {
      const n = normalizePlayerMessage(e.data)
      if (!n) return

      setState(prev => {
        // Ignore a regression to zero — a provider that re-mounts briefly
        // reports 0, and honouring that would yank the subtitle overlay to the
        // top of the film for a frame.
        const nextTime =
          n.currentTime !== null && n.currentTime === 0 && prev.currentTime
            ? prev.currentTime
            : n.currentTime

        const duration = n.duration && n.duration > 0 ? n.duration : prev.duration

        const explicitPause = PAUSE_EVENTS.has(n.event)
        const explicitPlay = PLAY_EVENTS.has(n.event)
        const playing = explicitPause ? false : explicitPlay ? true : prev.playing

        return {
          synced: true,
          source: n.source,
          currentTime: nextTime,
          duration,
          playing
        }
      })
    }

    target.addEventListener('message', onMessage)
    return () => target.removeEventListener('message', onMessage)
  }, [target])

  return state
}

/** Drives a wall-clock position for providers that never send sync messages. */
export function useWallClock(running: boolean): number {
  const [position, setPosition] = useState(0)
  const started = useRef<number>(Date.now())
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
      return
    }
    started.current = Date.now()
    timer.current = setInterval(() => {
      setPosition((Date.now() - started.current) / 1000)
    }, 250)
    return () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [running])

  return position
}
import { api } from './api'

/**
 * Watch-progress sync.
 *
 * The streams play in a cross-origin embed iframe, so the app can't read the
 * player's currentTime directly. What it *can* do is remember, per title:
 *   - which source the user prefers
 *   - which season/episode they were last on
 *   - how far through the session they got (by elapsed wall-clock)
 *
 * On reopen, the modal jumps straight back to the same source and episode —
 * "continue watching" without a download or a cloud account. Positions older
 * than 30 days age out so the store can't grow unbounded.
 */

const KEY = 'watch.progress.v1'
const MAX_AGE_DAYS = 30

export interface WatchPosition {
  /** Preferred embed provider id. */
  sourceId?: string
  season?: number
  episode?: number
  /** Epoch ms of the last time the player was active for this title. */
  updatedAt: number
}

type ProgressMap = Record<string, WatchPosition>

function makeKey(tmdbId: number, kind: string): string {
  return `${kind}:${tmdbId}`
}

export async function loadProgress(): Promise<ProgressMap> {
  try {
    const raw = await api.settings.get<ProgressMap>(KEY)
    if (!raw || typeof raw !== 'object') return {}
    // Drop stale entries so the blob stays small.
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    const cleaned: ProgressMap = {}
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v.updatedAt === 'number' && v.updatedAt > cutoff) cleaned[k] = v
    }
    return cleaned
  } catch {
    return {}
  }
}

export async function getResumePoint(tmdbId: number, kind: string): Promise<WatchPosition | null> {
  const all = await loadProgress()
  return all[makeKey(tmdbId, kind)] ?? null
}

/**
 * Persists the current position. Debounced by the caller — every write is a
 * synchronous SQLite upsert, so coalescing matters on a scrubbing timeline.
 */
export async function saveResumePoint(
  tmdbId: number,
  kind: string,
  pos: WatchPosition
): Promise<void> {
  const all = await loadProgress()
  all[makeKey(tmdbId, kind)] = { ...pos, updatedAt: Date.now() }
  await api.settings.set(KEY, all)
}

export async function clearResumePoint(tmdbId: number, kind: string): Promise<void> {
  const all = await loadProgress()
  delete all[makeKey(tmdbId, kind)]
  await api.settings.set(KEY, all)
}

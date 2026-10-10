import type { LibraryItem, StatusDef, WatchStatus } from './types'

/**
 * The status the episode-progress engine wants for a series.
 *
 * A series carries two independent truths — "do I want to watch this" and
 * "how far am I" — and the old model forced one flat status to answer both,
 * so `completed` could sit next to 3/62 episodes. Deriving from progress
 * keeps them consistent: nothing watched is Planned, partial is Watching, and
 * finishing the last episode completes the show on its own.
 *
 * Returns null when there is no usable episode total, in which case the
 * status is whatever the user set by hand.
 */
export function deriveSeriesStatus(
  episodesWatched: number,
  episodesTotal: number | null
): WatchStatus | null {
  if (!episodesTotal || episodesTotal <= 0) return null
  if (episodesWatched >= episodesTotal) return 'completed'
  if (episodesWatched > 0) return 'watching'
  return 'planned'
}

/**
 * Whether the derivation engine should own this row's status right now.
 * A manual pick pins it; a series with no known episode total has nothing to
 * derive from; movies have no episodes at all.
 */
export function isAutoStatus(item: {
  kind: string
  episodesTotal: number | null
  statusOverride: boolean
}): boolean {
  if (item.statusOverride) return false
  if (item.kind !== 'series') return false
  return Boolean(item.episodesTotal && item.episodesTotal > 0)
}

/**
 * The status to persist after a change, given the current row and the
 * user's explicit choice (null = "no explicit choice").
 */
export function resolveStatus(input: {
  kind: string
  episodesWatched: number
  episodesTotal: number | null
  statusOverride: boolean
  currentStatus: WatchStatus
  requested: WatchStatus | null
  derivableKeys: ReadonlySet<string>
}): { status: WatchStatus; override: boolean } {
  const derived = deriveSeriesStatus(input.episodesWatched, input.episodesTotal)

  // The user picked a status explicitly — honour it and pin it.
  if (input.requested) {
    return { status: input.requested, override: true }
  }

  // Auto-managed series: follow progress, as long as the target status is
  // still one the user allows the engine to assign.
  if (derived && !input.statusOverride && input.derivableKeys.has(derived)) {
    return { status: derived, override: false }
  }

  return { status: input.currentStatus, override: input.statusOverride }
}

/** Progress fraction 0..1 for the table's bar; null when the total is unknown. */
export function progressOf(item: {
  episodesWatched: number
  episodesTotal: number | null
}): number | null {
  if (!item.episodesTotal || item.episodesTotal <= 0) return null
  return Math.min(1, Math.max(0, item.episodesWatched / item.episodesTotal))
}

/**
 * Minutes a row contributes to watch time.
 *
 * Mirrors the SQL in db/queries.ts: a movie is its runtime, a series is its
 * episode count times the average episode length, and only statuses flagged
 * `countsTowardWatchTime` are counted. The renderer uses this for instant
 * previews; the DB remains the source of truth for the stored totals.
 */
export function rowWatchMinutes(
  item: {
    kind: string
    runtimeMinutes: number | null
    episodesWatched: number
    episodesTotal: number | null
    episodesRuntime: number | null
  },
  defs: ReadonlyMap<string, StatusDef>,
  statusKey: string
): number {
  const def = defs.get(statusKey)
  if (!def?.countsTowardWatchTime) return 0

  if (item.kind === 'movie') return item.runtimeMinutes ?? 0

  const perEpisode =
    item.episodesRuntime ??
    (item.runtimeMinutes != null && item.kind === 'series' ? item.runtimeMinutes : null)
  if (!perEpisode) return 0

  const count = item.episodesWatched > 0 ? item.episodesWatched : (item.episodesTotal ?? 0)
  return count * perEpisode
}

/**
 * A stable CSS colour for a status. User-picked tokens map onto the app
 * palette; anything unknown falls back to a neutral slate so a deleted status
 * still renders readably.
 */
const STATUS_COLOR_CLASSES: Record<string, string> = {
  gold: 'text-gold border-gold/40 bg-gold/10',
  emerald: 'text-emerald border-emerald/40 bg-emerald/10',
  azure: 'text-azure border-azure/40 bg-azure/10',
  crimson: 'text-crimson border-crimson/40 bg-crimson/10',
  violet: 'text-[#b07ce8] border-[#b07ce8]/40 bg-[#b07ce8]/10',
  slate: 'text-ink-soft border-line bg-surface-2'
}

export function statusColorClass(color: string | undefined): string {
  return STATUS_COLOR_CLASSES[color ?? 'slate'] ?? STATUS_COLOR_CLASSES.slate!
}

/** Solid variant for the board's left rail and grouped headers. */
const STATUS_COLOR_DOT: Record<string, string> = {
  gold: 'bg-gold',
  emerald: 'bg-emerald',
  azure: 'bg-azure',
  crimson: 'bg-crimson',
  violet: 'bg-[#b07ce8]',
  slate: 'bg-ink-dim'
}

export function statusColorDot(color: string | undefined): string {
  return STATUS_COLOR_DOT[color ?? 'slate'] ?? STATUS_COLOR_DOT.slate!
}

/** Turns a label into a safe, unique status key ("On Hold" -> "on_hold"). */
export function statusKeyFromLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'custom'
}

/** A human label for a status key when no definition row is available. */
export function fallbackLabel(key: string): string {
  if (!key) return 'Unknown'
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
}

export type { LibraryItem }
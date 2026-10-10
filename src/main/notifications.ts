import { Notification } from 'electron'
import { getSetting, setSetting, listLibrary, listEpisodes } from './db/queries'
import {
  listPendingNotifications,
  listUnfiredNotifications,
  dismissNotification,
  markNotificationFired,
  upsertNotification
} from './db/notifications'
import { showStatusTmdb, getTmdbConfig } from './tmdb/client'
import type { NotificationItem } from '@shared/types'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly
const LAST_CHECK_KEY = 'notifications.lastCheck'
const ENABLED_KEY = 'notifications.enabled'

export function notificationsEnabled(): boolean {
  return getSetting<boolean>(ENABLED_KEY) !== false
}

export function setNotificationsEnabled(on: boolean): void {
  setSetting(ENABLED_KEY, on)
}

/**
 * Looks for two things:
 *  - new episodes of series you're watching that have aired since you last checked
 *  - upcoming premieres of titles on your watchlist (via next_air_date)
 *
 * Requires a TMDB key; without one this is a silent no-op.
 */
export async function checkForNotifications(): Promise<NotificationItem[]> {
  if (!getTmdbConfig().connected) return []
  if (!notificationsEnabled()) return []

  const items = listLibrary().filter(l => l.status === 'watching' && l.kind === 'series')
  let failures = 0
  for (const item of items) {
    if (!item.tmdbId) continue
    try {
      const status = await showStatusTmdb(item.tmdbId)
      const next = status.nextEpisodeToAir
      if (!next || !next.airDate) continue

      const airedAt = new Date(next.airDate)
      // Only remind about episodes the user hasn't already logged.
      const logged = listEpisodes(item.libraryId).some(
        e => e.season === next.seasonNumber && e.episode === next.episodeNumber
      )
      if (airedAt <= new Date() && !logged) {
        upsertNotification({
          kind: 'new_episode',
          title: `New episode: ${item.title}`,
          body: `S${next.seasonNumber}E${next.episodeNumber}${next.name ? ` · ${next.name}` : ''}`,
          catalogId: item.id,
          tmdbId: item.tmdbId,
          scheduledFor: next.airDate
        })
      }
    } catch (err) {
      // A single failing show shouldn't break the sweep, but a total wipeout
      // means the key died or the network is gone — log it instead of
      // stamping "last checked" and pretending everything is healthy.
      failures++
      if (failures === 1) console.error('[notifications] TMDB sweep failed:', err)
    }
  }

  if (failures < items.length) {
    setSetting<string>(LAST_CHECK_KEY, new Date().toISOString())
  } else if (items.length > 0) {
    console.error(`[notifications] every one of ${items.length} shows failed to refresh`)
  }
  return listPendingNotifications()
}

/** Fires any due reminders as native OS notifications (each fires once). */
export function fireDueNotifications(): void {
  if (!notificationsEnabled()) return
  if (!Notification.isSupported()) return
  for (const n of listUnfiredNotifications()) {
    const notif = new Notification({
      title: n.title,
      body: n.body ?? undefined,
      silent: false
    })
    notif.on('click', () => {
      dismissNotification(n.id)
    })
    notif.show()
    markNotificationFired(n.id)
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let bootTimer: ReturnType<typeof setTimeout> | null = null
/** Guards against an hourly tick overlapping a manual "check now". */
let sweeping = false

/** Starts the periodic notification sweep. Safe to call once at boot. */
export function startNotificationEngine(): void {
  if (timer) return
  // Kick once shortly after boot (lets the DB + window settle), then hourly.
  // The handle is kept so stopNotificationEngine() can actually cancel it —
  // it used to fire after a stop and touch a closed database.
  bootTimer = setTimeout(() => {
    bootTimer = null
    void sweepAndFire()
  }, 12_000)
  timer = setInterval(() => void sweepAndFire(), CHECK_INTERVAL_MS)
}

async function sweepAndFire(): Promise<void> {
  if (sweeping) return
  sweeping = true
  try {
    await checkForNotifications()
    fireDueNotifications()
  } catch (err) {
    console.error('[notifications] sweep failed:', err)
  } finally {
    sweeping = false
  }
}

/**
 * Manual "check now" — sweeps and then immediately fires anything due.
 * Previously this only generated rows; they sat unfired until the next
 * hourly tick, so a click produced nothing visible.
 */
export async function checkAndFireNotifications(): Promise<NotificationItem[]> {
  const items = await checkForNotifications()
  fireDueNotifications()
  return items
}

export function stopNotificationEngine(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (bootTimer) {
    clearTimeout(bootTimer)
    bootTimer = null
  }
}

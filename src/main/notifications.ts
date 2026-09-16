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
    } catch {
      /* a single failing show shouldn't break the sweep */
    }
  }

  setSetting<string>(LAST_CHECK_KEY, new Date().toISOString())
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

/** Starts the periodic notification sweep. Safe to call once at boot. */
export function startNotificationEngine(): void {
  if (timer) return
  // Kick once shortly after boot (lets the DB + window settle), then hourly.
  setTimeout(() => {
    checkForNotifications().catch(() => {})
    fireDueNotifications()
  }, 12_000)
  timer = setInterval(() => {
    checkForNotifications().catch(() => {})
    fireDueNotifications()
  }, CHECK_INTERVAL_MS)
}

export function stopNotificationEngine(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

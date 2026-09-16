import { getDb } from './index'
import { notifications } from './schema'
import { eq, desc, and, ne } from 'drizzle-orm'
import type { NotificationItem, NotificationKind } from '@shared/types'
function rowToNotification(row: {
  id: number
  kind: string
  title: string
  body: string | null
  catalogId: number | null
  tmdbId: number | null
  scheduledFor: string
  dismissed: boolean
  createdAt: string
}): NotificationItem {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    catalogId: row.catalogId,
    tmdbId: row.tmdbId,
    scheduledFor: row.scheduledFor,
    createdAt: row.createdAt
  }
}

/** Reminders the user has not yet dismissed, newest first. */
export function listPendingNotifications(): NotificationItem[] {
  const db = getDb()
  return db
    .select()
    .from(notifications)
    .where(ne(notifications.dismissed, true))
    .orderBy(desc(notifications.scheduledFor))
    .all()
    .map(row => rowToNotification(row))
}

/** Reminders that have not been shown as a native notification yet. */
export function listUnfiredNotifications(): NotificationItem[] {
  const db = getDb()
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.fired, false), ne(notifications.dismissed, true)))
    .orderBy(desc(notifications.scheduledFor))
    .all()
    .map(row => rowToNotification(row))
}

/** Marks a reminder as shown so it doesn't fire again on the next sweep. */
export function markNotificationFired(id: number): void {
  const db = getDb()
  db.update(notifications).set({ fired: true }).where(eq(notifications.id, id)).run()
}

export function dismissNotification(id: number): void {
  const db = getDb()
  db.update(notifications).set({ dismissed: true }).where(eq(notifications.id, id)).run()
}

export function dismissAllNotifications(): void {
  const db = getDb()
  db.update(notifications).set({ dismissed: true }).where(ne(notifications.dismissed, true)).run()
}

export function upsertNotification(entry: {
  kind: NotificationKind
  title: string
  body: string | null
  catalogId: number | null
  tmdbId: number | null
  scheduledFor: string
}): void {
  const db = getDb()
  const now = new Date().toISOString()
  // De-dupe by tmdbId + schedule so repeated checks don't stack reminders.
  if (entry.tmdbId) {
    const existing = db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tmdbId, entry.tmdbId),
          eq(notifications.scheduledFor, entry.scheduledFor)
        )
      )
      .get()
    if (existing) return
  }
  db.insert(notifications)
    .values({
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      catalogId: entry.catalogId,
      tmdbId: entry.tmdbId,
      scheduledFor: entry.scheduledFor,
      fired: false,
      dismissed: false,
      createdAt: now
    })
    .run()
}

/** Clears fired state so a reminder can re-fire if the episode is still unaired. */
export function resetFiredNotifications(): void {
  const db = getDb()
  db.update(notifications)
    .set({ fired: false })
    .where(and(eq(notifications.fired, true), eq(notifications.dismissed, false)))
    .run()
}

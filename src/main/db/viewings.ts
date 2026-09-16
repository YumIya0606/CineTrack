import { getDb } from './index'
import { viewingLog } from './schema'
import { eq, desc } from 'drizzle-orm'
import type { ViewingEntry } from '@shared/types'

/** Records one viewing of a library title — the basis of rewatch counts. */
export function logViewing(libraryId: number, watchedAt = new Date().toISOString()): void {
  const db = getDb()
  db.insert(viewingLog).values({ libraryId, watchedAt }).run()
}

export function listViewings(libraryId: number): ViewingEntry[] {
  const db = getDb()
  return db
    .select({ id: viewingLog.id, watchedAt: viewingLog.watchedAt })
    .from(viewingLog)
    .where(eq(viewingLog.libraryId, libraryId))
    .orderBy(desc(viewingLog.watchedAt))
    .all()
}

export function viewingsCount(libraryId: number): number {
  const db = getDb()
  return db
    .select({ id: viewingLog.id })
    .from(viewingLog)
    .where(eq(viewingLog.libraryId, libraryId))
    .all().length
}

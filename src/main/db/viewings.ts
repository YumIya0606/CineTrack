import { getDb } from './index'
import { library, viewingLog } from './schema'
import { eq, desc, sql } from 'drizzle-orm'
import type { ViewingEntry } from '@shared/types'

/**
 * Records one viewing of a library title — the basis of rewatch counts.
 *
 * play_count is kept in step here: it was pinned at its DEFAULT 1 forever,
 * so the column and the viewing log disagreed about how many times a title
 * had been watched.
 */
export function logViewing(libraryId: number, watchedAt = new Date().toISOString()): void {
  const db = getDb()
  // Drizzle's better-sqlite3 transaction() executes the callback immediately and
  // returns its result — it is not the raw driver's "returns a callable" form.
  db.transaction(() => {
    db.insert(viewingLog).values({ libraryId, watchedAt }).run()
    db.update(library)
      .set({ playCount: sql`${library.playCount} + 1` })
      .where(eq(library.id, libraryId))
      .run()
  })
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

import { getDb } from './index'
import { statusDefs, library } from './schema'
import { asc, eq, inArray } from 'drizzle-orm'
import { statusKeyFromLabel, fallbackLabel } from '@shared/status'
import type { StatusDef, StatusKey } from '@shared/types'

/**
 * Slugs that must always exist because engine logic and historical rows refer
 * to them by name. They can be renamed and restyled, but never deleted.
 */
export const BUILT_IN: StatusKey[] = [
  'watching',
  'planned',
  'completed',
  'rewatching',
  'dropped'
]

function rowToDef(row: typeof statusDefs.$inferSelect): StatusDef {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    color: row.color,
    position: row.position,
    countsTowardWatchTime: row.countsTowardWatchTime,
    derivable: row.derivable,
    isSystem: row.isSystem
  }
}

/**
 * All statuses in display order. Guarantees the five built-ins are present even
 * if a row went missing, so the UI can always render a chip for every status a
 * library row might carry.
 */
export function listStatuses(): StatusDef[] {
  const rows = getDb().select().from(statusDefs).orderBy(asc(statusDefs.position)).all()
  const byKey = new Map(rows.map(r => [r.key, rowToDef(r)]))

  const out: StatusDef[] = []
  for (const key of BUILT_IN) {
    out.push(
      byKey.get(key) ?? {
        id: -1,
        key,
        label: fallbackLabel(key),
        color: 'slate',
        position: 0,
        countsTowardWatchTime: false,
        derivable: false,
        isSystem: true
      }
    )
    byKey.delete(key)
  }
  // Anything the user added, in their chosen order.
  for (const row of rows) {
    if (byKey.has(row.key)) out.push(rowToDef(row))
  }
  return out
}

/** Keys the episode engine is allowed to assign on its own. */
export function derivableStatusKeys(): Set<string> {
  return new Set(listStatuses().filter(d => d.derivable).map(d => d.key))
}

/** Every key that counts toward the watch-time total. */
export function watchTimeStatusKeys(): Set<string> {
  return new Set(listStatuses().filter(d => d.countsTowardWatchTime).map(d => d.key))
}

function uniqueKey(label: string, ignoreId?: number): string {
  const base = statusKeyFromLabel(label)
  const taken = new Set(
    getDb()
      .select({ id: statusDefs.id, key: statusDefs.key })
      .from(statusDefs)
      .all()
      .filter(r => ignoreId === undefined || r.id !== ignoreId)
      .map(r => r.key)
  )
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

export interface CreateStatusInput {
  label: string
  color: string
  countsTowardWatchTime: boolean
  derivable: boolean
}

export function createStatus(input: CreateStatusInput): StatusDef {
  const label = input.label.trim()
  if (!label) throw new Error('Give the status a name')
  const db = getDb()
  const key = uniqueKey(label)
  const rows = db.select({ p: statusDefs.position }).from(statusDefs).all()
  const max = rows.reduce((m, r) => Math.max(m, r.p ?? 0), 0)
  const row = db
    .insert(statusDefs)
    .values({
      key,
      label,
      color: input.color || 'slate',
      position: max + 1,
      countsTowardWatchTime: input.countsTowardWatchTime,
      // A custom status can't be produced by the progress engine unless the
      // user opts in — otherwise a derived status could land on a status they
      // intended as manual-only.
      derivable: input.derivable,
      isSystem: false
    })
    .returning()
    .get()!
  return rowToDef(row)
}

export function updateStatus(
  id: number,
  patch: Partial<Pick<StatusDef, 'label' | 'color' | 'countsTowardWatchTime' | 'derivable' | 'position'>>
): void {
  const db = getDb()
  const clean: Partial<typeof statusDefs.$inferInsert> = {}
  if (patch.label !== undefined) {
    const label = patch.label.trim()
    if (!label) throw new Error('Give the status a name')
    clean.label = label
  }
  if (patch.color !== undefined) clean.color = patch.color
  if (patch.countsTowardWatchTime !== undefined) clean.countsTowardWatchTime = patch.countsTowardWatchTime
  if (patch.derivable !== undefined) clean.derivable = patch.derivable
  if (patch.position !== undefined) clean.position = patch.position
  db.update(statusDefs).set(clean).where(eq(statusDefs.id, id)).run()
}

/**
 * Deletes a custom status. Titles sitting in it are moved to `planned` rather
 * than dropped — losing a shelf shouldn't silently destroy a library entry.
 */
export function deleteStatus(id: number): { reassigned: number } {
  const db = getDb()
  const row = db.select().from(statusDefs).where(eq(statusDefs.id, id)).get()
  if (!row) return { reassigned: 0 }
  if (row.isSystem || BUILT_IN.includes(row.key as StatusKey)) {
    throw new Error('Built-in statuses can’t be deleted — hide them by renaming instead')
  }

  const reassigned = db
    .update(library)
    .set({ status: 'planned', updatedAt: new Date().toISOString() })
    .where(eq(library.status, row.key))
    .run().changes

  db.delete(statusDefs).where(eq(statusDefs.id, id)).run()
  return { reassigned }
}

/** Reorders the palette in one pass. */
export function reorderStatuses(order: { id: number; position: number }[]): void {
  const db = getDb()
  db.transaction(() => {
    for (const o of order) {
      db.update(statusDefs).set({ position: o.position }).where(eq(statusDefs.id, o.id)).run()
    }
  })
}

/**
 * Raw rows including their database ids — the settings editor needs ids to
 * apply updates and deletions.
 */
export function listStatusRows(): StatusDef[] {
  return getDb().select().from(statusDefs).orderBy(asc(statusDefs.position)).all().map(rowToDef)
}

/** Which built-in keys currently have no rows (defensive, for bad imports). */
export function missingBuiltIns(): string[] {
  const present = new Set(
    getDb()
      .select({ key: statusDefs.key })
      .from(statusDefs)
      .where(inArray(statusDefs.key, [...BUILT_IN]))
      .all()
      .map(r => r.key)
  )
  return BUILT_IN.filter(k => !present.has(k))
}
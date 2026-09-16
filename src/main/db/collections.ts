import { getDb, getRaw } from './index'
import { collections, collectionItems, catalog } from './schema'
import { eq, desc, and } from 'drizzle-orm'
import type { Collection, CatalogItem } from '@shared/types'
import { rowToCatalog } from './queries'

function rowToCollection(row: {
  id: number
  name: string
  description: string | null
  created_at: string
  item_count: number
}): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    itemCount: row.item_count
  }
}

export function listCollections(): Collection[] {
  // Counts come from a correlated subquery, so raw SQL is the honest way.
  const raw = getRaw()
  const rows = raw
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count
       FROM collections c ORDER BY c.created_at DESC`
    )
    .all() as {
    id: number
    name: string
    description: string | null
    created_at: string
    item_count: number
  }[]
  return rows.map(rowToCollection)
}

export function createCollection(name: string, description: string | null): Collection {
  const db = getDb()
  const now = new Date().toISOString()
  const result = db
    .insert(collections)
    .values({ name: name.trim(), description: description?.trim() || null, createdAt: now })
    .returning({ id: collections.id })
    .get()
  return {
    id: result.id,
    name: name.trim(),
    description: description?.trim() || null,
    createdAt: now,
    itemCount: 0
  }
}

export function renameCollection(id: number, name: string, description: string | null): void {
  const db = getDb()
  db.update(collections)
    .set({ name: name.trim(), description: description?.trim() || null })
    .where(eq(collections.id, id))
    .run()
}

export function deleteCollection(id: number): void {
  const db = getDb()
  db.delete(collections).where(eq(collections.id, id)).run()
}

export function listCollectionItems(collectionId: number): CatalogItem[] {
  const db = getDb()
  return db
    .select({ catalog })
    .from(collectionItems)
    .innerJoin(catalog, eq(catalog.id, collectionItems.catalogId))
    .where(eq(collectionItems.collectionId, collectionId))
    .orderBy(desc(collectionItems.addedAt))
    .all()
    .map(r => rowToCatalog(r.catalog))
}

export function addToCollection(collectionId: number, catalogId: number): void {
  const db = getDb()
  db.insert(collectionItems)
    .values({
      collectionId,
      catalogId,
      addedAt: new Date().toISOString()
    })
    .onConflictDoNothing()
    .run()
}

export function removeFromCollection(collectionId: number, catalogId: number): void {
  const db = getDb()
  db.delete(collectionItems)
    .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.catalogId, catalogId)))
    .run()
}

/** Which collections a title already belongs to (for the add-to-list picker). */
export function collectionsForItem(catalogId: number): number[] {
  const db = getDb()
  return db
    .select({ id: collectionItems.collectionId })
    .from(collectionItems)
    .where(eq(collectionItems.catalogId, catalogId))
    .all()
    .map(r => r.id)
}

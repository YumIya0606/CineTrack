import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'

type AnyDb = BetterSQLite3Database<Record<string, never>>

/**
 * Prepares the full-text search index over the catalog table and keeps it in
 * sync as items arrive.
 *
 * No example data is bundled — the catalog is populated on demand from your
 * own library, and (when a TMDB key is set) from the full live catalog.
 */
export function seedIfEmpty(db: AnyDb, raw: Database.Database): void {
  void db

  raw.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
      title, original_title, content='catalog', content_rowid='id',
      tokenize='porter unicode61 remove_diacritics 1'
    );
  `)

  // External-content FTS tables do not follow the base table automatically,
  // so mirror inserts/updates/deletes via triggers.
  raw.exec(`
    CREATE TRIGGER IF NOT EXISTS catalog_ai AFTER INSERT ON catalog BEGIN
      INSERT INTO catalog_fts(rowid, title, original_title)
      VALUES (new.id, new.title, new.original_title);
    END;
    CREATE TRIGGER IF NOT EXISTS catalog_ad AFTER DELETE ON catalog BEGIN
      INSERT INTO catalog_fts(catalog_fts, rowid, title, original_title)
      VALUES ('delete', old.id, old.title, old.original_title);
    END;
    CREATE TRIGGER IF NOT EXISTS catalog_au AFTER UPDATE ON catalog BEGIN
      INSERT INTO catalog_fts(catalog_fts, rowid, title, original_title)
      VALUES ('delete', old.id, old.title, old.original_title);
      INSERT INTO catalog_fts(rowid, title, original_title)
      VALUES (new.id, new.title, new.original_title);
    END;
  `)

  raw.exec(`INSERT INTO catalog_fts(catalog_fts) VALUES('rebuild');`)
}

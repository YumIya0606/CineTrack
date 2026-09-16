import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import * as schema from './schema'
import { seedIfEmpty } from './seed'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let db: BetterSQLite3Database<typeof schema> | null = null
let raw: Database.Database | null = null

export function getDataDir(): string {
  return join(app.getPath('userData'), 'data')
}

export function getDbPath(): string {
  return join(getDataDir(), 'cinetrack.db')
}

export function initDatabase(): void {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

  raw = new Database(getDbPath())
  // Flush any stale WAL/SHM state so a partially-deleted data dir can't
  // leave the migration journal out of sync with the schema.
  raw.pragma('wal_checkpoint(TRUNCATE)')
  raw.pragma('journal_mode = WAL')
  raw.pragma('synchronous = NORMAL')
  raw.pragma('foreign_keys = ON')

  db = drizzle(raw, { schema })

  const migrationsFolder = app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(__dirname, '../../drizzle')

  try {
    migrate(db, { migrationsFolder })
  } catch (err) {
    console.error('[db] migration failed, running raw schema bootstrap:', err)
    bootstrapSchema(raw)
  }

  try {
    seedIfEmpty(db as never, raw)
  } catch (err) {
    console.error('[db] seeding failed:', err)
  }
}

function bootstrapSchema(raw: Database.Database): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS catalog (
      id INTEGER PRIMARY KEY, tmdb_id INTEGER, imdb_id TEXT, title TEXT NOT NULL,
      original_title TEXT, kind TEXT NOT NULL, year INTEGER, end_year INTEGER,
      genres TEXT NOT NULL DEFAULT '', runtime_minutes INTEGER, vote_average REAL,
      vote_count INTEGER, overview TEXT, poster_path TEXT, backdrop_path TEXT, popularity REAL
    );
    CREATE TABLE IF NOT EXISTS library (
      id INTEGER PRIMARY KEY AUTOINCREMENT, catalog_id INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
      status TEXT NOT NULL, rating INTEGER, notes TEXT, added_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      watched_at TEXT, episodes_watched INTEGER NOT NULL DEFAULT 0, episodes_total INTEGER, seasons_total INTEGER,
      play_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS episode_log (
      library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
      season INTEGER NOT NULL, episode INTEGER NOT NULL, watched_at TEXT NOT NULL,
      PRIMARY KEY (library_id, season, episode)
    );
    CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT, catalog_id INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
      name TEXT NOT NULL, role TEXT NOT NULL, character TEXT, tmdb_person_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      catalog_id INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS unique_collection_item ON collection_items(collection_id, catalog_id);
    CREATE TABLE IF NOT EXISTS viewing_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
      watched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
      catalog_id INTEGER, tmdb_id INTEGER,
      scheduled_for TEXT NOT NULL, fired INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_title ON catalog(title);
    CREATE INDEX IF NOT EXISTS idx_catalog_kind ON catalog(kind);
    CREATE INDEX IF NOT EXISTS idx_catalog_year ON catalog(year);
    CREATE INDEX IF NOT EXISTS idx_catalog_tmdb ON catalog(tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_imdb ON catalog(imdb_id);
    CREATE INDEX IF NOT EXISTS idx_library_status ON library(status);
    CREATE INDEX IF NOT EXISTS idx_library_catalog ON library(catalog_id);
    CREATE INDEX IF NOT EXISTS idx_library_updated ON library(updated_at);
    CREATE INDEX IF NOT EXISTS idx_episode_library ON episode_log(library_id);
    CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
    CREATE INDEX IF NOT EXISTS idx_people_catalog ON people(catalog_id);
    CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id);
    CREATE INDEX IF NOT EXISTS idx_viewing_log_library ON viewing_log(library_id);
    CREATE INDEX IF NOT EXISTS idx_viewing_log_date ON viewing_log(watched_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_fired ON notifications(fired);
    CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications(dismissed);
    CREATE INDEX IF NOT EXISTS idx_notifications_tmdb ON notifications(tmdb_id);
  `)
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('Database not initialized — call initDatabase() first')
  return db
}

export function getRaw(): Database.Database {
  if (!raw) throw new Error('Database not initialized — call initDatabase() first')
  return raw
}

/** Re-opens the connection after an in-place restore replaced the file. */
export function reopenDatabase(): void {
  try {
    raw?.close()
  } catch {
    /* already closed */
  }
  raw = null
  db = null
  initDatabase()
}

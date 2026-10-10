import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

/*
 * The stats and search SQL lives inside main-process functions that import
 * electron, so it can't be unit-tested through the normal export path. These
 * tests re-create the exact statements against an in-memory database so a
 * regression in them fails here instead of silently corrupting the dashboard
 * in the shipped app. Keep the SQL below byte-identical to src/main/db/queries.ts.
 */

/** Mirrors WATCHED_MINUTES in src/main/db/queries.ts. */
const WATCHED_MINUTES = `
  CASE WHEN l.status IN ('completed','rewatching') THEN
    CASE WHEN c.kind = 'movie'
      THEN COALESCE(c.runtime_minutes, 0)
      ELSE COALESCE(NULLIF(l.episodes_watched, 0), l.episodes_total, 0)
           * COALESCE(c.runtime_minutes, 0)
    END
  ELSE 0 END`

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE catalog (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT '', original_title TEXT,
      kind TEXT, year INTEGER, runtime_minutes INTEGER, genres TEXT, popularity REAL
    );
    CREATE TABLE library (
      id INTEGER PRIMARY KEY, catalog_id INTEGER, status TEXT,
      episodes_watched INTEGER, episodes_total INTEGER, watched_at TEXT
    );
    CREATE VIRTUAL TABLE catalog_fts USING fts5(
      title, original_title, content='catalog', content_rowid='id',
      tokenize='porter unicode61 remove_diacritics 1'
    );
  `)
  return db
}

describe('watched-minutes aggregation', () => {
  it('counts a movie by runtime and a series by episodes x episode runtime', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO catalog (id, kind, year, runtime_minutes, genres) VALUES
        (1, 'movie', 2010, 148, 'Action'),
        (2, 'series', 2008, 45, 'Drama'),
        (3, 'movie', 1999, 136, 'Sci-Fi')`
    ).run()
    db.prepare(
      `INSERT INTO library (id, catalog_id, status, episodes_watched, episodes_total, watched_at) VALUES
        (1, 1, 'completed', 0, NULL, '2026-01-01'),
        (2, 2, 'completed', 0, 62, '2026-02-01'),
        (3, 3, 'watching', 0, NULL, NULL)`
    ).run()

    const row = db
      .prepare(
        `SELECT COALESCE(SUM(${WATCHED_MINUTES}),0) AS minutes
         FROM library l JOIN catalog c ON c.id = l.catalog_id`
      )
      .get() as { minutes: number }

    // 148 (movie) + 62*45 (completed series with no per-episode log) + 0 (watching).
    expect(row.minutes).toBe(148 + 62 * 45)
  })

  it('credits only the logged episodes of an in-progress series', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO catalog (id, kind, year, runtime_minutes, genres) VALUES (1, 'series', 2019, 50, 'Drama')`).run()
    db.prepare(
      `INSERT INTO library (id, catalog_id, status, episodes_watched, episodes_total, watched_at)
       VALUES (1, 1, 'rewatching', 5, 10, '2026-01-01')`
    ).run()

    const row = db
      .prepare(
        `SELECT COALESCE(SUM(${WATCHED_MINUTES}),0) AS minutes
         FROM library l JOIN catalog c ON c.id = l.catalog_id`
      )
      .get() as { minutes: number }

    // Logged episodes win over the total: 5 * 50, not 10 * 50.
    expect(row.minutes).toBe(250)
  })

  it('treats a null runtime as zero rather than dropping the title', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO catalog (id, kind, year, runtime_minutes, genres) VALUES (1, 'movie', 2020, NULL, 'Drama')`).run()
    db.prepare(
      `INSERT INTO library (id, catalog_id, status, episodes_watched, episodes_total, watched_at)
       VALUES (1, 1, 'completed', 0, NULL, '2026-01-01')`
    ).run()

    const row = db
      .prepare(
        `SELECT COALESCE(SUM(${WATCHED_MINUTES}),0) AS minutes
         FROM library l JOIN catalog c ON c.id = l.catalog_id`
      )
      .get() as { minutes: number }

    expect(row.minutes).toBe(0)
  })
})

describe('genre bucketing', () => {
  it('excludes the empty-genre bucket produced by live TMDB rows', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO catalog (id, kind, year, runtime_minutes, genres) VALUES
        (1, 'movie', 2010, 100, 'Drama|Thriller'),
        (2, 'movie', 2011, 100, '')`
    ).run()
    db.prepare(
      `INSERT INTO library (id, catalog_id, status, episodes_watched, episodes_total, watched_at) VALUES
        (1, 1, 'completed', 0, NULL, '2026-01-01'),
        (2, 2, 'completed', 0, NULL, '2026-01-01')`
    ).run()

    const rows = db
      .prepare(
        `SELECT g.value AS genre, COUNT(*) AS count
         FROM library l JOIN catalog c ON c.id = l.catalog_id,
           json_each('["' || replace(c.genres,'|','","') || '"]') g
         WHERE c.genres <> '' AND g.value <> ''
         GROUP BY g.value ORDER BY count DESC`
      )
      .all() as { genre: string; count: number }[]

    // Both genres appear once, so the tie-break order isn't guaranteed —
    // compare the set, not the sequence.
    expect(rows.map(r => r.genre).sort()).toEqual(['Drama', 'Thriller'])
    expect(rows.some(r => r.genre === '')).toBe(false)
  })
})

describe('decade bucketing', () => {
  it('never emits a null decade row', () => {
    const db = makeDb()
    db.prepare(
      `INSERT INTO catalog (id, kind, year, runtime_minutes, genres) VALUES
        (1, 'movie', 1994, 100, 'Drama'),
        (2, 'movie', NULL, 100, 'Drama')`
    ).run()
    db.prepare(
      `INSERT INTO library (id, catalog_id, status, episodes_watched, episodes_total, watched_at) VALUES
        (1, 1, 'completed', 0, NULL, '2026-01-01'),
        (2, 2, 'completed', 0, NULL, '2026-01-01')`
    ).run()

    const rows = db
      .prepare(
        `SELECT CAST((c.year / 10) * 10 AS INTEGER) AS decade, COUNT(*) AS count
         FROM library l JOIN catalog c ON c.id = l.catalog_id
         WHERE c.year IS NOT NULL GROUP BY decade ORDER BY decade ASC`
      )
      .all() as { decade: number; count: number }[]

    expect(rows).toEqual([{ decade: 1990, count: 1 }])
    expect(rows.some(r => r.decade === null)).toBe(false)
  })
})

describe('monthly activity window', () => {
  it('keeps the newest months, not the oldest', () => {
    const db = makeDb()
    db.prepare(`INSERT INTO catalog (id, kind, year, runtime_minutes, genres) VALUES (1, 'movie', 2020, 100, 'Drama')`).run()
    const insert = db.prepare(
      `INSERT INTO library (id, catalog_id, status, episodes_watched, episodes_total, watched_at)
       VALUES (?, 1, 'completed', 0, NULL, ?)`
    )
    // 30 consecutive months ending 2026-05.
    const end = new Date(Date.UTC(2026, 4, 15, 12)) // May 2026
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 15, 12))
      insert.run(30 - i, d.toISOString())
    }

    const rows = db
      .prepare(
        `SELECT substr(l.watched_at,1,7) AS month, COUNT(*) AS count
         FROM library l WHERE l.watched_at IS NOT NULL
         GROUP BY month ORDER BY month DESC LIMIT 24`
      )
      .all() as { month: string; count: number }[]
    rows.reverse()

    // The window must contain the most recent month and exclude the oldest
    // (which is what ORDER BY ... ASC LIMIT 24 used to return instead).
    expect(rows).toHaveLength(24)
    expect(rows.at(-1)!.month).toBe('2026-05')
    // 30 months back from May 2026 is Dec 2023; the 24-month window therefore
    // starts at Jun 2024 and drops the six oldest months.
    expect(rows[0]!.month).toBe('2024-06')
    expect(rows.some(r => r.month === '2023-12')).toBe(false)
  })
})

describe('catalog FTS search', () => {
  it('binds numbered parameters as an object (the positional form throws)', () => {
    const db = makeDb()
    const ins = db.prepare(
      'INSERT INTO catalog (id, title, kind, runtime_minutes, genres, popularity) VALUES (?, ?, ?, ?, ?, ?)'
    )
    ins.run(1, 'The Matrix', 'movie', 136, 'Sci-Fi', 20)
    ins.run(2, 'Inception', 'movie', 148, 'Sci-Fi', 30)
    db.exec(
      `INSERT INTO catalog_fts(rowid, title, original_title) SELECT id, title, original_title FROM catalog`
    )

    const fts = db.prepare(`
      SELECT c.* FROM catalog_fts f
      JOIN catalog c ON c.id = f.rowid
      WHERE catalog_fts MATCH ?1
      ORDER BY rank, c.popularity DESC
      LIMIT ?2
    `)

    // better-sqlite3 rejects positional values for ?1/?2; the object form is
    // what makes the index actually get used instead of throwing into the
    // LIKE fallback on every keystroke.
    const rows = fts.all({ 1: 'matrix*', 2: 24 }) as { title: string }[]
    expect(rows.map(r => r.title)).toEqual(['The Matrix'])

    // Guard the regression directly: the old positional call must still throw,
    // which is exactly what the swallowed catch used to hide.
    expect(() => fts.all('matrix*', 24)).toThrow()
  })
})
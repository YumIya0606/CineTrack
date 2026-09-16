import { getDb, getRaw } from './index'
import { catalog, library, episodeLog, settings } from './schema'
import { eq, desc, asc, sql, and, inArray, isNull } from 'drizzle-orm'
import type {
  CatalogItem,
  LibraryItem,
  WatchStatus,
  Stats,
  EpisodeLog
} from '@shared/types'

export function rowToCatalog(row: typeof catalog.$inferSelect): CatalogItem {
  return {
    id: row.id,
    tmdbId: row.tmdbId ?? null,
    imdbId: row.imdbId ?? null,
    title: row.title,
    originalTitle: row.originalTitle ?? null,
    kind: row.kind as CatalogItem['kind'],
    year: row.year ?? null,
    endYear: row.endYear ?? null,
    genres: row.genres ? row.genres.split('|').filter(Boolean) : [],
    runtimeMinutes: row.runtimeMinutes ?? null,
    voteAverage: row.voteAverage ?? null,
    voteCount: row.voteCount ?? null,
    overview: row.overview ?? null,
    posterPath: row.posterPath ?? null,
    backdropPath: row.backdropPath ?? null,
    popularity: row.popularity ?? null
  }
}

function rowToLibrary(row: {
  catalog: typeof catalog.$inferSelect
  library: typeof library.$inferSelect
}): LibraryItem {
  return {
    ...rowToCatalog(row.catalog),
    libraryId: row.library.id,
    status: row.library.status as WatchStatus,
    rating: row.library.rating ?? null,
    notes: row.library.notes ?? null,
    addedAt: row.library.addedAt,
    updatedAt: row.library.updatedAt,
    watchedAt: row.library.watchedAt ?? null,
    episodesWatched: row.library.episodesWatched,
    episodesTotal: row.library.episodesTotal ?? null,
    seasonsTotal: row.library.seasonsTotal ?? null,
    playCount: row.library.playCount
  }
}

/* ---------- Catalog ---------- */

export function searchCatalog(query: string, limit = 24): CatalogItem[] {
  const q = query.trim()
  const db = getDb()
  if (!q) {
    return db
      .select()
      .from(catalog)
      .orderBy(desc(catalog.popularity))
      .limit(limit)
      .all()
      .map(rowToCatalog)
  }

  // Prefer FTS5 for prefix/prefix-token matching; fall back to LIKE for short queries.
  const fts = getRaw().prepare(`
    SELECT c.* FROM catalog_fts f
    JOIN catalog c ON c.id = f.rowid
    WHERE catalog_fts MATCH ?1
    ORDER BY rank, c.popularity DESC
    LIMIT ?2
  `)
  const term = q.endsWith('*') ? q : `${q}*`
  try {
    const rows = fts.all(term, limit) as (typeof catalog.$inferSelect)[]
    if (rows.length > 0) return rows.map(rowToCatalog)
  } catch {
    /* fall through to LIKE */
  }

  const like = `%${q.replace(/[%_]/g, '')}%`
  return db
    .select()
    .from(catalog)
    .where(sql`lower(${catalog.title}) LIKE lower(${like})`)
    .orderBy(desc(catalog.popularity))
    .limit(limit)
    .all()
    .map(rowToCatalog)
}

export function getCatalogItem(id: number): CatalogItem | null {
  const db = getDb()
  const row = db.select().from(catalog).where(eq(catalog.id, id)).get()
  return row ? rowToCatalog(row) : null
}

export function getTrending(): CatalogItem[] {
  const db = getDb()
  return db
    .select()
    .from(catalog)
    .orderBy(desc(catalog.popularity))
    .limit(24)
    .all()
    .map(rowToCatalog)
}

/**
 * Upserts a live-fetched item into the local catalog so it can be added to
 * the library. Returns the local row. Used when the TMDB live catalog is the
 * source of truth (poster paths are streamed from the CDN on demand).
 */
export function ensureCatalogItem(item: CatalogItem): CatalogItem {
  const db = getDb()

  // Match by TMDB id first (stable across sessions), then by title+year.
  if (item.tmdbId) {
    const byTmdb = db.select().from(catalog).where(eq(catalog.tmdbId, item.tmdbId)).get()
    if (byTmdb) return rowToCatalog(byTmdb)
  }

  const byTitle = db
    .select()
    .from(catalog)
    .where(
      item.year != null
        ? and(eq(catalog.title, item.title), eq(catalog.year, item.year))
        : and(eq(catalog.title, item.title), isNull(catalog.year))
    )
    .get()
  if (byTitle) {
    const existing = byTitle
    // Enrich the existing local row with TMDB ids + poster if we now have them.
    db.update(catalog)
      .set({
        tmdbId: item.tmdbId ?? existing.tmdbId,
        imdbId: item.imdbId ?? existing.imdbId,
        posterPath: item.posterPath ?? existing.posterPath,
        backdropPath: item.backdropPath ?? existing.backdropPath,
        overview: item.overview ?? existing.overview,
        voteAverage: item.voteAverage ?? existing.voteAverage,
        voteCount: item.voteCount ?? existing.voteCount,
        runtimeMinutes: item.runtimeMinutes ?? existing.runtimeMinutes,
        genres: item.genres.length ? item.genres.join('|') : existing.genres
      })
      .where(eq(catalog.id, existing.id))
      .run()
    return rowToCatalog(db.select().from(catalog).where(eq(catalog.id, existing.id)).get()!)
  }

  const inserted = db
    .insert(catalog)
    .values({
      tmdbId: item.tmdbId ?? null,
      imdbId: item.imdbId ?? null,
      title: item.title,
      originalTitle: item.originalTitle ?? null,
      kind: item.kind,
      year: item.year ?? null,
      endYear: item.endYear ?? null,
      genres: item.genres.join('|'),
      runtimeMinutes: item.runtimeMinutes ?? null,
      voteAverage: item.voteAverage ?? null,
      voteCount: item.voteCount ?? null,
      overview: item.overview ?? null,
      posterPath: item.posterPath ?? null,
      backdropPath: item.backdropPath ?? null,
      popularity: item.popularity ?? null
    })
    .returning()
    .get()

  return rowToCatalog(inserted!)
}

/* ---------- Library ---------- */

export function listLibrary(): LibraryItem[] {
  const db = getDb()
  return db
    .select({
      catalog,
      library
    })
    .from(library)
    .innerJoin(catalog, eq(catalog.id, library.catalogId))
    .orderBy(desc(library.updatedAt))
    .all()
    .map(rowToLibrary)
}

export function addToLibrary(catalogId: number, status: WatchStatus): LibraryItem {
  const db = getDb()
  const now = new Date().toISOString()
  const existing = db
    .select()
    .from(library)
    .where(eq(library.catalogId, catalogId))
    .get()

  if (existing) {
    db.update(library)
      .set({ status, updatedAt: now, watchedAt: status === 'completed' ? now : existing.watchedAt })
      .where(eq(library.id, existing.id))
      .run()
    return rowToLibrary(
      db
        .select({ catalog, library })
        .from(library)
        .innerJoin(catalog, eq(catalog.id, library.catalogId))
        .where(eq(library.id, existing.id))
        .get()!
    )
  }

  const item = getCatalogItem(catalogId)
  const result = db
    .insert(library)
    .values({
      catalogId,
      status,
      addedAt: now,
      updatedAt: now,
      watchedAt: status === 'completed' ? now : null,
      seasonsTotal: item?.kind === 'series' ? null : null
    })
    .returning()
    .get()

  return rowToLibrary(
    db
      .select({ catalog, library })
      .from(library)
      .innerJoin(catalog, eq(catalog.id, library.catalogId))
      .where(eq(library.id, result!.id))
      .get()!
  )
}

export function updateLibrary(
  libraryId: number,
  patch: Partial<Pick<LibraryItem, 'status' | 'rating' | 'notes' | 'watchedAt'>>
): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.update(library)
    .set({
      ...patch,
      updatedAt: now,
      ...(patch.status === 'completed' && !patch.watchedAt ? { watchedAt: now } : {})
    })
    .where(eq(library.id, libraryId))
    .run()
}

export function removeFromLibrary(libraryId: number): void {
  const db = getDb()
  db.delete(library).where(eq(library.id, libraryId)).run()
}

export function logEpisode(
  libraryId: number,
  season: number,
  episode: number
): EpisodeLog {
  const db = getDb()
  const now = new Date().toISOString()
  const row = db
    .insert(episodeLog)
    .values({ libraryId, season, episode, watchedAt: now })
    .onConflictDoNothing()
    .returning()
    .get()

  if (row) {
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(episodeLog)
      .where(eq(episodeLog.libraryId, libraryId))
      .get()
    db.update(library)
      .set({ episodesWatched: total?.count ?? 0, updatedAt: now, status: 'watching' })
      .where(eq(library.id, libraryId))
      .run()
    return {
      libraryId: row.libraryId,
      season: row.season,
      episode: row.episode,
      watchedAt: row.watchedAt
    }
  }

  const existing = db
    .select()
    .from(episodeLog)
    .where(
      and(eq(episodeLog.libraryId, libraryId), eq(episodeLog.season, season), eq(episodeLog.episode, episode))
    )
    .get()
  return existing
    ? {
        libraryId: existing.libraryId,
        season: existing.season,
        episode: existing.episode,
        watchedAt: existing.watchedAt
      }
    : { libraryId, season, episode, watchedAt: now }
}

export function listEpisodes(libraryId: number): EpisodeLog[] {
  const db = getDb()
  return db
    .select()
    .from(episodeLog)
    .where(eq(episodeLog.libraryId, libraryId))
    .orderBy(asc(episodeLog.season), asc(episodeLog.episode))
    .all()
    .map(r => ({
      libraryId: r.libraryId,
      season: r.season,
      episode: r.episode,
      watchedAt: r.watchedAt
    }))
}

/* ---------- Settings ---------- */

export function getSetting<T>(key: string): T | null {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return row.value as unknown as T
  }
}

export function setSetting<T>(key: string, value: T): void {
  const db = getDb()
  db.insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
    .run()
}

/* ---------- Stats ---------- */

export function getStats(): Stats {
  const db = getDb()
  const raw = getRaw()

  const totals = raw.prepare(`
    SELECT
      COUNT(*) AS total_titles,
      COALESCE(SUM(CASE WHEN l.status='completed' THEN COALESCE(c.runtime_minutes,0) ELSE 0 END),0) AS completed_minutes,
      COUNT(CASE WHEN l.status='completed' THEN 1 END) AS completed,
      COUNT(CASE WHEN l.status='watching' THEN 1 END) AS watching,
      COUNT(CASE WHEN l.status='planned' THEN 1 END) AS planned,
      COUNT(CASE WHEN l.status='dropped' THEN 1 END) AS dropped,
      AVG(CASE WHEN l.rating IS NOT NULL THEN l.rating END) AS avg_rating,
      COUNT(CASE WHEN c.kind='movie' THEN 1 END) AS movies,
      COUNT(CASE WHEN c.kind='series' THEN 1 END) AS series
    FROM library l JOIN catalog c ON c.id = l.catalog_id
  `).get() as {
    total_titles: number
    completed_minutes: number
    completed: number
    watching: number
    planned: number
    dropped: number
    avg_rating: number | null
    movies: number
    series: number
  }

  const byGenre = raw.prepare(`
    SELECT g.value AS genre, COUNT(*) AS count,
      SUM(CASE WHEN l.status='completed' THEN COALESCE(c.runtime_minutes,0) ELSE 0 END) AS minutes
    FROM library l JOIN catalog c ON c.id = l.catalog_id,
      json_each('["' || replace(c.genres,'|','","') || '"]') g
    GROUP BY g.value ORDER BY count DESC LIMIT 12
  `).all() as { genre: string; count: number; minutes: number }[]

  const byYear = raw.prepare(`
    SELECT c.year AS year, COUNT(*) AS count
    FROM library l JOIN catalog c ON c.id = l.catalog_id
    WHERE c.year IS NOT NULL GROUP BY c.year ORDER BY c.year ASC
  `).all() as { year: number; count: number }[]

  const byDecade = raw.prepare(`
    SELECT (c.year/10)*10 AS decade, COUNT(*) AS count,
      SUM(CASE WHEN l.status='completed' THEN COALESCE(c.runtime_minutes,0) ELSE 0 END) AS minutes
    FROM library l JOIN catalog c ON c.id = l.catalog_id
    WHERE c.year IS NOT NULL GROUP BY decade ORDER BY decade ASC
  `).all() as { decade: number; count: number; minutes: number }[]

  const topPeople = raw.prepare(`
    SELECT p.name AS name, p.role AS role, COUNT(DISTINCT l.catalog_id) AS count
    FROM people p
    JOIN library l ON l.catalog_id = p.catalog_id
    GROUP BY p.name, p.role ORDER BY count DESC LIMIT 10
  `).all() as { name: string; role: string; count: number }[]

  const ratingDistribution = raw.prepare(`
    SELECT l.rating AS rating, COUNT(*) AS count
    FROM library l WHERE l.rating IS NOT NULL GROUP BY l.rating ORDER BY l.rating ASC
  `).all() as { rating: number; count: number }[]

  const monthlyActivity = raw.prepare(`
    SELECT substr(l.watched_at,1,7) AS month, COUNT(*) AS count
    FROM library l WHERE l.watched_at IS NOT NULL
    GROUP BY month ORDER BY month ASC LIMIT 24
  `).all() as { month: string; count: number }[]

  void db
  void inArray

  return {
    totalTitles: totals.total_titles ?? 0,
    totalRuntimeMinutes: totals.completed_minutes ?? 0,
    completed: totals.completed ?? 0,
    watching: totals.watching ?? 0,
    planned: totals.planned ?? 0,
    dropped: totals.dropped ?? 0,
    averageRating: totals.avg_rating ?? 0,
    byKind: { movie: totals.movies ?? 0, series: totals.series ?? 0 },
    byGenre,
    byYear,
    byDecade,
    topPeople,
    ratingDistribution,
    monthlyActivity
  }
}

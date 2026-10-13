import { getDb, getRaw } from './index'
import { catalog, library, episodeLog, settings } from './schema'
import { eq, desc, asc, sql, and, inArray, isNull } from 'drizzle-orm'
import { resolveStatus } from '@shared/status'
import { derivableStatusKeys, watchTimeStatusKeys } from './statuses'
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
    statusOverride: Boolean(row.library.statusOverride),
    episodesRuntime: row.library.episodesRuntime ?? null,
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

  // Prefer FTS5 for prefix/prefix-token matching; fall back to LIKE for short
  // queries. Better-sqlite3 binds numbered (?1/?2) parameters by NAME, so the
  // values must be passed as {1: term, 2: limit} — passing them positionally
  // threw a RangeError on every search, which the catch below swallowed, so
  // the index was never used and every keystroke scanned the whole table.
  const term = q.endsWith('*') ? q : `${q}*`
  try {
    const fts = getRaw().prepare(`
      SELECT c.* FROM catalog_fts f
      JOIN catalog c ON c.id = f.rowid
      WHERE catalog_fts MATCH ?1
      ORDER BY rank, c.popularity DESC
      LIMIT ?2
    `)
    const rows = fts.all({ 1: term, 2: limit }) as (typeof catalog.$inferSelect)[]
    if (rows.length > 0) return rows.map(rowToCatalog)
  } catch {
    /* index missing or the query is malformed — fall through to LIKE */
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
    if (byTmdb) {
      // A row found by TMDB id may predate a runtime/episode/IMDb enrichment, so
      // fill the gaps rather than returning a permanently runtime-less row
      // (a movie with no runtime contributes nothing to watch time, and a row
      // with no IMDb id can never find subtitles).
      if (
        (item.runtimeMinutes && !byTmdb.runtimeMinutes) ||
        (item.imdbId && !byTmdb.imdbId) ||
        (item.posterPath && !byTmdb.posterPath) ||
        (item.overview && !byTmdb.overview)
      ) {
        db.update(catalog)
          .set({
            runtimeMinutes: item.runtimeMinutes ?? byTmdb.runtimeMinutes,
            imdbId: item.imdbId ?? byTmdb.imdbId,
            posterPath: item.posterPath ?? byTmdb.posterPath,
            backdropPath: item.backdropPath ?? byTmdb.backdropPath,
            overview: item.overview ?? byTmdb.overview,
            voteAverage: item.voteAverage ?? byTmdb.voteAverage,
            voteCount: item.voteCount ?? byTmdb.voteCount,
            genres: item.genres.length ? item.genres.join('|') : byTmdb.genres
          })
          .where(eq(catalog.id, byTmdb.id))
          .run()
        return rowToCatalog(db.select().from(catalog).where(eq(catalog.id, byTmdb.id)).get()!)
      }
      return rowToCatalog(byTmdb)
    }
  }

  const byTitle = db
    .select()
    .from(catalog)
    .where(
      and(
        eq(catalog.title, item.title),
        // Without the kind, a movie and a series sharing a title+year collapse
        // into one row and the stored kind wins — a series gets shelved as a
        // movie.
        eq(catalog.kind, item.kind),
        item.year != null ? eq(catalog.year, item.year) : isNull(catalog.year)
      )
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

export interface AddOptions {
  /** Total episode count for a series — powers watch time + progress. */
  episodesTotal?: number | null
  seasonsTotal?: number | null
  /** Override the watched stamp (bulk history imports spread dates). */
  watchedAt?: string | null
  /**
   * Whether this add is an explicit, deliberate status choice. Default true —
   * an explicit "mark watched" from search/detail pins the status. Bulk
   * imports pass false for series so the progress engine still owns them.
   */
  statusOverride?: boolean
}

export function addToLibrary(
  catalogId: number,
  status: WatchStatus,
  opts: AddOptions = {}
): LibraryItem {
  const db = getDb()
  const now = opts.watchedAt ?? new Date().toISOString()
  const existing = db
    .select()
    .from(library)
    .where(eq(library.catalogId, catalogId))
    .get()
  const override = opts.statusOverride !== false

  if (existing) {
    db.update(library)
      .set({
        status,
        updatedAt: now,
        watchedAt: status === 'completed' ? now : existing.watchedAt,
        statusOverride: override,
        episodesTotal: opts.episodesTotal ?? existing.episodesTotal ?? null,
        seasonsTotal: opts.seasonsTotal ?? existing.seasonsTotal ?? null,
        // Marking a series complete without episode-by-episode logging means
        // "I saw it all" — record the full run so progress and watch time
        // both reflect that. Never clobber a real per-episode count.
        ...(status === 'completed' && opts.episodesTotal && !existing.episodesWatched
          ? { episodesWatched: opts.episodesTotal }
          : {})
      })
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
  const isSeries = item?.kind === 'series'
  const total = opts.episodesTotal ?? null
  const result = db
    .insert(library)
    .values({
      catalogId,
      status,
      addedAt: now,
      updatedAt: now,
      watchedAt: status === 'completed' ? now : null,
      statusOverride: override,
      episodesTotal: total,
      seasonsTotal: opts.seasonsTotal ?? null,
      // A series shelved straight as completed carries no episode log; seed
      // the progress bar at full so it isn't shown as 0/N watched.
      episodesWatched: isSeries && status === 'completed' && total ? total : 0
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
  patch: Partial<
    Pick<LibraryItem, 'status' | 'rating' | 'notes' | 'watchedAt' | 'episodesTotal' | 'seasonsTotal' | 'episodesRuntime'>
  >,
  manualStatus: boolean = patch.status !== undefined
): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.update(library)
    .set({
      ...patch,
      updatedAt: now,
      // Picking a status by hand pins it against the progress engine.
      ...(manualStatus ? { statusOverride: true } : {}),
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
    const current = db.select().from(library).where(eq(library.id, libraryId)).get()
    const logged = total?.count ?? 0

    // A series shelved as completed in bulk carries a full count but no
    // episode rows, so `logged` alone would collapse 20/20 down to 1/20 the
    // moment the user ticks an episode. Never let the logged count go
    // backwards.
    const watched = Math.max(logged, current?.episodesWatched ?? 0)

    // Series status follows progress unless the user pinned it by hand, so
    // finishing the last episode completes the show automatically.
    const catalogKind = db
      .select({ kind: catalog.kind })
      .from(catalog)
      .where(eq(catalog.id, current!.catalogId))
      .get()?.kind
    const resolved = resolveStatus({
      kind: catalogKind ?? 'series',
      episodesWatched: watched,
      episodesTotal: current?.episodesTotal ?? null,
      statusOverride: current?.statusOverride ?? false,
      currentStatus: current!.status,
      requested: null,
      derivableKeys: derivableStatusKeys()
    })

    db.update(library)
      .set({
        episodesWatched: watched,
        updatedAt: now,
        status: resolved.status,
        // Stamp the completion date the first time a show finishes.
        ...(resolved.status === 'completed' && !current?.watchedAt ? { watchedAt: now } : {})
      })
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

/**
 * Watched minutes for one library row, as an SQL fragment.
 *
 * Movies contribute their runtime. Series have no single runtime of their
 * own, so the total comes from the episode count (logged, or the series' full
 * count) times the average episode runtime — which may come from the user's
 * per-title override first. Only statuses the user has flagged
 * `countsTowardWatchTime` contribute, so making a status count toward the
 * total is a one-click setting change, not a code change.
 *
 * @param countingKeys status keys that count toward watch time.
 */
function watchedMinutesSql(countingKeys: string[]): string {
  const inList = countingKeys.map(() => '?').join(', ') || "''"
  return `
  CASE WHEN l.status IN (${inList}) THEN
    CASE WHEN c.kind = 'movie'
      THEN COALESCE(c.runtime_minutes, 0)
      ELSE COALESCE(NULLIF(l.episodes_watched, 0), l.episodes_total, 0)
           * COALESCE(l.episodes_runtime, c.runtime_minutes, 0)
    END
  ELSE 0 END`
}

export function getStats(): Stats {
  const db = getDb()
  const raw = getRaw()
  const countingKeys = [...watchTimeStatusKeys()]
  const WATCHED_MINUTES = watchedMinutesSql(countingKeys)

  const totals = raw.prepare(`
    SELECT
      COUNT(*) AS total_titles,
      COALESCE(SUM(${WATCHED_MINUTES}),0) AS completed_minutes,
      COUNT(CASE WHEN l.status='completed' THEN 1 END) AS completed,
      COUNT(CASE WHEN l.status='watching' THEN 1 END) AS watching,
      COUNT(CASE WHEN l.status='planned' THEN 1 END) AS planned,
      COUNT(CASE WHEN l.status='dropped' THEN 1 END) AS dropped,
      AVG(CASE WHEN l.rating IS NOT NULL THEN l.rating END) AS avg_rating,
      COUNT(CASE WHEN c.kind='movie' THEN 1 END) AS movies,
      COUNT(CASE WHEN c.kind='series' THEN 1 END) AS series
    FROM library l JOIN catalog c ON c.id = l.catalog_id
  `).get(...countingKeys) as {
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

  // Titles added from a live TMDB search carry genre *ids*, not names, so their
  // genres column is ''. Splitting that yields a single empty-string genre
  // that renders as a blank bar and can push a real genre out of the top 12.
  const byGenre = raw.prepare(`
    SELECT g.value AS genre, COUNT(*) AS count,
      SUM(${WATCHED_MINUTES}) AS minutes
    FROM library l JOIN catalog c ON c.id = l.catalog_id,
      json_each('["' || replace(c.genres,'|','","') || '"]') g
    WHERE c.genres <> '' AND g.value <> ''
    GROUP BY g.value ORDER BY count DESC LIMIT 12
  `).all(...countingKeys) as { genre: string; count: number; minutes: number }[]

  const byYear = raw.prepare(`
    SELECT c.year AS year, COUNT(*) AS count
    FROM library l JOIN catalog c ON c.id = l.catalog_id
    WHERE c.year IS NOT NULL GROUP BY c.year ORDER BY c.year ASC
  `).all() as { year: number; count: number }[]

  // `decade` is not in the WHERE clause, so rows with an unknown year grouped
  // under NULL and reached the chart as a nameless wedge. Filter on the
  // grouped expression, not the source column.
  const byDecade = raw.prepare(`
    SELECT CAST((c.year / 10) * 10 AS INTEGER) AS decade, COUNT(*) AS count,
      SUM(${WATCHED_MINUTES}) AS minutes
    FROM library l JOIN catalog c ON c.id = l.catalog_id
    WHERE c.year IS NOT NULL GROUP BY decade ORDER BY decade ASC
  `).all(...countingKeys) as { decade: number; count: number; minutes: number }[]

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

  // Keep the *newest* 24 months. ORDER BY month ASC took the oldest window
  // instead, so any library older than two years showed a chart frozen in the
  // past. Sort ascending afterwards so the chart still reads left-to-right.
  const monthlyActivity = raw
    .prepare(`
      SELECT substr(l.watched_at,1,7) AS month, COUNT(*) AS count
      FROM library l WHERE l.watched_at IS NOT NULL
      GROUP BY month ORDER BY month DESC LIMIT 24
    `)
    .all() as { month: string; count: number }[]
  monthlyActivity.reverse()

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

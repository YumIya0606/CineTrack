import { getRaw } from './index'
import { listStatuses } from './statuses'
import { rowWatchMinutes, fallbackLabel } from '@shared/status'
import type {
  BoardFilters,
  BoardGroupBucket,
  BoardResult,
  BoardRow,
  BoardSort
} from '@shared/types'

/** Columns the board selects from the catalog join. */
interface RawRow {
  catalog: Record<string, unknown>
  library: Record<string, unknown>
  watch_minutes: number
}

function toRow(r: RawRow): BoardRow {
  const c = r.catalog
  const l = r.library
  return {
    id: Number(c.id),
    tmdbId: (c.tmdb_id as number) ?? null,
    imdbId: (c.imdb_id as string) ?? null,
    title: c.title as string,
    originalTitle: (c.original_title as string) ?? null,
    kind: c.kind as 'movie' | 'series',
    year: (c.year as number) ?? null,
    endYear: (c.end_year as number) ?? null,
    genres: ((c.genres as string) || '').split('|').filter(Boolean),
    runtimeMinutes: (c.runtime_minutes as number) ?? null,
    voteAverage: (c.vote_average as number) ?? null,
    voteCount: (c.vote_count as number) ?? null,
    overview: (c.overview as string) ?? null,
    posterPath: (c.poster_path as string) ?? null,
    backdropPath: (c.backdrop_path as string) ?? null,
    popularity: (c.popularity as number) ?? null,
    libraryId: Number(l.id),
    status: l.status as string,
    statusOverride: Boolean(l.status_override),
    episodesRuntime: (l.episodes_runtime as number) ?? null,
    rating: (l.rating as number) ?? null,
    notes: (l.notes as string) ?? null,
    addedAt: l.added_at as string,
    updatedAt: l.updated_at as string,
    watchedAt: (l.watched_at as string) ?? null,
    episodesWatched: Number(l.episodes_watched ?? 0),
    episodesTotal: (l.episodes_total as number) ?? null,
    seasonsTotal: (l.seasons_total as number) ?? null,
    playCount: Number(l.play_count ?? 1),
    watchMinutes: r.watch_minutes ?? 0
  }
}

const SORTS: Record<BoardSort, string> = {
  updated: 'l.updated_at DESC',
  title: 'c.title COLLATE NOCASE ASC',
  year: 'c.year DESC',
  rating: 'l.rating DESC NULLS LAST, c.title COLLATE NOCASE ASC',
  runtime: 'runtime_minutes DESC NULLS LAST',
  watchedAt: 'l.watched_at DESC NULLS LAST',
  status: 'l.status ASC, c.title COLLATE NOCASE ASC',
  progress: `CASE WHEN l.episodes_total > 0
      THEN CAST(l.episodes_watched AS REAL) / l.episodes_total
      WHEN c.kind = 'movie' THEN 1 ELSE -1 END DESC`
}

/**
 * Builds the WHERE clause for the board. Everything is optional and combined
 * with AND; genre matching is "any of" so selecting several widens the net.
 *
 * Returns the SQL fragment plus the bound values **in placeholder order** —
 * the two are produced together so they can never drift apart.
 */
function buildWhere(
  f: BoardFilters,
  allKeys: string[]
): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (f.statuses?.length) {
    // Ignore keys that no longer exist in the palette, so a stale key from an
    // old backup can't blow up the query.
    const valid = f.statuses.filter(s => allKeys.includes(s))
    if (valid.length) {
      clauses.push(`l.status IN (${valid.map(() => '?').join(', ')})`)
      params.push(...valid)
    }
  }
  if (f.kind) {
    clauses.push('c.kind = ?')
    params.push(f.kind)
  }
  if (f.genres?.length) {
    // genres is a pipe-joined column; match any of the requested genres.
    // Wrapped in % so a partial name (e.g. "Sci") still hits "Sci-Fi".
    clauses.push(
      `(${f.genres.map(() => `(',' || replace(c.genres, '|', ',') || ',') LIKE ?`).join(' OR ')})`
    )
    params.push(...f.genres.map(g => `%${g}%`))
  }
  if (f.yearMin != null) {
    clauses.push('c.year >= ?')
    params.push(f.yearMin)
  }
  if (f.yearMax != null) {
    clauses.push('c.year <= ?')
    params.push(f.yearMax)
  }
  if (f.ratingMin != null) {
    clauses.push('l.rating >= ?')
    params.push(f.ratingMin)
  }
  if (f.rated === true) clauses.push('l.rating IS NOT NULL')
  if (f.rated === false) clauses.push('l.rating IS NULL')
  if (f.watchedOnly) clauses.push(`l.status IN ('completed', 'rewatching')`)
  if (f.inProgressOnly)
    clauses.push(`l.status = 'watching' AND l.episodes_watched < COALESCE(l.episodes_total, 1e9)`)
  if (f.query?.trim()) {
    clauses.push('c.title LIKE ? COLLATE NOCASE')
    params.push(`%${f.query.trim().replace(/[%_]/g, '')}%`)
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

const SELECT_BASE = `
  SELECT
    c.*,
    l.id AS l_id, l.catalog_id AS l_catalog_id, l.status AS l_status,
    l.rating AS l_rating, l.notes AS l_notes, l.added_at AS l_added_at,
    l.updated_at AS l_updated_at, l.watched_at AS l_watched_at,
    l.episodes_watched AS l_episodes_watched, l.episodes_total AS l_episodes_total,
    l.seasons_total AS l_seasons_total, l.play_count AS l_play_count,
    l.status_override AS l_status_override, l.episodes_runtime AS l_episodes_runtime
  FROM library l JOIN catalog c ON c.id = l.catalog_id
`

/**
 * Runs the board query. One pass for the summary counts, one for the rows, and
 * one for the genre facet list — all on the raw handle so a library of a few
 * thousand titles stays instant instead of shipping everything to the renderer
 * to filter there.
 */
export function queryBoard(
  filters: BoardFilters,
  sort: BoardSort = 'updated'
): BoardResult {
  const raw = getRaw()
  const defs = listStatuses()
  const defByKey = new Map(defs.map(d => [d.key, d]))
  const countingKeys = defs.filter(d => d.countsTowardWatchTime).map(d => d.key)

  const { sql: where, params } = buildWhere(filters, defs.map(d => d.key))
  const orderBy = SORTS[sort] ?? SORTS.updated

  // Summary is computed over the *filtered* set so the counts always agree
  // with what the table is showing. Its placeholders come first, so its
  // values are prepended.
  const summaryRows = raw
    .prepare(
      `SELECT l.status AS key,
        COUNT(*) AS count,
        COALESCE(SUM(
          CASE
            WHEN l.status NOT IN (${countingKeys.map(() => '?').join(', ') || "''"}) THEN 0
            WHEN c.kind = 'movie' THEN COALESCE(c.runtime_minutes, 0)
            ELSE COALESCE(NULLIF(l.episodes_watched, 0), l.episodes_total, 0)
                 * COALESCE(l.episodes_runtime, c.runtime_minutes, 0)
          END
        ), 0) AS minutes
       FROM library l JOIN catalog c ON c.id = l.catalog_id
       ${where}
       GROUP BY l.status`
    )
    .all(...countingKeys, ...params) as { key: string; count: number; minutes: number }[]

  const summary = summaryRows.map(s => {
    const def = defByKey.get(s.key)
    return {
      key: s.key,
      label: def?.label ?? fallbackLabel(s.key),
      color: def?.color ?? 'slate',
      count: s.count,
      minutes: s.minutes
    }
  })
  // Palette order, so the strip always reads the same way.
  const order = new Map(defs.map((d, i) => [d.key, i]))
  summary.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))

  const totalRow = raw
    .prepare(`SELECT COUNT(*) AS n FROM library l JOIN catalog c ON c.id = l.catalog_id ${where}`)
    .get(...params) as { n: number } | undefined

  const rawRows = raw
    .prepare(`${SELECT_BASE} ${where} ORDER BY ${orderBy}`)
    .all(...params) as Record<string, unknown>[]

  const rows: BoardRow[] = rawRows.map(r => {
    const lib = {
      id: r.l_id,
      catalog_id: r.l_catalog_id,
      status: r.l_status,
      rating: r.l_rating,
      notes: r.l_notes,
      added_at: r.l_added_at,
      updated_at: r.l_updated_at,
      watched_at: r.l_watched_at,
      episodes_watched: r.l_episodes_watched,
      episodes_total: r.l_episodes_total,
      seasons_total: r.l_seasons_total,
      play_count: r.l_play_count,
      status_override: r.l_status_override,
      episodes_runtime: r.l_episodes_runtime
    }
    const row = toRow({ catalog: r, library: lib, watch_minutes: 0 })
    row.watchMinutes = rowWatchMinutes(row, defByKey, row.status)
    return row
  })

  const genres = raw
    .prepare(
      `SELECT DISTINCT value AS genre FROM library l JOIN catalog c ON c.id = l.catalog_id,
        json_each('["' || replace(c.genres,'|','","') || '"]') g
       WHERE value <> '' ORDER BY genre`
    )
    .all() as { genre: string }[]

  return { rows, total: totalRow?.n ?? 0, summary, genres: genres.map(g => g.genre) }
}
/** Groups rows client-side for the visual headers. */
export function groupRows(rows: BoardRow[], group: string): BoardGroupBucket[] {
  if (group === 'none') return []
  const map = new Map<string, BoardGroupBucket>()
  for (const row of rows) {
    let keys: string[]
    if (group === 'status') keys = [row.status]
    else if (group === 'kind') keys = [row.kind]
    else if (group === 'genre') keys = row.genres.length ? row.genres : ['Uncategorised']
    else {
      keys = [row.year ? `${Math.floor(row.year / 10) * 10}s` : 'Unknown year']
    }
    for (const key of keys) {
      const g = map.get(key) ?? { key, label: key, count: 0, minutes: 0 }
      g.count++
      g.minutes += row.watchMinutes
      map.set(key, g)
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}
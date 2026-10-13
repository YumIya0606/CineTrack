import { getDb } from './index'
import { catalog, library } from './schema'
import { eq } from 'drizzle-orm'
import { ensureCatalogItem, addToLibrary, getCatalogItem } from './queries'
import { detailsTmdb, getTmdbConfig } from '../tmdb/client'
import { distributeWatchedDate } from '@shared/utils'
import type { CatalogItem, WatchStatus, BulkAddOptions, BulkAddResult, BackfillResult } from '@shared/types'

/** A catalog row plus the series counts that only TMDB details can give us. */
interface EnrichedItem extends CatalogItem {
  episodesTotal: number | null
  seasonsTotal: number | null
}

/** Runs an async mapper over a list with a bounded worker pool. */
async function pooledMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) break
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Fills in runtime and episode counts from TMDB when a row doesn't carry them.
 *
 * This is the root cause of "watch time never moves": `/search` and
 * `/trending` responses have no `runtime` at all, and a series never has a
 * single runtime — so a movie added from a live search, and every series
 * added any way, landed in the catalog with a null runtime and counted as
 * zero minutes forever. Details endpoints carry both, so we fetch once, at
 * add time, when TMDB is reachable.
 */
export async function enrichRuntime(item: CatalogItem): Promise<EnrichedItem> {
  const base: EnrichedItem = { ...item, episodesTotal: null, seasonsTotal: null }
  if (!item.tmdbId || !getTmdbConfig().connected) return base
  if (item.runtimeMinutes) {
    // A series still needs its episode count for watch time, so keep going.
    if (item.kind !== 'series') return base
  }

  try {
    const d = await detailsTmdb(item.tmdbId, item.kind)
    // A 0 from TMDB means "unknown", not "zero minutes" — keep it null so it
    // never overwrites a good value or zeroes out the watch-time sum.
    const runtime =
      item.kind === 'series'
        ? (d.episode_run_time?.find(r => r > 0) ?? null)
        : (d.runtime || null)
    return {
      ...base,
      runtimeMinutes: runtime ?? item.runtimeMinutes ?? null,
      episodesTotal: d.number_of_episodes ?? null,
      seasonsTotal: d.number_of_seasons ?? null
    }
  } catch {
    return base
  }
}

/**
 * Adds many titles to the library in one pass. Each item is persisted to the
 * catalog (creating the row when it arrives live from TMDB) and shelved under
 * the chosen status. Items already shelved are skipped — a bulk import must
 * never clobber an existing rating or progress.
 */
export async function bulkAddToLibrary(
  items: CatalogItem[],
  status: WatchStatus,
  opts: BulkAddOptions = {}
): Promise<BulkAddResult> {
  // Fetch runtimes in parallel before writing: the DB work is synchronous and
  // would otherwise stall on one network round trip per title.
  const enriched = await pooledMap(items, 4, it => enrichRuntime(it))

  const result: BulkAddResult = { added: 0, skipped: 0 }
  for (const item of enriched) {
    const persisted = ensureCatalogItem(item)
    const existing = getDb()
      .select({ id: library.id })
      .from(library)
      .where(eq(library.catalogId, persisted.id))
      .get()
    if (existing) {
      result.skipped++
      continue
    }

    const watchedAt =
      status === 'completed' && opts.windowMonths
        ? distributeWatchedDate(item.title, opts.windowMonths)
        : undefined

    addToLibrary(persisted.id, status, {
      episodesTotal: item.episodesTotal,
      seasonsTotal: item.seasonsTotal,
      watchedAt
    })
    result.added++
  }

  return result
}

/** Series counts that only the TMDB details endpoints can give us. */
export interface EpisodeCounts {
  episodesTotal: number | null
  seasonsTotal: number | null
}

const NO_COUNTS: EpisodeCounts = { episodesTotal: null, seasonsTotal: null }

/**
 * Enriches an already-persisted catalog row with its runtime and, for series,
 * its episode counts — then writes the runtime back so future stats skip the
 * call. This is what makes a single title shelved from the search palette or
 * marked complete in the detail panel contribute real minutes.
 */
export async function enrichCatalogRow(catalogId: number): Promise<EpisodeCounts> {
  const row = getCatalogItem(catalogId)
  if (!row) return NO_COUNTS

  const enriched = await enrichRuntime(row)
  if (enriched.runtimeMinutes && !row.runtimeMinutes) {
    getDb()
      .update(catalog)
      .set({ runtimeMinutes: enriched.runtimeMinutes })
      .where(eq(catalog.id, row.id))
      .run()
  }
  return { episodesTotal: enriched.episodesTotal, seasonsTotal: enriched.seasonsTotal }
}

/** Same enrichment, reached from a library row id (the status-chip path). */
export async function enrichForLibraryRow(libraryId: number): Promise<EpisodeCounts> {
  const row = getDb()
    .select({ catalogId: library.catalogId })
    .from(library)
    .where(eq(library.id, libraryId))
    .get()
  return row ? enrichCatalogRow(row.catalogId) : NO_COUNTS
}

/**
 * Repairs watch time for titles already on the shelf whose catalog rows were
 * saved without a runtime (added from a live search, or any series). Run when
 * the user asks — it's a few hundred milliseconds per missing title.
 */
export async function backfillRuntimes(): Promise<BackfillResult> {
  if (!getTmdbConfig().connected) return { fixed: 0, total: 0 }

  const rows = getDb()
    .select({ catalog, library })
    .from(library)
    .innerJoin(catalog, eq(catalog.id, library.catalogId))
    .all()

  // Anything missing a runtime, a series episode total, or an IMDb id. The
  // IMDb id is what every subtitle provider keys on, so titles added before
  // we started appending external_ids are all subtitle-less until repaired.
  const needs = rows.filter(
    r =>
      !r.catalog.runtimeMinutes ||
      !r.catalog.imdbId ||
      (r.catalog.kind === 'series' && r.library.episodesTotal === null && r.library.episodesWatched === 0)
  )
  if (needs.length === 0) return { fixed: 0, total: 0 }

  let fixed = 0
  await pooledMap(needs, 4, async r => {
    if (!r.catalog.tmdbId) return
    try {
      const d = await detailsTmdb(r.catalog.tmdbId, r.catalog.kind)
      const runtime =
        r.catalog.kind === 'series'
          ? (d.episode_run_time?.find(x => x > 0) ?? null)
          : (d.runtime || null)
      const imdbId = d.external_ids?.imdb_id ?? null

      // A row can be "fixed" by the IMDb id alone even without a runtime, so
      // write whatever we learned instead of bailing on a missing runtime.
      if (!runtime && !imdbId) return

      const patch: Partial<typeof catalog.$inferInsert> = {}
      if (runtime && !r.catalog.runtimeMinutes) patch.runtimeMinutes = runtime
      if (imdbId && !r.catalog.imdbId) patch.imdbId = imdbId
      if (Object.keys(patch).length) {
        getDb().update(catalog).set(patch).where(eq(catalog.id, r.catalog.id)).run()
      }

      // A completed series with no logged episodes inherits the full count so
      // its watch time finally lands. Series still being watched keep their
      // own math (runtime × logged episodes) once episodes appear.
      if (
        runtime &&
        r.catalog.kind === 'series' &&
        d.number_of_episodes &&
        !r.library.episodesWatched
      ) {
        getDb()
          .update(library)
          .set({
            episodesTotal: d.number_of_episodes,
            seasonsTotal: d.number_of_seasons ?? null,
            ...(r.library.status === 'completed' ? { episodesWatched: d.number_of_episodes } : {})
          })
          .where(eq(library.id, r.library.id))
          .run()
      }
      fixed++
    } catch {
      /* a title TMDB can't resolve is left untouched */
    }
  })

  return { fixed, total: needs.length }
}

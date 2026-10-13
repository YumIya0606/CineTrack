import { readFileSync } from 'fs'
import { addToLibrary, ensureCatalogItem } from '../db/queries'
import { getDb } from '../db'
import { catalog, library } from '../db/schema'
import { eq } from 'drizzle-orm'
import { findByImdbTmdb, detailsTmdb, tmdbToCatalog, getTmdbConfig } from '../tmdb/client'
import { pooledMap } from '../db/bulk'
import type { CatalogItem, WatchStatus } from '@shared/types'

interface ImportResult {
  imported: number
  skipped: number
}

/** One CSV row, plus the catalog row it resolved to once known. */
interface PendingRow {
  imdbId: string | null
  title: string
  year: number | null
  rating: number | null
  date: string | null
}

/**
 * Imports an IMDb ratings CSV export (downloadable from your IMDb ratings
 * page).
 *
 * Matching runs in three passes, cheapest first:
 *   1. by IMDb ID against the local catalog
 *   2. by title + year against the local catalog
 *   3. for whatever is left, ask TMDB what the IMDb ID refers to, build the
 *      catalog row, and shelve it
 *
 * Pass 3 is the one that matters. Matching only against titles you had
 * *already* shelved meant a 600-row ratings export could import almost nothing
 * — which defeats the point of exporting your history in the first place. The
 * IMDb ID is a globally unique key, so it can only ever resolve to the right
 * film; title matching cannot make that claim, because remakes share titles.
 */
export async function importImdbRatings(filePath: string): Promise<ImportResult> {
  const csv = readFileSync(filePath, 'utf-8')
  const parsed = parseCsv(csv)

  const result: ImportResult = { imported: 0, skipped: 0 }
  const db = getDb()

  const rows: PendingRow[] = []
  for (const row of parsed) {
    const title = row['Title']?.trim()
    if (!title) {
      result.skipped++
      continue
    }
    rows.push({
      imdbId: row['Const']?.trim() || null,
      title,
      year: row['Year'] ? Number(row['Year']) : null,
      rating: row['Your Rating'] ? Number(row['Your Rating']) : null,
      date: row['Date Rated']?.trim() || null
    })
  }

  const shelve = (catalogRow: typeof catalog.$inferSelect, row: PendingRow) => {
    const status: WatchStatus = 'completed'
    const lib = addToLibrary(catalogRow.id, status)

    if (row.rating || row.date) {
      // Guard the parse: toISOString() throws RangeError on an invalid Date,
      // which previously aborted the import mid-flight.
      const watched = row.date ? new Date(row.date) : null
      const iso = watched && !Number.isNaN(watched.getTime()) ? watched.toISOString() : null
      db.update(library)
        .set({ rating: row.rating ?? null, watchedAt: iso })
        .where(eq(library.id, lib.libraryId))
        .run()
    }
    result.imported++
  }

  const unresolved: PendingRow[] = []

  // A bad row must not abort the loop after earlier rows are already committed,
// so the local-matching passes stay inside a transaction. Pass 3 is
  // necessarily outside it: it awaits the network.
  db.transaction(() => {
    for (const row of rows) {
      let catalogRow: typeof catalog.$inferSelect | null = null

      if (row.imdbId) {
        catalogRow = db.select().from(catalog).where(eq(catalog.imdbId, row.imdbId)).get() ?? null
      }

      if (!catalogRow) {
        const byTitle = db.select().from(catalog).where(eq(catalog.title, row.title)).all()
        if (row.year) {
          // Only accept an exact year. Falling back to "any title with this
          // name" silently shelves a remake instead of the film the user rated.
          catalogRow = byTitle.find(r => r.year === row.year) ?? null
        } else {
          catalogRow = byTitle[0] ?? null
        }
      }

      if (catalogRow) shelve(catalogRow, row)
      else unresolved.push(row)
    }
  })

  // Pass 3: resolve the rest through TMDB. Bounded concurrency keeps a large
  // export from opening hundreds of sockets at once and tripping rate limits.
  const canResolve = unresolved.length > 0 && getTmdbConfig().connected
  if (!canResolve) {
    // Without a TMDB key there is no way to turn an IMDb ID into a title, so
    // these rows simply have nothing to match against.
    result.skipped += unresolved.length
    return result
  }

  const fetched = await pooledMap(unresolved, 4, async (row): Promise<CatalogItem | null> => {
    if (!row.imdbId) return null
    try {
      const found = await findByImdbTmdb(row.imdbId)
      const tmdbId = found.movieId ?? found.tvId
      if (!tmdbId) return null
      const kind = found.movieId ? ('movie' as const) : ('series' as const)
      const details = await detailsTmdb(tmdbId, kind)
      return ensureCatalogItem(tmdbToCatalog(details, kind))
    } catch {
      // One unreachable title must not fail the import.
      return null
    }
  })

  fetched.forEach((item: CatalogItem | null, i: number) => {
    if (!item) {
      result.skipped++
      return
    }
    const row = unresolved[i]!
    const catalogRow = db.select().from(catalog).where(eq(catalog.id, item.id)).get()
    if (catalogRow) shelve(catalogRow, row)
    else result.skipped++
  })

  return result
}

/* Minimal RFC-4180-ish CSV parser (handles quoted fields & embedded commas). */
function parseCsv(csv: string): Record<string, string>[] {
  const lines: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < csv.length) {
    const char = csv[i]!
    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      current.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\r') {
      i++
      continue
    }
    if (char === '\n') {
      current.push(field)
      lines.push(current)
      current = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    lines.push(current)
  }

  const headers = lines[0]?.map(h => h.trim()) ?? []
  return lines
    .slice(1)
    .map(row => {
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => {
        obj[h] = (row[idx] ?? '').trim()
      })
      return obj
    })
    // A trailing newline (or a blank line mid-file) parses to a row of empty
    // strings. Without this it counts as a skipped title, so the summary
    // reports phantom misses for rows the user never rated.
    .filter(row => Object.values(row).some(v => v !== ''))
}

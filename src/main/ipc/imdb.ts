import { readFileSync } from 'fs'
import { addToLibrary } from '../db/queries'
import { getDb } from '../db'
import { catalog, library } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { WatchStatus } from '@shared/types'

interface ImportResult {
  imported: number
  skipped: number
}

/**
 * Imports an IMDb ratings CSV export (downloadable from your IMDb ratings
 * page). Matches titles against the bundled catalog by IMDb ID first,
 * then by title + year.
 */
export function importImdbRatings(filePath: string): ImportResult {
  const csv = readFileSync(filePath, 'utf-8')
  const rows = parseCsv(csv)

  const result: ImportResult = { imported: 0, skipped: 0 }
  const db = getDb()

  for (const row of rows) {
    const imdbId = row['Const']?.trim()
    const title = row['Title']?.trim()
    const year = row['Year'] ? Number(row['Year']) : null
    const rating = row['Your Rating'] ? Number(row['Your Rating']) : null
    const date = row['Date Rated']?.trim()

    if (!title) {
      result.skipped++
      continue
    }

    let catalogRow: typeof catalog.$inferSelect | null = null

    if (imdbId) {
      catalogRow = db.select().from(catalog).where(eq(catalog.imdbId, imdbId)).get() ?? null
    }

    if (!catalogRow) {
      const byTitle = db.select().from(catalog).where(eq(catalog.title, title)).all()
      catalogRow = byTitle.find(r => (year ? r.year === year : true)) ?? byTitle[0] ?? null
    }

    if (!catalogRow) {
      result.skipped++
      continue
    }

    const status: WatchStatus = 'completed'
    const lib = addToLibrary(catalogRow.id, status)

    if (rating || date) {
      const iso = date ? new Date(date).toISOString() : null
      db.update(library)
        .set({ rating: rating ?? null, watchedAt: iso })
        .where(eq(library.id, lib.libraryId))
        .run()
    }

    result.imported++
  }

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
  return lines.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? '').trim()
    })
    return obj
  })
}

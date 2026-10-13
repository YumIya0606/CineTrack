import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/*
 * The IMDb importer used to match only against titles already shelved, so a
 * 600-row ratings export could import nearly nothing. These tests pin the
 * matching rules that replaced it — most importantly that a remake is never
 * silently substituted for the film the user actually rated.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cinetrack-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => dataDir },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  session: { defaultSession: { webRequest: { onBeforeRequest: () => undefined } } }
}))

let importImdbRatings: (p: string) => Promise<{ imported: number; skipped: number }>
let db: ReturnType<typeof import('../db').getDb>
let catalog: typeof import('../db/schema').catalog
let eq: typeof import('drizzle-orm').eq

function seed(rows: {
  title: string
  year: number | null
  imdbId?: string | null
}[]): void {
  for (const r of rows) {
    db.insert(catalog)
      .values({
        title: r.title,
        year: r.year,
        imdbId: r.imdbId ?? null,
        kind: 'movie'
      })
      .run()
  }
}

function csv(rows: Record<string, string>[]): string {
  const head = 'Const,Title,Year,Your Rating,Date Rated'
  const body = rows
    .map(r => [r.Const ?? '', r.Title, r.Year ?? '', r.Rating ?? '', r.Date ?? ''].join(','))
    .join('\n')
  return `${head}\n${body}\n`
}

function writeCsv(rows: Record<string, string>[]): string {
  const p = join(dataDir, `imdb-${Math.random().toString(36).slice(2)}.csv`)
  writeFileSync(p, csv(rows), 'utf-8')
  return p
}

beforeAll(async () => {
  const { initDatabase } = await import('../db')
  initDatabase()
  db = (await import('../db')).getDb()
  catalog = (await import('../db/schema')).catalog
  eq = (await import('drizzle-orm')).eq
  ;({ importImdbRatings } = await import('./imdb'))
})

afterAll(async () => {
  const { closeDatabase } = await import('../db')
  closeDatabase()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('importImdbRatings — matching', () => {
  it('matches on IMDb ID even when the title is absent locally', async () => {
    seed([{ title: 'Arrival', year: 2016, imdbId: 'tt2543164' }])
    const res = await importImdbRatings(
      writeCsv([{ Const: 'tt2543164', Title: 'Arrival', Year: '2016', Rating: '9' }])
    )
    expect(res.imported).toBe(1)
  })

  it('prefers the IMDb ID over a same-titled row with a different year', async () => {
    // Two rows share a title. Only the one whose IMDb ID matches the CSV may
    // be shelved, otherwise the user rates one film and gets the remake.
    seed([
      { title: 'The Thing', year: 1982, imdbId: 'tt0084787' },
      { title: 'The Thing', year: 2011, imdbId: 'tt1360886' }
    ])
    const res = await importImdbRatings(
      writeCsv([{ Const: 'tt1360886', Title: 'The Thing', Year: '2011', Rating: '7' }])
    )
    expect(res.imported).toBe(1)
    const match = db
      .select()
      .from(catalog)
      .where(eq(catalog.imdbId, 'tt1360886'))
      .get()
    expect(match?.year).toBe(2011)
  })

  it('does not shelve a remake when the year does not match', async () => {
    seed([{ title: 'Dune', year: 1984, imdbId: null }])
    // No IMDb ID in the row, and the only local "Dune" is a different film.
    const res = await importImdbRatings(
      writeCsv([{ Title: 'Dune', Year: '2021', Rating: '8' }])
    )
    expect(res.imported).toBe(0)
    expect(res.skipped).toBe(1)
  })

  it('matches on title + year when no IMDb ID is present', async () => {
    seed([{ title: 'Solaris', year: 1972, imdbId: null }])
    const res = await importImdbRatings(writeCsv([{ Title: 'Solaris', Year: '1972', Rating: '8' }]))
    expect(res.imported).toBe(1)
  })

  it('survives an unparseable Date Rated instead of aborting the import', async () => {
    seed([{ title: 'Stalker', year: 1979, imdbId: null }])
    const res = await importImdbRatings(
      writeCsv([
        { Title: 'Stalker', Year: '1979', Rating: '9', Date: 'not-a-date' },
        { Title: 'Solaris', Year: '1972', Rating: '9' }
      ])
    )
    expect(res.imported).toBe(2)
    expect(res.skipped).toBe(0)
  })

  it('handles quoted fields containing commas', async () => {
    seed([{ title: 'Crouching Tiger, Hidden Dragon', year: 2000, imdbId: null }])
    const p = join(dataDir, 'quoted.csv')
    writeFileSync(
      p,
      'Const,Title,Year,Your Rating,Date Rated\n,"Crouching Tiger, Hidden Dragon",2000,9,\n',
      'utf-8'
    )
    const res = await importImdbRatings(p)
    expect(res.imported).toBe(1)
  })

  it('returns an empty result for a header-only file', async () => {
    const res = await importImdbRatings(writeCsv([]))
    expect(res.imported).toBe(0)
    expect(res.skipped).toBe(0)
  })
})
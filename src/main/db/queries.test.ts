import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/*
 * Regression cover for library writes:
 *  - a bulk import's historical watchedAt must not become addedAt/updatedAt
 *  - completing a series must fill its episode progress
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cinetrack-queries-'))

vi.mock('electron', () => ({
  app: { getPath: () => dataDir },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  session: { defaultSession: { webRequest: { onBeforeRequest: () => undefined } } }
}))

let db: ReturnType<typeof import('./index').getDb>
let catalog: typeof import('./schema').catalog
let library: typeof import('./schema').library
let eq: typeof import('drizzle-orm').eq
let addToLibrary: typeof import('./queries').addToLibrary
let updateLibrary: typeof import('./queries').updateLibrary
let logEpisode: typeof import('./queries').logEpisode

beforeAll(async () => {
  const { initDatabase, getDb } = await import('./index')
  initDatabase()
  db = getDb()
  ;({ catalog, library } = await import('./schema'))
  ;({ eq } = await import('drizzle-orm'))
  ;({ addToLibrary, updateLibrary, logEpisode } = await import('./queries'))
})

afterAll(async () => {
  const { closeDatabase } = await import('./index')
  closeDatabase()
  rmSync(dataDir, { recursive: true, force: true })
})

function seedTitle(title: string, kind: 'movie' | 'series'): number {
  const row = db
    .insert(catalog)
    .values({ title, kind, year: 2020, runtimeMinutes: kind === 'series' ? 45 : 120 })
    .returning()
    .get()
  return row!.id
}

describe('addToLibrary', () => {
  it('keeps the import timestamp when a bulk row carries a historical watched date', () => {
    const id = seedTitle('Historical Import', 'movie')
    const before = Date.now()
    addToLibrary(id, 'completed', { watchedAt: '2019-03-04T00:00:00.000Z' })

    const row = db.select().from(library).where(eq(library.catalogId, id)).get()!
    expect(row.watchedAt).toBe('2019-03-04T00:00:00.000Z')
    expect(Date.parse(row.addedAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(row.updatedAt)).toBeGreaterThanOrEqual(before)
  })

  it('seeds a completed series to its full episode count', () => {
    const id = seedTitle('Completed Series', 'series')
    addToLibrary(id, 'completed', { episodesTotal: 24, seasonsTotal: 2 })

    const row = db.select().from(library).where(eq(library.catalogId, id)).get()!
    expect(row.episodesTotal).toBe(24)
    expect(row.episodesWatched).toBe(24)
  })
})

describe('updateLibrary', () => {
  it('fills episode progress when a series is marked completed later', () => {
    const id = seedTitle('Late Completion', 'series')
    addToLibrary(id, 'planned', { episodesTotal: 62 })

    const planned = db.select().from(library).where(eq(library.catalogId, id)).get()!
    expect(planned.episodesWatched).toBe(0)

    updateLibrary(planned.id, { status: 'completed' })

    const done = db.select().from(library).where(eq(library.id, planned.id)).get()!
    expect(done.status).toBe('completed')
    expect(done.episodesWatched).toBe(62)
    expect(done.watchedAt).toBeTruthy()
  })

  it('does not leave a partially logged series at 3/62 when marked completed', () => {
    const id = seedTitle('Partial To Complete', 'series')
    addToLibrary(id, 'watching', { episodesTotal: 62 })
    const row = db.select().from(library).where(eq(library.catalogId, id)).get()!

    logEpisode(row.id, 1, 1)
    logEpisode(row.id, 1, 2)
    logEpisode(row.id, 1, 3)

    updateLibrary(row.id, { status: 'completed' })

    const done = db.select().from(library).where(eq(library.id, row.id)).get()!
    expect(done.episodesWatched).toBe(62)
  })
})

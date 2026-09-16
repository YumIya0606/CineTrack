import Database from 'better-sqlite3'
import { join } from 'path'

const dbPath = join(process.env['APPDATA'] ?? '', 'CineTrack/data/cinetrack.db')
const db = new Database(dbPath, { readonly: true })

const count = db.prepare('SELECT COUNT(*) AS c FROM catalog').get() as { c: number }
console.log('catalog rows:', count.c)

const tables = (
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[]
).map(r => r.name)
console.log('tables:', tables.join(', '))

if (tables.includes('catalog_fts')) {
  const fts = db
    .prepare("SELECT title FROM catalog_fts WHERE catalog_fts MATCH 'dark*' LIMIT 5")
    .all() as { title: string }[]
  console.log('FTS "dark*":', fts.map(r => r.title).join(' | ') || '(none)')
} else {
  console.log('catalog_fts: NOT YET CREATED (will build on next boot)')
}

const genres = db.prepare('SELECT DISTINCT genres FROM catalog LIMIT 3').all() as {
  genres: string
}[]
console.log('sample genres:', JSON.stringify(genres))

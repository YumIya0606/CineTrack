// Screenshot harness — boots the real app against a throwaway profile seeded
// with demo data, then captures every view to ./screenshots.
//
//   npx electron scripts/screenshot.mjs
//
// The profile lives in .screenshot-profile/ (gitignored) so your real library
// is never touched, and no API key is read or written.
import { app, BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

// Must happen before the app's main module reads any path.
app.setPath('userData', join(ROOT, '.screenshot-profile'))

// Only poster paths verified to resolve on image.tmdb.org *and* confirmed to
// be the right film. Anything unverified gets no poster so the app renders its
// generated fallback rather than showing the wrong title's artwork.
const CATALOG = [
  [1,  'The Shawshank Redemption', 'movie', 1994, null, 'Drama',                    142, 9.3, '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg'],
  [2,  'The Godfather',            'movie', 1972, null, 'Crime|Drama',              175, 9.2, '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg'],
  [3,  'Parasite',                 'movie', 2019, null, 'Comedy|Drama|Thriller',    132, 8.5, '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg'],
  [4,  'Inception',                'movie', 2010, null, 'Action|Sci-Fi',            148, 8.4, '/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg'],
  [5,  'Interstellar',             'movie', 2014, null, 'Adventure|Drama|Sci-Fi',   169, 8.4, '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'],
  [6,  'Breaking Bad',             'series',2008, 2013, 'Crime|Drama',               45, 9.5, '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg'],
  [7,  'Succession',               'series',2018, 2023, 'Drama',                     60, 8.9, null],
  [8,  'Severance',                'series',2022, null, 'Drama|Sci-Fi',              45, 8.7, null],
  [9,  'The Bear',                 'series',2022, null, 'Comedy|Drama',              28, 8.6, '/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg'],
  [10, 'Dark',                     'series',2017, 2020, 'Crime|Drama|Mystery',       55, 8.7, null],
  [11, 'Dune: Part Two',           'movie', 2024, null, 'Adventure|Sci-Fi',         166, 8.5, '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg'],
  [12, 'Past Lives',               'movie', 2023, null, 'Drama|Romance',            106, 7.8, '/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg'],
  [13, 'Ripley',                   'series',2024, null, 'Crime|Drama|Thriller',      60, 8.1, null],
  [14, 'The Leftovers',            'series',2014, 2017, 'Drama|Mystery',             55, 8.5, null],
  [15, 'Chernobyl',                'series',2019, null, 'Drama|History|Thriller',     60, 9.3, null]
]

const LIBRARY = [
  // catalogId, status, rating, watchedAt, epsWatched, epsTotal, seasons, plays, override, epsRuntime
  [1,  'completed',  10, '2023-02-11T12:00:00Z',  0,  null, null, 1, 1, null],
  [2,  'completed',  9,  '2023-03-02T12:00:00Z',  0,  null, null, 1, 1, null],
  [3,  'completed',  10, '2023-05-19T12:00:00Z',  0,  null, null, 1, 1, null],
  [4,  'completed',  9,  '2023-08-01T12:00:00Z',  0,  null, null, 1, 1, null],
  [5,  'completed',  9,  '2024-01-15T12:00:00Z',  0,  null, null, 1, 1, null],
  [11, 'completed',  8,  '2024-04-02T12:00:00Z',  0,  null, null, 1, 1, null],
  [12, 'completed',  8,  '2024-06-20T12:00:00Z',  0,  null, null, 1, 1, null],
  [7,  'rewatching', 10, '2024-09-24T12:00:00Z', 39, 39,   4,    2, 1, null],
  [8,  'watching',   9,  null,                    9, 19,   2,    1, 0, null],
  [9,  'watching',   9,  null,                   14, 32,   3,    1, 0, null],
  [15, 'watching',   10, null,                    1, 5,    1,    1, 0, null],
  [14, 'dropped',    6,  null,                    5, 28,   3,    1, 0, null],
  [6,  'completed',  10, '2013-09-29T12:00:00Z', 62, 62,   5,    1, 0, null],
  [10, 'completed',  10, '2020-12-30T12:00:00Z', 26, 26,   3,    1, 0, null],
  [13, 'planned',    null,null,                   0, 8,    1,    1, 0, null]
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

function seedSql() {
  const cat = CATALOG.map(
    ([id, title, kind, year, endYear, genres, runtime, vote, poster]) =>
      `INSERT OR REPLACE INTO catalog
        (id, title, kind, year, end_year, genres, runtime_minutes, vote_average, vote_count, overview, poster_path, popularity)
       VALUES (${id}, ${q(title)}, ${q(kind)}, ${year}, ${endYear ?? 'NULL'}, ${q(genres)}, ${runtime}, ${vote}, 1000,
        ${q('Demo entry used for documentation screenshots.')}, ${poster ? q(poster) : 'NULL'}, ${100 - id});`
  ).join('\n')

  const lib = LIBRARY.map(
    ([cid, status, rating, watched, ew, et, seasons, plays, override, epsRuntime]) =>
      `INSERT OR REPLACE INTO library
        (catalog_id, status, rating, added_at, updated_at, watched_at,
         episodes_watched, episodes_total, seasons_total, play_count, status_override, episodes_runtime)
       VALUES (${cid}, ${q(status)}, ${rating === null ? 'NULL' : rating},
        '2024-01-01T12:00:00Z', '2026-05-01T12:00:00Z', ${watched ? q(watched) : 'NULL'},
        ${ew}, ${et ?? 'NULL'}, ${seasons ?? 'NULL'}, ${plays}, ${override}, ${epsRuntime ?? 'NULL'});`
  ).join('\n')

  return `${cat}\n${lib}`
}

const q = v => `'${String(v).replace(/'/g, "''")}'`

async function run() {
  // Boot the real app: this runs migrations and seeds the status palette.
  await import('../out/main/index.js')
  await app.whenReady()

  // Wait for the app's own window.
  let win = null
  for (let i = 0; i < 60 && !win; i++) {
    await sleep(250)
    win = BrowserWindow.getAllWindows()[0] ?? null
  }
  if (!win) throw new Error('app window never appeared')

  // The DB now exists — inject demo rows, then reload so the renderer picks
  // them up through its normal boot path.
  const dbPath = join(app.getPath('userData'), 'data', 'cinetrack.db')
  if (!existsSync(dbPath)) throw new Error('db missing at ' + dbPath)
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  db.exec(seedSql())
  db.close()

  await win.webContents.reload()
  await sleep(3000)

  // Devtools steal focus and appear in captures on some setups.
  win.webContents.closeDevTools()
  win.setSize(1440, 900)
  await sleep(800)

  const shoot = async name => {
    // Posters are lazily loaded from the TMDB CDN; capturing too early yields
    // blank tiles that look like broken artwork in the docs.
    await sleep(2000)
    const img = await win.webContents.capturePage()
    writeFileSync(join(OUT, `${name}.png`), img.toPNG())
    console.log('captured', name)
  }

  // webContents has no synthetic keyboard helper; send raw input events.
  const pressEscape = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await sleep(600)
  }

  const clickTab = async label => {
    const ok = await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim() === ${JSON.stringify(label)});
      if (b) { b.click(); return true } return false
    })()`)
    if (!ok) console.warn('tab not found:', label)
    await sleep(900)
  }

  await shoot('01-home')
  await clickTab('Board');      await shoot('02-board')
  await clickTab('Board')       // ensure focus settled
  await win.webContents.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.includes('Breaking Bad'));
    if (b) b.click();
    return !!b;
  })()`)
  await shoot('03-detail')
  await pressEscape()

  await clickTab('Discover');   await shoot('04-discover')
  await clickTab('Library');    await shoot('05-library')
  await clickTab('Watchlist');  await shoot('06-watchlist')
  await clickTab('Lists');      await shoot('07-lists')
  await clickTab('Stats');      await shoot('08-stats')

  // Settings → Statuses tab
  await win.webContents.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.title === 'Settings');
    if (b) b.click(); return !!b;
  })()`)
  await sleep(900)
  await win.webContents.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Statuses');
    if (b) b.click(); return !!b;
  })()`)
  await shoot('09-settings-statuses')
  await pressEscape()
  await sleep(400)

  // Command palette
  await clickTab('Home')
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyK',ctrlKey:true,bubbles:true}))`
  )
  await shoot('10-command-palette')

  // Bulk add modal
  await pressEscape()
  await sleep(500)
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',bubbles:true}))`
  )
  await shoot('11-bulk-add')

  console.log('done ->', OUT)
  app.exit(0)
}

run().catch(err => {
  console.error(err)
  app.exit(1)
})
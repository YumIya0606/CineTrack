// Verification harness — boots the real app against a throwaway profile and
// walks every surface, capturing screenshots AND collecting runtime errors.
//
//   npx electron scripts/screenshot.mjs
//
// Why this is more than a screenshotter: a screenshot shows what looks wrong,
// but most real defects in an Electron app are *silent* — a rejected promise, a
// missing IPC channel, a provider returning a shape nobody handles. Those never
// appear in a picture. So this also records every console error/warning, every
// failed request, and every unhandled rejection, and prints them at the end.
//
// Keys: read at runtime from the real profile, read-only, never written to the
// repo and never printed. Without a TMDB key every live surface renders empty,
// which makes a "visual audit" meaningless.

import { app, BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const WIDTH = Number(process.env.SHOT_W || 1600)
const HEIGHT = Number(process.env.SHOT_H || 1000)

// Must happen before the app's main module reads any path.
app.setPath('userData', join(ROOT, '.screenshot-profile'))

const sleep = ms => new Promise(r => setTimeout(r, ms))

/* ---------- Seed data ---------- */

// Only poster paths verified to resolve on image.tmdb.org *and* confirmed to
// be the right film. Anything unverified gets no poster so the app renders its
// generated fallback rather than showing the wrong title's artwork.
//
// The TMDB and IMDb ids are REAL. An earlier version invented them
// (100000 + n), which made every live fetch resolve to some unrelated title -
// Breaking Bad's panel came back with two strangers in the cast. Any harness
// that verifies live features has to point at real ids or it verifies nothing.
const CATALOG = [
  // id, title, kind, year, endYear, genres, runtime, rating, poster, tmdbId, imdbId
  [1,  'The Shawshank Redemption', 'movie', 1994, null, 'Drama',                    142, 9.3, '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', 278,   'tt0111161'],
  [2,  'The Godfather',            'movie', 1972, null, 'Crime|Drama',              175, 9.2, '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', 238,   'tt0068646'],
  [3,  'Parasite',                 'movie', 2019, null, 'Comedy|Drama|Thriller',    132, 8.5, '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', 496243,'tt6751668'],
  [4,  'Inception',                'movie', 2010, null, 'Action|Sci-Fi',            148, 8.4, '/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg', 27205, 'tt1375666'],
  [5,  'Interstellar',             'movie', 2014, null, 'Adventure|Drama|Sci-Fi',   169, 8.4, '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 157336,'tt0816692'],
  [6,  'Breaking Bad',             'series',2008, 2013, 'Crime|Drama',               47, 9.5, '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', 1396,  'tt0903747'],
  [7,  'Succession',               'series',2018, 2023, 'Drama',                     60, 8.9, null,                            76331, 'tt7660850'],
  [8,  'Severance',                'series',2022, null, 'Drama|Sci-Fi',              50, 8.7, null,                            95396, 'tt11280740'],
  [9,  'The Bear',                 'series',2022, null, 'Comedy|Drama',              32, 8.6, '/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg', 136315,'tt14452776'],
  [10, 'Dark',                     'series',2017, 2020, 'Crime|Drama|Mystery',       53, 8.7, null,                            70523, 'tt5753856'],
  [11, 'Dune: Part Two',           'movie', 2024, null, 'Adventure|Sci-Fi',         166, 8.5, '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', 693134,'tt15239678'],
  [12, 'Past Lives',               'movie', 2023, null, 'Drama|Romance',            106, 7.8, '/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg', 666277,'tt7634402'],
  [13, 'Ripley',                   'series',2024, null, 'Crime|Drama|Thriller',      60, 8.1, null,                            106379,'tt16573224'],
  [14, 'The Leftovers',            'series',2014, 2017, 'Drama|Mystery',             55, 8.5, null,                            26968, 'tt2697578'],
  [15, 'Chernobyl',                'series',2019, null, 'Drama|History|Thriller',     60, 9.3, null,                            87108, 'tt7366338']
]

// catalogId, status, rating, watchedAt, episodesWatched, episodesTotal
const LIBRARY = [
  [1,  'watching',   9,  '2026-09-02', 0, null],
  [2,  'completed', 10,  '2026-08-14', 0, null],
  [3,  'completed',  9,  '2026-07-30', 0, null],
  [4,  'watching',   7,  '2026-09-10', 0, null],
  [5,  'completed',  8,  '2026-06-21', 0, null],
  [6,  'watching',   9,  '2026-09-12', 41, 62],
  [7,  'completed', 10,  '2026-05-18', 39, 39],
  [8,  'watching',   8,  '2026-09-08',  9, 19],
  [9,  'watching',   7,  '2026-09-11', 28, 38],
  [10, 'completed',  9,  '2026-04-02', 26, 26],
  [11, 'planned',    null, null,       0, null],
  [12, 'planned',    null, null,       0, null]
]

const q = v => `'${String(v).replace(/'/g, "''")}'`

function seedSql() {
  const now = new Date().toISOString()
  const parts = []
  for (const [id, title, kind, year, endYear, genres, runtime, rating, poster, tmdbId, imdbId] of CATALOG) {
    parts.push(
      `INSERT OR IGNORE INTO catalog
        (id, tmdb_id, imdb_id, title, original_title, kind, year, end_year, genres,
         runtime_minutes, vote_average, vote_count, overview, poster_path, backdrop_path,
         popularity)
       VALUES (${id}, ${tmdbId}, ${q(imdbId)}, ${q(title)},
        ${q(title)}, ${q(kind)}, ${year}, ${endYear == null ? 'NULL' : endYear}, ${q(genres)},
        ${runtime}, ${rating}, 1000, ${q('Demo entry used for documentation screenshots.')},
        ${poster ? q(poster) : 'NULL'}, NULL, 100.0)`
    )
  }
  for (const [catalogId, status, rating, watchedAt, epWatched, epTotal] of LIBRARY) {
    // episodes_watched/total live on the library row, not in episode_log, and
    // drive both the progress bar and the derived status. Seeding them is what
    // makes a mid-series title actually look mid-series.
    parts.push(
      `INSERT OR IGNORE INTO library
         (catalog_id, status, rating, watched_at, added_at, updated_at,
          episodes_watched, episodes_total, episodes_runtime)
       VALUES (${catalogId}, ${q(status)}, ${rating == null ? 'NULL' : rating},
        ${watchedAt ? q(watchedAt) : 'NULL'}, ${q(now)}, ${q(now)},
        ${epWatched}, ${epTotal == null ? 'NULL' : epTotal}, ${epTotal == null ? 'NULL' : 45})`
    )
  }

  return parts
}

/**
 * Copies the TMDB and SubDL keys out of the real profile so live features
 * actually render. Read-only; the repo never sees these values.
 */
async function readRealKeys() {
  const realDb = join(process.env.APPDATA || '', 'CineTrack', 'data', 'cinetrack.db')
  if (!existsSync(realDb)) return {}
  try {
    // This file is ESM, so `require` is not defined - a bare require() here
    // silently yielded {} and every live surface rendered empty.
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(realDb, { readonly: true, fileMustExist: true })
    const want = ['tmdb.readToken', 'tmdb.apiKey', 'subtitles.subdlKey', 'subtitles.language']
    const out = {}
    for (const key of want) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      if (row) out[key] = row.value
    }
    db.close()
    return out
  } catch (err) {
    console.warn('could not read live keys:', err.message)
    return {}
  }
}

/* ---------- Run ---------- */

async function run() {
  await import('../out/main/index.js')
  await app.whenReady()

  let win = null
  for (let i = 0; i < 60 && !win; i++) {
    await sleep(250)
    win = BrowserWindow.getAllWindows()[0] ?? null
  }
  if (!win) throw new Error('app window never appeared')

  const dbPath = join(app.getPath('userData'), 'data', 'cinetrack.db')
  if (!existsSync(dbPath)) throw new Error('db missing at ' + dbPath)
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  const statements = seedSql()
  for (const s of statements) {
    // One bad statement aborted the entire seed with a parse error that pointed
    // nowhere near the real cause, so run them one at a time.
    try {
      db.exec(s)
    } catch (err) {
      console.warn('seed failed:', err.message, '\n  ', s)
    }
  }

  // Live keys, so TMDB-backed surfaces are actually populated.
  const keys = await readRealKeys()
  const seedKey = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  for (const [k, v] of Object.entries(keys)) seedKey.run(k, v)
  db.close()
  console.log(
    keys['tmdb.readToken'] ? 'live keys: yes (TMDB + subtitles)' : 'live keys: NONE — live surfaces will be empty'
  )

  /* ---------- Collect runtime errors ---------- */
  const problems = []
  const record = (kind, text) => {
    const t = String(text)
    // Provider ad-tech noise is not our problem and drowns the signal.
    if (/googletagmanager|google-analytics|cloudflareinsights|ERR_BLOCKED_BY_CLIENT|gstatic/i.test(t)) return
    if (/Autofill\.|cast_sender|eureka\/clank/i.test(t)) return
    problems.push(`[${kind}] ${t}`)
  }

  // Electron 37 changed this to a single details object; 35 still uses the
  // positional form. Handle both, because a handler that silently receives
  // undefined reports "no problems" while the renderer is on fire.
  win.webContents.on('console-message', (...args) => {
    const d = args[0]
    if (d && typeof d === 'object' && 'message' in d) {
      if (d.level === 'error' || d.level === 'warning') {
        record('console', `${d.message}  (${d.sourceId}:${d.lineNumber})`)
      }
      return
    }
    const level = args[1]
    const message = args[2]
    const line = args[3]
    const sourceId = args[4]
    if (level >= 2) record('console', `${message}  (${sourceId}:${line})`)
  })
  win.webContents.on('preload-error', (_e, p, err) => record('preload', `${p}: ${err.message}`))
  win.webContents.on('render-process-gone', (_e, d) => record('crash', JSON.stringify(d)))
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    record('load', `${code} ${desc} ${url}`)
  )
  const session = win.webContents.session
  session.webRequest.onCompleted({ urls: ['*://*/*'] }, details => {
    if (details.statusCode >= 400 && details.resourceType === 'xhr') {
      record('http', `${details.statusCode} ${details.url.slice(0, 140)}`)
    }
  })
  session.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, details => {
    record('net', `${details.error} ${details.url.slice(0, 140)}`)
  })

  await win.webContents.executeJavaScript(`
    window.__problems = [];
    window.addEventListener('unhandledrejection', e =>
      window.__problems.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
    window.addEventListener('error', e =>
      window.__problems.push('window error: ' + e.message));
    true;
  `)

  await win.webContents.reload()
  await sleep(3500)

  win.webContents.closeDevTools()
  win.setSize(WIDTH, HEIGHT)
  await sleep(800)

  /**
 * True when a capture is effectively a single flat colour.
 *
 * capturePage() intermittently returns a blank frame when the compositor has
 * not painted. That produced a whole run of empty PNGs which looked exactly
 * like an app crash, and nearly sent me "fixing" a bug that did not exist.
 * A capture that carries no information must be retried, never saved.
 */
function isBlank(img) {
  if (!img || img.isEmpty()) return true
  const size = img.getSize()
  const bmp = img.toBitmap()
  const stride = size.width * 4
  const first = [bmp[0], bmp[1], bmp[2], bmp[3]].join(',')
  let different = 0
  // Sample a sparse grid; enough to tell "rendered" from "one flat colour".
  for (let y = 0; y < size.height; y += Math.max(1, Math.floor(size.height / 40))) {
    for (let x = 0; x < size.width; x += Math.max(1, Math.floor(size.width / 60))) {
      const i = y * stride + x * 4
      if ([bmp[i], bmp[i + 1], bmp[i + 2], bmp[i + 3]].join(',') !== first) different++
    }
  }
  return different < 12
}

const shoot = async (name, wait = 4000) => {
    await sleep(wait)
    const state = await js(`(() => {
      const scroller = document.querySelector('.overflow-y-auto, main, #root > div');
      return {
        text: (document.body.innerText || '').trim().length,
        nodes: document.querySelectorAll('#root *').length,
        scrolled: scroller ? Math.round(scroller.scrollTop) : -1
      };
    })()`)

    let img = await win.webContents.capturePage()
    let attempts = 1
    while (isBlank(img) && attempts < 5) {
      attempts++
      // Nudge the compositor, then try again.
      win.webContents.invalidate()
      win.showInactive()
      win.focus()
      await sleep(900)
      img = await win.webContents.capturePage()
    }
    if (isBlank(img)) {
      console.warn('  ! STILL BLANK:', name, JSON.stringify(state))
    }
    writeFileSync(join(OUT, `${name}.png`), img.toPNG())
    console.log('captured', name, attempts > 1 ? `(retry x${attempts - 1})` : '', JSON.stringify(state))
  }

  const js = code => win.webContents.executeJavaScript(code)

  const pressEscape = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await sleep(700)
  }

  const clickTab = async label => {
    const ok = await js(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim() === ${JSON.stringify(label)});
      if (b) { b.click(); return true } return false
    })()`)
    if (!ok) console.warn('  ! tab not found:', label)
    await sleep(1000)
  }

  const clickText = async (text, wait = 1200) => {
    const ok = await js(`(() => {
      const b = [...document.querySelectorAll('button, a, [role="button"]')]
        .find(x => x.textContent.trim().includes(${JSON.stringify(text)}));
      if (b) { b.click(); return true } return false
    })()`)
    if (!ok) console.warn('  ! control not found:', text)
    await sleep(wait)
    return ok
  }

  const openSettings = async () => {
    await js(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.title === 'Settings');
      if (b) b.click(); return !!b;
    })()`)
    await sleep(1000)
  }

  const openDetail = async title => {
  // Must pick the *innermost* match. Board rows put the title inside a <button>,
    // but their wrapper <div> carries the same textContent, and clicking that
    // does nothing - which silently produced "detail" screenshots of the Board.
    const ok = await js(`(() => {
      const all = [...document.querySelectorAll('button, [role="button"]')]
        .filter(x => (x.textContent || '').trim().startsWith(${JSON.stringify(title)}));
      if (!all.length) return false;
      // The shortest match is the deepest element.
      all.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
      all[0].click();
      return true;
    })()`)
    if (!ok) {
      const near = await js(`(() => {
        return [...document.querySelectorAll('button')]
          .map(b => (b.textContent || '').trim().slice(0, 26))
          .filter(t => /break|paras/i.test(t)).slice(0, 5)
      })()`)
      console.warn('  ! title not clickable:', title, JSON.stringify(near))
    }
    await sleep(3000)
    return ok
  }

/* ---------- Walk every surface ---------- */

console.log('\n--- views ---')
await shoot('01-home', 5000)
await clickTab('Board');      await shoot('02-board')
await clickTab('Discover');   await shoot('03-discover', 8000)
await clickTab('Library');    await shoot('04-library')
await clickTab('Watchlist');  await shoot('05-watchlist')
await clickTab('Lists');      await shoot('06-lists')
await clickTab('Stats');      await shoot('07-stats', 5000)

/** Closes whatever overlay is open and lands on a known view. */
const goHome = async view => {
  for (let i = 0; i < 3; i++) await pressEscape()
  await sleep(400)
  await clickTab(view)
}

console.log('\n--- detail panels ---')
await goHome('Board')
await openDetail('Breaking Bad'); await shoot('08-detail-series', 7000)

console.log('\n--- person drill-down from cast ---')
const castOpened = await js(`(() => {
  const b = [...document.querySelectorAll('button')]
    .find(x => (x.title || '').startsWith('More about'));
  if (b) { b.click(); return true } return false;
})()`)
if (castOpened) {
  await shoot('09-person', 8000)
  await pressEscape()
} else {
  console.warn('  ! no cast buttons in the detail panel')
  await shoot('09-person-missing', 500)
}
await pressEscape()

await goHome('Board')
await openDetail('Parasite'); await shoot('10-detail-movie', 7000)

console.log('\n--- collection link ---')
const collOpened = await js(`(() => {
  const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('Part of a collection'));
  if (b) { b.click(); return true } return false;
})()`)
if (collOpened) {
  await shoot('11-collection', 8000)
  await pressEscape()
} else {
  console.warn('  ! no collection link (title may not belong to a franchise)')
}
await pressEscape()

console.log('\n--- settings tabs ---')
for (const tab of ['Catalog', 'Statuses', 'Appearance', 'Playback', 'Data']) {
  await goHome('Home')
  await openSettings()
  await clickText(tab, 1200)
  await shoot(`12-settings-${tab.toLowerCase()}`, 2500)
  await pressEscape()
}

console.log('\n--- command palette + bulk add ---')
await goHome('Home')
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyK',ctrlKey:true,bubbles:true}))`)
await shoot('13-command-palette', 2500)
await pressEscape()
await sleep(500)
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',bubbles:true}))`)
await shoot('14-bulk-add', 2500)
await pressEscape()

console.log('\n--- subtitle picker (live provider round trip) ---')
await goHome('Board')
await openDetail('Breaking Bad')
const ccOpened = await clickText('Watch free', 6000)
const ccClicked = await js(`(() => {
  const b = [...document.querySelectorAll('button')]
    .find(x => (x.getAttribute('title') || '').match(/subtitle|CC|caption/i));
  if (b) { b.click(); return true } return false;
})()`)
if (ccOpened && ccClicked) {
  await shoot('15-subtitle-picker', 14000)
} else {
  console.warn('  ! player or CC control not reachable', { ccOpened, ccClicked })
}
await pressEscape()
await pressEscape()

  /* ---------- Report ---------- */
  const rendererProblems = await js(`(window.__problems || []).slice(0, 40)`)

  console.log('\n================ RUNTIME PROBLEMS ================')
  if (!problems.length && !rendererProblems.length) {
    console.log('none')
  } else {
    for (const p of problems) console.log(p)
    for (const p of rendererProblems) console.log('[renderer]', p)
  }
  console.log('===================================================')
  console.log('screens ->', OUT)
  app.exit(0)
}

run().catch(err => {
  console.error(err)
  app.exit(1)
})
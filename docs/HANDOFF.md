# CineTrack — Developer Handoff

> Living document for continuing work on CineTrack. Read this first.
> Last updated: see git log. Owner: YumIya0606.

---

## 1. What CineTrack is

An Electron desktop movie & series tracker. Private, local-first (single SQLite
file), optional live TMDB connection, optional free streaming via third-party
embeds.

**Stack:** Electron 35 · electron-vite · React 19 · TypeScript 5.8 · Tailwind v4 ·
Framer Motion · Zustand 5 · better-sqlite3 13 + Drizzle ORM · Recharts · Vitest.

**Repo:** `https://github.com/YumIya0606/CineTrack` (branch `main`)

---

## 2. Architecture map

```
src/
├── main/                     Electron main process
│   ├── index.ts              Boot: db → IPC → notifications → adblock → window
│   ├── window.ts             BrowserWindow, popup/nav guard (stream-guard)
│   ├── adblock.ts            Ghostery blocker, scoped to persist:player ONLY
│   ├── backup.ts             AES-256-GCM .cbk export/restore + auto cloud backup
│   ├── stream-guard.ts       Pure helper: isStreamFrame(url) — unit tested
│   ├── notifications.ts      Hourly new-episode sweep
│   ├── seed-credentials.ts   Bundles a fallback TMDB credential
│   ├── db/
│   │   ├── index.ts          Connection, WAL pragmas, migrations, bootstrap
│   │   ├── schema.ts         Drizzle tables
│   │   ├── queries.ts        Catalog/library/stats queries
│   │   ├── statuses.ts       Status palette CRUD (NEW)
│   │   ├── board.ts          Filterable board query (NEW)
│   │   ├── bulk.ts           Bulk add + runtime/episode enrichment
│   │   ├── collections.ts    User shelves
│   │   ├── viewings.ts       Rewatch log
│   │   └── seed.ts           FTS triggers + status palette defaults
│   ├── ipc/
│   │   ├── index.ts          All ipcMain.handle registrations
│   │   └── imdb.ts           IMDb CSV import (transactional)
│   └── tmdb/client.ts        TMDB API client + normalisation
├── preload/index.ts          contextBridge surface (must mirror lib/api.ts)
├── shared/
│   ├── types.ts              All shared types
│   ├── ipc.ts                IPC channel-name constants
│   ├── utils.ts              Pure helpers + unit tests
│   ├── status.ts             Status derivation logic (NEW)
│   └── *.test.ts             Vitest suites
└── renderer/src/
    ├── App.tsx               Routing, keyboard, boot, scroll reset
    ├── store/index.ts        Zustand: UI, Data, Collections, Notifications, Statuses
    ├── lib/api.ts            Typed mirror of the preload bridge
    ├── views/                Home, Discover, StatusBoard, Library, Watchlist, Lists, Stats
    └── components/           TopBar, DetailPanel, WatchModal, BulkAddModal, StatusPill, …
```

**Invariant:** every new IPC channel must be added in three places —
`shared/ipc.ts`, `preload/index.ts`, `renderer/src/lib/api.ts`, then registered in
`main/ipc/index.ts`.

---

## 3. Status system (shipped)

Statuses are **user-definable**, not a hardcoded enum.

**Data model** (migration `0002_right_unicorn.sql`):
- `status_defs` — key, label, color, position, `counts_toward_watch_time`,
  `derivable`, `is_system`
- `library.status_override` — pins a manual choice against the progress engine
- `library.episodes_runtime` — per-series episode length override

**Derivation rule** (`shared/status.ts`):

| Progress (series, total known) | Auto status |
|---|---|
| 0 episodes | `planned` |
| 1 … N-1 | `watching` |
| All N | `completed` (+ stamps `watched_at`) |

- Movies, and series with unknown total, are fully manual.
- A manual pick sets `status_override = true` and always wins. UI shows an
  `auto` badge when the engine owns the status.
- Watch time only counts statuses flagged `counts_toward_watch_time`.
  This is read at query time in `queries.ts:watchedMinutesSql()`.

**Watch-time maths:**
- Movie → `runtime_minutes`
- Series → `episodes × COALESCE(episodes_runtime, runtime_minutes)`

If TMDB publishes no episode runtime, the user types one in the Detail panel;
without it a completed series contributes **0** minutes.

---

## 4. Current feature inventory

**Shipped:** status palette + board, bulk add (search + paste-list), accurate
watch time, IMDb CSV import, collections/shelves, encrypted backup + auto cloud
backup to a synced folder, free streaming player with ad blocking, stats
dashboard, share card, new-episode notifications, discover with real TMDB filters,
command palette, keyboard shortcuts, dark gold-on-charcoal cinematic UI.

---

## 5. Open work — the roadmap

### Phase A — IMDb ID plumbing ✅ *(do first, unblocks subtitles)*

**Why:** every subtitle API keys on IMDb ID. `tmdbToCatalog` currently hardcodes
`imdbId: null` (`main/tmdb/client.ts:124`), so **subtitle lookup is impossible today**.

- [x] `detailsTmdb()` → append `external_ids` to `append_to_response`
- [x] `tmdbToCatalog()` → read `external_ids.imdb_id`
- [x] `ensureCatalogItem()` → persist `imdbId` (already supported; verify)
- [x] Backfill existing library rows (`backfillRuntimes` → also fill IMDb IDs)
- [x] Surface "recalculate" button label to mention IMDb too

### Phase B — Subtitle engine

**Architecture decision (verified empirically, do not re-litigate):**

The player is a `<webview>` on third-party embeds. Verified by probing:

```
vidsrc.to  → top document: 0 <video>, 5 iframes
  └─ vsembed.ru/embed/movie/603
       └─ stellarconductornexus.com/embed/movie/603 → 0 <video>, 0 iframes
```

Chrome DevTools Protocol attach: **OK**, but after a play attempt the page served
empty content and **0 media requests** were observed. Therefore:

- ❌ Cannot inject a native `<track>`
- ❌ Cannot read `currentTime` for exact sync
- ❌ Cannot extract the stream URL
- ✅ **Can** render our own overlay layer above the webview

So subtitles = fetch + parse + render overlay, driven by wall-clock, with
**one-click sync** as the accuracy mechanism (user pins a cue they recognise to
"now"; everything realigns). This is *more* reliable than relying on the
provider's player because the user calibrates it.

**Verified subtitle sources** (tested live, 2026-10):

| Source | Auth | Limits | Status |
|---|---|---|---|
| `subtitles.website` | none for search | 10/day guest, 50 registered, 1000 VIP | ✅ works |
| OpenSubtitles v1 (`api.opensubtitles.com/api/v1`) | `Api-Key` header + optional Bearer | 5/day anon, 20/day free account | ✅ docs verified, needs user key |
| Podnapisi | — | — | ❌ **dead** (DNS fail / 404) |

- [x] `main/subtitles/client.ts` — provider adapters, timeouts, SRT+VTT parse
- [x] Local cache under `%APPDATA%/CineTrack/data/subtitles/`
- [x] IPC: `SUBTITLES_SEARCH`, `SUBTITLES_LOAD`, `SUBTITLES_CLEAR_CACHE`
- [x] Settings → Playback: language (default **English**), source, OpenSubtitles key
- [x] `WatchModal`: CC button, candidate picker (best match by year + runtime)
- [x] Overlay renderer + per-title offset slider (persisted)
- [x] **One-click sync** — press `S`, current cue is pinned to "now"
- [x] Remember preferred language globally

### Phase C — TMDB feature gaps

See `docs/TMDB-ENDPOINT-MAP.md` for the full audit. Summary of unused endpoints:
person pages, collections/franchises, `trending/{day,media}`, `top_rated`,
`now_playing`, `upcoming`, `tv/day`, `tv/week`, `images`, `episode_groups`,
`search/collection`, `search/person`, `find/{imdb_id}`.

### Phase D — UI polish

Standing list; see `docs/UI-AUDIT.md`.

---

## 6. Commands

```bash
npm run dev            # hot-reload dev server
npm run build          # type-check + bundle
npm run package        # Windows .exe installer
npm test               # Vitest (48 tests currently)
npm run typecheck      # tsc for node + web projects
npm run lint
npm run db:generate    # new migration after editing schema.ts
npm run screenshot     # boots a throwaway profile, captures every view
```

**Requires Node 22+.** `better-sqlite3@13` ships prebuilds and declares
`engines.node >= 22`.

### Gotcha: `npm ci` may try to compile better-sqlite3

It ships a `binding.gyp`, so npm runs `node-gyp rebuild` — which fails on modern
Windows (Visual Studio 18 is unrecognised to node-gyp 9). Use:

```bash
npm ci --ignore-scripts
node node_modules/electron/install.js
```

This is what CI does. Verified working.

---

## 7. Testing conventions

- Pure logic → `*.test.ts` next to the source (`shared/utils.test.ts`,
  `shared/status.test.ts`, `main/db/stats-sql.test.ts`, `main/stream-guard.test.ts`)
- `stats-sql.test.ts` mirrors the real SQL byte-for-byte against in-memory SQLite,
  because TypeScript cannot validate raw SQL. **If you change SQL in
  `queries.ts`, update that test.**
- Main-process functions that `import electron` cannot be imported in tests —
  test the SQL/algorithm separately.

---

## 8. Hard-won gotchas — please don't reintroduce

1. **Never commit `cinetrack.key.json`** — gitignored. User's TMDB key must stay local.
2. **`capturePage()` fires before lazily-loaded CDN images paint.** Wait ≥4s in
   the screenshot harness or screenshots show blank posters that look like a bug.
3. **better-sqlite3 binds `?1`/`?2` by NAME** — pass `{1: term, 2: limit}`, not
   positional, or it throws `RangeError`. This silently broke all search once.
4. **WAL mode**: reading the raw DB file misses uncheckpointed pages. Call
   `wal_checkpoint(TRUNCATE)` before snapshotting in `backup.ts`.
5. **`db.transaction(fn)` in Drizzle executes immediately** and returns the
   callback result — it is NOT better-sqlite3's "returns a callable" form.
6. **The close handler must allow quit** — `window.ts` keeps an `isQuitting` flag
   set by `before-quit`, otherwise the app cannot be closed on Windows.
7. **Ad blocker must stay scoped to `persist:player`** — attaching it to the
   default session blocks TMDB images in the app UI.
8. **Keep `ensureCatalogItem`'s `kind` in the title match** — without it a movie
   and a series sharing title+year collapse into one row.

---

## 9. Privacy stance (deliberate, do not weaken)

- Library = one local SQLite file. No account, no telemetry.
- The app contacts only `api.themoviedb.org` (with a user-supplied key) and,
  while streaming, the chosen embed providers.
- Backups are AES-256-GCM encrypted with a user passphrase. The auto-backup
  passphrase is stored via Electron `safeStorage` (DPAPI on Windows).
- Drive sync works by writing into a folder the user's own sync client watches —
  **no OAuth, no cloud permissions, no account linking.**

---

## 10. Attribution

Movie/TV data from [TMDB](https://www.themoviedb.org/). Not endorsed by TMDB.
This product uses the TMDB API but is not endorsed or certified by TMDB.
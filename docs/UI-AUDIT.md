# UI audit

Standing list of what was actually looked at, and what was not. Regenerate the
captures with `npx electron scripts/screenshot.mjs` (writes `./screenshots`,
uses a throwaway profile in `.screenshot-profile/`, never reads your real
library or API key).

## Verified — 2026-10-13

**Discover charts** (`screenshots/04-discover.png`)
- Trending / top rated render live against TMDB, correct poster aspect, no
  layout shift as rows stream in.
- Rows are fixed-width horizontal strips, so density holds on a wide window.
  The first attempt used a 10-wide grid; posters stretched to ~150px and
  pushed the filterable grid a full screen down. Reverted to strips.
- Rows step aside once any filter is set, so results the user actually
  requested stay above the fold.

**Detail panel** (`screenshots/03-detail.png`)
- Unchanged by the person/collection work: the seeded Breaking Bad entry is a
  series with no live TMDB data in the screenshot profile, so the cast strip
  never renders there. The new cast/crew buttons and the collection link are
  covered by typecheck and the build, **not** by a screenshot.

## Not yet looked at

- **Player sync end to end.** `lib/playerSync.ts` listens for the postMessage
  channel embed players use to report playback. The normaliser is unit-tested
  against every known message shape (14 tests), and a live HAR confirmed
  VidLove emits that shape — but it has never run inside Electron's `<webview>`.
  A webview is a full browser context so the message should arrive, and that is
  exactly the kind of assumption worth proving rather than trusting.
- **Subtitles end to end.** The parser (11 tests), season-pack reader (10 tests)
  and providers are covered, and SubDL plus the archive format were verified by
  hand — but no subtitle has been watched through the overlay on a live stream.
- **SubDL season packs against the real API.** The zip reader is tested against
  archives built locally, including the episode-2-vs-12 case. Real packs use
  messier filenames; that path needs a real download to confirm.
- **Person and collection modals.** Built and compiling; no screenshot, no
  live run.
- **OpenSubtitles with a real key.** The code path is written; only the
  no-key path has been exercised.

## Known rough edges

- Discover charts cost a dozen requests on mount. They are opt-out in state
  but there is no visible control to turn them off once hidden — the only way
  back is a reload.
- The chart strips always show 20 items per row regardless of how wide the
  window is, so a very wide display leaves scroll that could have been a
  grid.
- Person/collection modals render over the detail panel at `z-50`; the
  detail panel is `z-30`, so nesting a modal inside a modal was avoided by
  closing the parent first. Worth revisiting if a third level is ever added.
# UI audit

Standing list of what was actually looked at, and what was not. Regenerate the
captures with `npx electron scripts/screenshot.mjs`.

The harness is more than a screenshotter: it seeds a throwaway profile, copies
the TMDB and SubDL keys out of the **real** profile read-only, walks every view
and overlay, and records every console error, failed request and unhandled
rejection. Most defects in an Electron app are silent — a rejected promise never
shows up in a picture. It also detects blank captures and retries, because
`capturePage()` intermittently returns an unpainted frame and a run of empty
PNGs is indistinguishable from a crashed app.

Seeded rows carry **real TMDB and IMDb ids**. An earlier version invented them,
which made every live fetch resolve to an unrelated title — Breaking Bad's
detail panel came back with two strangers in the cast.

## Verified — 2026-10-13

Every view, both detail panels, all five Settings tabs, the person modal, the
command palette, bulk add, and a live subtitle search. Zero runtime errors.

**Fixed during this pass:**
- Discover's filter bar — the page's own controls — sat below three chart rows.
  Charts are now capped at two with a Show all toggle, and live above them.
- Board's PROGRESS column showed a movie's *runtime* ("148 min"), which reads
  as progress. It now shows watched-over-runtime, or "Not started".
- Person modal's profile image was broken: the raw TMDB path was used instead of
  `profileUrl()`.
- The Settings scroll container is a flex column, so its children shrank and a
  password input was squashed to a few pixels. Children now `shrink-0`.
- Generated posters started their gradient at full saturation, so every
  posterless title was a bright magenta or teal block in a gold-on-charcoal
  library. They now read as dark posters with a hint of colour.
- The activity chart was purple, a colour that exists nowhere else in the app.
  All chart colours now come from one `PALETTE` map mirroring `globals.css`.
- Subtitle picker's "0 ↓" on every row (SubDL reports no download count) and the
  internal-looking "IMDbId tt0903747" label.

## Not yet looked at

- **Subtitles watched end to end.** Search, ranking and season-pack episode
  matching are all confirmed against the live API, but no subtitle has been
  watched through the overlay on a real stream, and the postMessage sync path
  has never fired inside a `<webview>`.
- **Person modal "Known for"** renders the first 18 credits with a Show all
  toggle; the expanded state has not been screenshotted.
- **Collection modal.** The harness reports "no collection link" because none
  of the seeded titles belongs to a franchise. Untested.
- **Empty states.** Nothing in this library is empty, so watchlist, lists and
  no-results states are unverified.
- **Window sizes.** Everything captured at 1600x1000. No 1280px laptop or
  ultrawide pass.
- **Subtitle settings with a real key typed in** — the fields render, but the
  round trip is only proven for the SubDL key already in the real profile.

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
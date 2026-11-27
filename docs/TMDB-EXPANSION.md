# TMDB expansion plan

Everything below is additive. No existing endpoint signature changes except
fixing the broken `/tv/week` call, and no database schema changes.

## What the app already does

- **Discover** (`/discover/movie|tv`) with genre, rating, year, runtime and
  sort filters.
- **Charts** (`/trending/{type}/{window}`, `/movie|tv/top_rated`,
  `/movie/now_playing`, `/movie/upcoming`) rendered as isolated poster rows.
- **Detail panel** (`/movie|tv/{id}?append_to_response=credits,recommendations,
  similar,external_ids,keywords`) with cast, crew, franchise, providers,
  trailer and similar titles.
- **Season grid** (`/tv/{id}/season/{n}`) with episode logging.
- **People and franchises** via `PersonModal` and `CollectionModal`.
- **Theme**: charcoal canvas, gold accent, `surface`/`line`/`ink` tokens,
  rounded `border-line` cards, `Label` uppercase micro-headings, horizontal
  `row-scroll` rails.

## Additions

### Browse rows

- Fix `/tv/week` → `/tv/on_the_air`.
- Add `/tv/airing_today` and `/movie|tv/popular`.
- Add a `Trending people` rail from `/trending/person/week` on Discover,
  opening the existing `PersonModal`.

### Keyword and studio pages

- New `KeywordModal`: `/keyword/{id}` for the canonical name plus
  `/discover/movie|tv?with_keywords=...` for titles.
- New `StudioModal`: `/company/{id}` or `/network/{id}` plus
  `/discover/movie|tv?with_companies=...` or `with_networks=...`.
- Detail panel gets keyword chips and studio/network chips that open these
  modals. Same `BrowseModals` shell as people and franchises.

### Better detail metadata

- TV details append `aggregate_credits` so the cast is the whole run, not
  just the latest season.
- Detail panel shows keyword chips and "Also known as" alt titles.
- Cast cards show episode counts for series.

### Season and episode extras

- Season request appends `credits,images,videos`.
- Season grid gains a collapsible details row: season cast, stills/backdrop
  strip, and video links.
- Per-episode info button opens an `EpisodeModal` with cast, guest stars and
  key crew from `/tv/{id}/season/{s}/episode/{e}/credits`.

### Search and matching

- Detail panel gets alternative titles from `alternative_titles`.
- Command palette gains people and collection results from
  `/search/person` and `/search/collection`, opening the existing modals.
  Title results stay first.

## Safety rules

- Every new TMDB call is wrapped at the IPC boundary; failures return empty
  arrays/`null`, so a missing key never blocks a page.
- New UI reuses `PosterCard`, `Label`, `row-scroll`, the modal chrome and the
  existing gold-on-charcoal tokens.
- New endpoints are separate IPC channels; existing channels keep their
  payloads.
- Verify after each phase with typecheck, lint, tests, build and screenshots.

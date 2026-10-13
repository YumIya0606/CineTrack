# TMDB Endpoint Audit → Feature Map

Every endpoint CineTrack currently uses, and everything it doesn't. Audited
against `src/main/tmdb/client.ts`.

---

## Currently used (11)

| Endpoint | Used for |
|---|---|
| `/search/movie`, `/search/tv`, `/search/multi` | Search palette, bulk add |
| `/trending/all/week` | Home "Discover" row |
| `/movie/{id}`, `/tv/{id}` (+`credits,recommendations,similar`) | Detail panel, board |
| `/movie|tv/{id}/videos` | Trailer modal |
| `/movie|tv/{id}/watch/providers` | "Where to watch" |
| `/tv/{id}/season/{n}` | Episode grid |
| `/tv/{id}` (show status) | New-episode notifications |
| `/discover/movie`, `/discover/tv` | Discover view |
| `/genre/movie/list`, `/genre/tv/list` | Genre filter labels |

---

## Unused → proposed feature

### ⭐ High value

| Endpoint | Feature | Notes |
|---|---|---|
| `append_to_response=external_ids` | **IMDb IDs** | Prerequisite for subtitles. Also enables IMDb-keyed search and cross-referencing. |
| `/find/{external_id}?external_source=imdb_id` | **Import by IMDb ID** | Paste `tt0133093`, get the TMDB row. Pairs with the IMDb CSV importer. |
| `/collection/{id}` | **Franchise / collection pages** | "All 10 Bond films", "MCU timeline". Big UX win; TMDB links collections from movie details. |
| `/person/{id}` + `/person/{id}/combined_credits` | **Person pages** | Full filmography, top roles, "because you liked X". Currently `people` table is write-only and only used for a stats bar chart. |
| `/trending/{movie\|tv\|person}/{day\|week}` | **Richer trending rows** | Today has no `/day`. Person trending enables "Trending actors" rows. |
| `/top_rated/movie`, `/top_rated/tv` | **Top Rated rows** | High-vote, high-score titles — genuinely different from trending. |

### ⭐ Medium value

| Endpoint | Feature | Notes |
|---|---|---|
| `/movie/now_playing` | **In Theatres row** | |
| `/movie/upcoming` | **Coming Soon row** | |
| `/tv/day`, `/tv/week` | **Airing Today / This Week rows** | Pairs with the existing notification engine. |
| `/tv/{id}/episode_groups` | **Correct episode numbering** | Handles "Absolute" vs "Scene" numbering (breaking shows where S1E5 = S2E1) and specials (S00). CineTrack currently assumes naive S/E. |
| `/search/collection`, `/search/person` | **People & franchises in search** | Command palette currently only returns movies and TV. |
| `/movie|tv/{id}/images` | **Gallery** | Backdrops, posters, logos, profiles. Cheap to add, makes Detail feel rich. |

### ○ Lower value / situational

| Endpoint | Feature | Notes |
|---|---|---|
| `/configuration` | Image size hints | Minor perf tuning. |
| `/movie|tv/{id}/release_dates` + `/certification` | Release/certification data | Only useful for a detail-info popover. |
| `/tv/{id}/aggregate_credits` | Larger cast lists | Detail already caps cast at 14. |
| `/search/keyword` | Keyword search | Long tail. |
| `/movie|tv/{id}/alternative_titles` | Regional titles | Nice for alias matching, rarely needed. |
| `/account/{id}/favorite`, `/list/{id}` | Cloud lists/favourites | Requires a **user access token**, not an app key. Out of scope — breaks the no-account privacy stance. |
| `/person/{id}/external_ids` | Social links | Low value. |

---

## Implementation notes

**`external_ids`** — TMDB returns:
```json
{ "imdb_id": "tt0133093", "facebook_id": null, "instagram_id": null, "twitter_id": null }
```
Append via `append_to_response=external_ids` on the existing details call, so it
costs **zero extra requests**. Backfill existing rows the same way runtimes are
backfilled.

**Collections** — `movie/{id}` already returns a `belongs_to_collection` block when
applicable, so the Detail panel can link to a collection page for free.

**People** — the `people` table currently has a `tmdb_person_id` column and a
`catalog_id`, but nothing ever populates it. Adding `/person/{id}/combined_credits`
finally makes the existing "Most watched people" chart meaningful and unlocks
person pages.

**Auth boundary** — everything above works with the user's existing **API key /
read token**. Only the `account`/`list` endpoints need a per-user OAuth token, and
those are deliberately excluded to preserve the "no account" privacy stance.
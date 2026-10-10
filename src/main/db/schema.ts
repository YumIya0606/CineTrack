import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core'

/* The seeded world catalog of movies & series (read-mostly). */
export const catalog = sqliteTable(
  'catalog',
  {
    id: integer('id').primaryKey(),
    tmdbId: integer('tmdb_id'),
    imdbId: text('imdb_id'),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    kind: text('kind', { enum: ['movie', 'series'] }).notNull(),
    year: integer('year'),
    endYear: integer('end_year'),
    genres: text('genres').notNull().default(''), // pipe-separated
    runtimeMinutes: integer('runtime_minutes'),
    voteAverage: real('vote_average'),
    voteCount: integer('vote_count'),
    overview: text('overview'),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    popularity: real('popularity')
  },
  t => [
    index('idx_catalog_title').on(t.title),
    index('idx_catalog_kind').on(t.kind),
    index('idx_catalog_year').on(t.year),
    index('idx_catalog_tmdb').on(t.tmdbId),
    index('idx_catalog_imdb').on(t.imdbId)
  ]
)

/* A title the user has added to their library. */
export const library = sqliteTable(
  'library',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    catalogId: integer('catalog_id')
      .notNull()
      .references(() => catalog.id, { onDelete: 'cascade' }),
    // Deliberately NOT typed as an enum: statuses are user-definable now, so
    // any string key is legal here. Use statusDefs for the palette.
    status: text('status').notNull(),
    rating: integer('rating'), // 1..10
    notes: text('notes'),
    addedAt: text('added_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    watchedAt: text('watched_at'),
    episodesWatched: integer('episodes_watched').notNull().default(0),
    episodesTotal: integer('episodes_total'),
    seasonsTotal: integer('seasons_total'),
    playCount: integer('play_count').notNull().default(1),
    /**
     * When set, the user picked this status by hand and the episode-progress
     * engine must not overwrite it. Series statuses are otherwise *derived*
     * from episodes watched (0 → planned, partial → watching, all → completed).
     */
    statusOverride: integer('status_override', { mode: 'boolean' }).notNull().default(false),
    /**
     * Per-title override for a series' episode runtime, in minutes. Needed when
     * TMDB doesn't publish one — without it a completed series contributes zero
     * minutes to watch time no matter how many episodes are logged.
     */
    episodesRuntime: integer('episodes_runtime')
  },
  t => [
    index('idx_library_status').on(t.status),
    index('idx_library_catalog').on(t.catalogId),
    index('idx_library_updated').on(t.updatedAt)
  ]
)

/**
 * User-definable statuses. The five built-ins seed here so existing library rows
 * (which store the canonical keys) always resolve; everything else — label,
 * colour, ordering, and whether it counts toward watch time — is editable, and
 * the user can add their own.
 */
export const statusDefs = sqliteTable('status_defs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Stable slug stored on library.status. Never shown, never auto-reused. */
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  /** Accent token id from the renderer's palette (gold, emerald, azure…). */
  color: text('color').notNull().default('slate'),
  position: integer('position').notNull().default(0),
  /** Adds its titles' runtimes into the watch-time total. */
  countsTowardWatchTime: integer('counts_toward_watch_time', { mode: 'boolean' })
    .notNull()
    .default(false),
  /**
   * The episode-progress engine may assign this status on its own. Only the
   * three "progress" statuses are derivable; Dropped/Rewatching describe intent
   * rather than progress, so they are always manual.
   */
  derivable: integer('derivable', { mode: 'boolean' }).notNull().default(false),
  /** Built-in statuses can't be deleted, only restyled. */
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false)
})

/* Per-episode watch log for series. Composite key prevents duplicate logs. */
export const episodeLog = sqliteTable(
  'episode_log',
  {
    libraryId: integer('library_id')
      .notNull()
      .references(() => library.id, { onDelete: 'cascade' }),
    season: integer('season').notNull(),
    episode: integer('episode').notNull(),
    watchedAt: text('watched_at').notNull()
  },
  t => [
    primaryKey({ columns: [t.libraryId, t.season, t.episode] }),
    index('idx_episode_library').on(t.libraryId)
  ]
)

/* Key/value store for settings, profiles & preferences. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

/* Cast/crew credits for stats (populated from TMDB when a key is present). */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    catalogId: integer('catalog_id')
      .notNull()
      .references(() => catalog.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role', { enum: ['actor', 'director', 'writer', 'producer'] }).notNull(),
    character: text('character'),
    tmdbPersonId: integer('tmdb_person_id')
  },
  t => [index('idx_people_name').on(t.name), index('idx_people_catalog').on(t.catalogId)]
)

/* User-defined shelves, e.g. "Best of 2026" or "Comfort movies". */
export const collections = sqliteTable('collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull()
})

/* Membership of a title in a user shelf. */
export const collectionItems = sqliteTable(
  'collection_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    catalogId: integer('catalog_id')
      .notNull()
      .references(() => catalog.id, { onDelete: 'cascade' }),
    addedAt: text('added_at').notNull()
  },
  t => [
    // Unique index (not a composite PK) — SQLite rejects a table with both an
    // autoincrement surrogate key and a composite primary key. This still
    // backs onConflictDoNothing() in collections.ts.
    uniqueIndex('unique_collection_item').on(t.collectionId, t.catalogId),
    index('idx_collection_items_collection').on(t.collectionId)
  ]
)

/* One row per viewing — powers rewatch counts and play history. */
export const viewingLog = sqliteTable(
  'viewing_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    libraryId: integer('library_id')
      .notNull()
      .references(() => library.id, { onDelete: 'cascade' }),
    watchedAt: text('watched_at').notNull()
  },
  t => [index('idx_viewing_log_library').on(t.libraryId), index('idx_viewing_log_date').on(t.watchedAt)]
)

/* Reminders generated by the notification engine (premieres, new episodes). */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['premiere', 'new_episode', 'info'] }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    catalogId: integer('catalog_id'),
    tmdbId: integer('tmdb_id'),
    scheduledFor: text('scheduled_for').notNull(),
    fired: integer('fired', { mode: 'boolean' }).notNull().default(false),
    dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull()
  },
  t => [
    index('idx_notifications_fired').on(t.fired),
    index('idx_notifications_dismissed').on(t.dismissed),
    index('idx_notifications_tmdb').on(t.tmdbId)
  ]
)

export type CatalogRow = typeof catalog.$inferSelect
export type LibraryRow = typeof library.$inferSelect
export type StatusDefRow = typeof statusDefs.$inferSelect
export type EpisodeLogRow = typeof episodeLog.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
export type PeopleRow = typeof people.$inferSelect
export type CollectionRow = typeof collections.$inferSelect
export type CollectionItemRow = typeof collectionItems.$inferSelect
export type ViewingLogRow = typeof viewingLog.$inferSelect
export type NotificationRow = typeof notifications.$inferSelect

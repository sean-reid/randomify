/**
 * The randomify serving corpus schema: streamable recordings, their resolved
 * links, and the tempered prefix-sum weight index the sampler walks. The
 * pipeline rebuilds and swaps the contents atomically (see export.ts), so
 * readers always see a complete corpus.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS artist (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  country  TEXT
);

CREATE TABLE IF NOT EXISTS release_group (
  id         TEXT PRIMARY KEY,
  artist_id  TEXT NOT NULL,
  title      TEXT NOT NULL,
  year       INTEGER
);

CREATE TABLE IF NOT EXISTS recording (
  id                TEXT PRIMARY KEY,
  artist_id         TEXT NOT NULL,
  release_group_id  TEXT NOT NULL,
  title             TEXT NOT NULL,
  isrc              TEXT,
  duration_ms       INTEGER,
  year              INTEGER,
  language          TEXT,
  cover_art_url     TEXT,
  preview_url       TEXT,
  genres            TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS platform_link (
  recording_id  TEXT NOT NULL,
  platform      TEXT NOT NULL,
  url           TEXT NOT NULL,
  kind          TEXT NOT NULL,
  confidence    DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (recording_id, platform)
);

CREATE TABLE IF NOT EXISTS facet_value (
  facet_type  TEXT NOT NULL,
  facet_id    TEXT NOT NULL,
  weight      DOUBLE PRECISION NOT NULL,
  cum_weight  DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (facet_type, facet_id)
);
CREATE INDEX IF NOT EXISTS facet_value_walk ON facet_value (facet_type, cum_weight);

CREATE TABLE IF NOT EXISTS facet_artist (
  facet_type  TEXT NOT NULL,
  facet_id    TEXT NOT NULL,
  artist_id   TEXT NOT NULL,
  weight      DOUBLE PRECISION NOT NULL,
  cum_weight  DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (facet_type, facet_id, artist_id)
);
CREATE INDEX IF NOT EXISTS facet_artist_walk ON facet_artist (facet_type, facet_id, cum_weight);

CREATE TABLE IF NOT EXISTS artist_release_group (
  artist_id         TEXT NOT NULL,
  release_group_id  TEXT NOT NULL,
  weight            DOUBLE PRECISION NOT NULL,
  cum_weight        DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (artist_id, release_group_id)
);
CREATE INDEX IF NOT EXISTS artist_release_group_walk ON artist_release_group (artist_id, cum_weight);

CREATE TABLE IF NOT EXISTS release_group_recording (
  release_group_id  TEXT NOT NULL,
  recording_id      TEXT NOT NULL,
  cum_index         INTEGER NOT NULL,
  PRIMARY KEY (release_group_id, recording_id)
);
CREATE INDEX IF NOT EXISTS release_group_recording_walk ON release_group_recording (release_group_id, cum_index);

-- Denormalized, recording-level sampling index for strict filtered spins. The
-- prefix-sum walk above cannot be filtered (removing rows corrupts the cumulative
-- weights), so a filtered spin instead draws one row here with a weighted key
-- (see SPIN_FILTERED_SQL). Every filterable attribute lives on one indexed row so
-- the WHERE matches the returned recording exactly. weight mirrors the
-- artist/release-group/recording sub-walk to keep the alpha tempering.
CREATE TABLE IF NOT EXISTS sample_recording (
  recording_id  TEXT PRIMARY KEY,
  artist_id     TEXT NOT NULL,
  weight        DOUBLE PRECISION NOT NULL,
  decade        SMALLINT,
  country       TEXT,
  language      TEXT,
  genres        TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS sample_recording_genres ON sample_recording USING gin (genres);
CREATE INDEX IF NOT EXISTS sample_recording_decade ON sample_recording (decade);
CREATE INDEX IF NOT EXISTS sample_recording_country ON sample_recording (country);
CREATE INDEX IF NOT EXISTS sample_recording_language ON sample_recording (language);
CREATE INDEX IF NOT EXISTS sample_recording_artist ON sample_recording (artist_id);

-- The full, unfiltered facet catalog (every value and its total song count),
-- materialized at build time so the no-filter /facets call is a cheap table read
-- instead of a full-corpus GROUP BY. Filtered /facets calls aggregate the smaller
-- matched set live.
CREATE TABLE IF NOT EXISTS facet_catalog (
  dimension  TEXT NOT NULL,
  value      TEXT NOT NULL,
  count      INTEGER NOT NULL,
  PRIMARY KEY (dimension, value)
);
`;

/** Serving tables, in an order safe to TRUNCATE together. */
export const CORPUS_TABLES = [
  'artist',
  'release_group',
  'recording',
  'platform_link',
  'facet_value',
  'facet_artist',
  'artist_release_group',
  'release_group_recording',
  'sample_recording',
  'facet_catalog',
] as const;

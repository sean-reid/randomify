/** Streaming platforms randomify links to. */
export type PlatformId =
  | 'spotify'
  | 'apple_music'
  | 'youtube_music'
  | 'tidal'
  | 'deezer'
  | 'amazon_music'
  | 'pandora'
  | 'bandcamp';

/**
 * Whether a link points at the exact track (resolved and verified) or at a
 * platform search pre-filled with the artist and title (fallback).
 */
export type LinkKind = 'exact' | 'search_fallback';

export interface PlatformLink {
  platform: PlatformId;
  url: string;
  kind: LinkKind;
}

/** A single sampled song, resolved from the corpus. */
export interface Song {
  /** MusicBrainz recording MBID. */
  recordingId: string;
  title: string;
  /** Display name of the credited artist. */
  artist: string;
  /** MusicBrainz artist MBID. */
  artistId: string;
  releaseTitle: string | null;
  /** MusicBrainz release-group MBID. */
  releaseGroupId: string | null;
  year: number | null;
  isrc: string | null;
  durationMs: number | null;
  coverArtUrl: string | null;
  /** 30-second preview MP3 (Deezer) for the in-app player, when available. */
  previewUrl: string | null;
  genres: string[];
}

/** The dimension a given spin walked down from. */
export type Facet = 'genre' | 'decade' | 'country' | 'language';

/** Response payload for a single spin. */
export interface SpinResponse {
  song: Song;
  links: PlatformLink[];
  /**
   * Which facet drove an unfiltered spin (transparency/debugging). Absent for a
   * filtered spin, which is driven by the user's filters rather than one facet.
   */
  facet?: Facet;
}

/**
 * Optional filters that narrow a spin to a strict slice of the catalog. Values
 * within a dimension are OR'd; dimensions are AND'd. An empty/absent field means
 * "no constraint on this dimension".
 */
export interface SpinFilters {
  genres?: string[];
  decades?: number[];
  countries?: string[];
  languages?: string[];
  artistIds?: string[];
}

/** A facet value and how many songs currently carry it. */
export interface FacetValue {
  value: string;
  count: number;
}

/** The available values per enumerable facet, for the filter pickers. */
export interface FacetCatalog {
  genre: FacetValue[];
  decade: FacetValue[];
  country: FacetValue[];
  language: FacetValue[];
}

/** One artist search result for the multi-artist typeahead. */
export interface ArtistHit {
  id: string;
  name: string;
}

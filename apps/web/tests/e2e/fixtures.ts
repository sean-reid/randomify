import { PLATFORMS, searchLink, type FacetCatalog, type SpinResponse } from '@randomify/shared';

/** A deterministic facet catalog for the filter UI tests. */
export const SAMPLE_FACETS: FacetCatalog = {
  genre: [
    { value: 'rock', count: 12 },
    { value: 'jazz', count: 5 },
  ],
  decade: [
    { value: '1980', count: 6 },
    { value: '1990', count: 8 },
  ],
  country: [{ value: 'GB', count: 9 }],
  language: [{ value: 'eng', count: 20 }],
};

/** A 1x1 PNG served for cover requests so no test touches the network. */
export const SAMPLE_COVER_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4EWUDAANMAV9yPykYAAAAAElFTkSuQmCC',
  'base64',
);

/** A deterministic spin response so the UI tests are stable. */
export const SAMPLE_SPIN: SpinResponse = {
  facet: 'genre',
  song: {
    recordingId: 'test-rec-001',
    title: 'Paranoid Android',
    artist: 'Radiohead',
    artistId: 'test-art-radiohead',
    releaseTitle: 'OK Computer',
    releaseGroupId: 'test-rg-okcomputer',
    year: 1997,
    isrc: null,
    durationMs: 383000,
    coverArtUrl: 'https://cdn-images.dzcdn.net/images/cover/testcover/500x500-000000-80-0-0.jpg',
    // A tiny silent WAV so the player actually loads and plays in the headless
    // browser without a network dependency.
    previewUrl:
      'data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==',
    genres: ['rock', 'alternative'],
  },
  links: PLATFORMS.map((p) => searchLink(p.id, 'Radiohead', 'Paranoid Android')),
};

import {
  DEFAULT_ALPHA,
  PLATFORMS,
  searchLink,
  shouldShowLink,
  weightedPick,
  type Facet,
  type PlatformLink,
  type Song,
  type Weighted,
} from '@randomify/shared';
import type { CorpusProvider, SpinInput, SpinPick } from './corpus.js';

/** A demo song carries the facet attributes the sampler walks down. */
interface DemoSong {
  recordingId: string;
  title: string;
  artist: string;
  artistId: string;
  releaseGroupId: string;
  releaseTitle: string;
  year: number;
  genres: string[];
  country: string;
  language: string;
  durationMs: number;
  previewUrl?: string;
  coverArtUrl?: string;
}

/**
 * A small spread of recordings across genres, eras, countries, and languages so
 * the sampler exercises every facet against real-feeling data. Links are
 * search fallbacks, which is exactly how the real corpus presents a platform it
 * has not resolved to an exact track yet.
 */
const DEMO_SONGS: DemoSong[] = [
  {
    recordingId: 'demo-rec-001',
    title: 'Windowlicker',
    artist: 'Aphex Twin',
    artistId: 'demo-art-aphex',
    releaseGroupId: 'demo-rg-windowlicker',
    releaseTitle: 'Windowlicker',
    year: 1999,
    genres: ['electronic', 'idm'],
    country: 'GB',
    language: 'eng',
    durationMs: 366000,
  },
  {
    recordingId: 'demo-rec-002',
    title: 'Roygbiv',
    artist: 'Boards of Canada',
    artistId: 'demo-art-boc',
    releaseGroupId: 'demo-rg-mhtrtc',
    releaseTitle: 'Music Has the Right to Children',
    year: 1998,
    genres: ['electronic', 'ambient'],
    country: 'GB',
    language: 'eng',
    durationMs: 151000,
  },
  {
    recordingId: 'demo-rec-003',
    title: 'So What',
    artist: 'Miles Davis',
    artistId: 'demo-art-miles',
    releaseGroupId: 'demo-rg-kindofblue',
    releaseTitle: 'Kind of Blue',
    year: 1959,
    genres: ['jazz'],
    country: 'US',
    language: 'zxx',
    durationMs: 562000,
  },
  {
    recordingId: 'demo-rec-004',
    title: 'Redbone',
    artist: 'Childish Gambino',
    artistId: 'demo-art-gambino',
    releaseGroupId: 'demo-rg-awakenmywill',
    releaseTitle: 'Awaken, My Love!',
    year: 2016,
    genres: ['funk', 'soul'],
    country: 'US',
    language: 'eng',
    durationMs: 327000,
  },
  {
    recordingId: 'demo-rec-005',
    title: 'Tomorrow Never Knows',
    artist: 'The Beatles',
    artistId: 'demo-art-beatles',
    releaseGroupId: 'demo-rg-revolver',
    releaseTitle: 'Revolver',
    year: 1966,
    genres: ['rock', 'psychedelic'],
    country: 'GB',
    language: 'eng',
    durationMs: 178000,
  },
  {
    recordingId: 'demo-rec-006',
    title: 'Paranoid Android',
    artist: 'Radiohead',
    artistId: 'demo-art-radiohead',
    releaseGroupId: 'demo-rg-okcomputer',
    releaseTitle: 'OK Computer',
    year: 1997,
    genres: ['rock', 'alternative'],
    country: 'GB',
    language: 'eng',
    durationMs: 383000,
  },
  {
    recordingId: 'demo-rec-007',
    title: 'Ms. Jackson',
    artist: 'OutKast',
    artistId: 'demo-art-outkast',
    releaseGroupId: 'demo-rg-stankonia',
    releaseTitle: 'Stankonia',
    year: 2000,
    genres: ['hip hop'],
    country: 'US',
    language: 'eng',
    durationMs: 270000,
  },
  {
    recordingId: 'demo-rec-008',
    title: 'Corcovado',
    artist: 'Antônio Carlos Jobim',
    artistId: 'demo-art-jobim',
    releaseGroupId: 'demo-rg-jobimsongbook',
    releaseTitle: 'The Composer of Desafinado, Plays',
    year: 1963,
    genres: ['bossa nova', 'jazz'],
    country: 'BR',
    language: 'por',
    durationMs: 138000,
  },
  {
    recordingId: 'demo-rec-009',
    title: 'La Vie en rose',
    artist: 'Édith Piaf',
    artistId: 'demo-art-piaf',
    releaseGroupId: 'demo-rg-piafbest',
    releaseTitle: 'La Vie en rose',
    year: 1947,
    genres: ['chanson'],
    country: 'FR',
    language: 'fra',
    durationMs: 198000,
  },
  {
    recordingId: 'demo-rec-010',
    title: 'Despacito',
    artist: 'Luis Fonsi',
    artistId: 'demo-art-fonsi',
    releaseGroupId: 'demo-rg-vida',
    releaseTitle: 'Vida',
    year: 2017,
    genres: ['reggaeton', 'latin pop'],
    country: 'PR',
    language: 'spa',
    durationMs: 229000,
  },
  {
    recordingId: 'demo-rec-011',
    title: 'Once in a Lifetime',
    artist: 'Talking Heads',
    artistId: 'demo-art-talkingheads',
    releaseGroupId: 'demo-rg-remaininlight',
    releaseTitle: 'Remain in Light',
    year: 1980,
    genres: ['new wave', 'art rock'],
    country: 'US',
    language: 'eng',
    durationMs: 263000,
  },
  {
    recordingId: 'demo-rec-012',
    title: 'Teardrop',
    artist: 'Massive Attack',
    artistId: 'demo-art-massiveattack',
    releaseGroupId: 'demo-rg-mezzanine',
    releaseTitle: 'Mezzanine',
    year: 1998,
    genres: ['trip hop', 'electronic'],
    country: 'GB',
    language: 'eng',
    durationMs: 330000,
  },
  {
    recordingId: 'demo-rec-013',
    title: 'Jolene',
    artist: 'Dolly Parton',
    artistId: 'demo-art-dolly',
    releaseGroupId: 'demo-rg-jolene',
    releaseTitle: 'Jolene',
    year: 1973,
    genres: ['country'],
    country: 'US',
    language: 'eng',
    durationMs: 162000,
  },
  {
    recordingId: 'demo-rec-014',
    title: 'Midnight City',
    artist: 'M83',
    artistId: 'demo-art-m83',
    releaseGroupId: 'demo-rg-huh',
    releaseTitle: 'Hurry Up, We’re Dreaming',
    year: 2011,
    genres: ['synth-pop', 'electronic'],
    country: 'FR',
    language: 'eng',
    durationMs: 244000,
  },
];

function decadeOf(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

/** The facet values a song belongs to, for the chosen facet. */
function facetValuesOf(song: DemoSong, facet: Facet): string[] {
  switch (facet) {
    case 'genre':
      return song.genres;
    case 'decade':
      return [decadeOf(song.year)];
    case 'country':
      return [song.country];
    case 'language':
      return [song.language];
  }
}

function tally(values: Iterable<string>): Weighted<string>[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([value, descendantCount]) => ({ value, descendantCount }));
}

/** Weighted candidates from songs grouped by a key. */
function weightedByKey<K extends string>(
  songs: DemoSong[],
  keyOf: (song: DemoSong) => K,
): Weighted<string>[] {
  return tally(songs.map(keyOf));
}

/** Pick one weighted value from a single draw r in [0, 1), or null if empty. */
function pick(nodes: Weighted<string>[], r: number): string | null {
  return nodes.length ? weightedPick(nodes, DEFAULT_ALPHA, () => r) : null;
}

export class DemoCorpusProvider implements CorpusProvider {
  private readonly byRecording = new Map(DEMO_SONGS.map((s) => [s.recordingId, s]));

  ping(): Promise<void> {
    return Promise.resolve();
  }

  /** Resolve a whole walk in memory, mirroring the Postgres provider: pick a
   * facet value, redraw the artist to avoid recent ones, then the release group
   * and recording, and assemble the song with its search-fallback links. */
  spin(input: SpinInput): Promise<SpinPick | null> {
    const facetValue = this.pickFacetValue(input.facet, input.facetDraw);
    if (!facetValue) return Promise.resolve(null);

    const artistId = this.pickArtist(input.facet, facetValue, input.artistDraws, input.exclude);
    if (!artistId) return Promise.resolve(null);

    const releaseGroupId = this.pickReleaseGroup(artistId, input.releaseGroupDraw);
    if (!releaseGroupId) return Promise.resolve(null);

    const recordingId = this.pickRecording(releaseGroupId, input.recordingDraw);
    if (!recordingId) return Promise.resolve(null);

    const s = this.require(recordingId);
    return Promise.resolve({ song: this.toSong(s), links: this.toLinks(s) });
  }

  private pickFacetValue(facet: Facet, r: number): string | null {
    return pick(tally(DEMO_SONGS.flatMap((s) => facetValuesOf(s, facet))), r);
  }

  /** Walk each artist draw; prefer the first landing on a non-excluded artist,
   * else keep the last drawn so a spin still resolves. */
  private pickArtist(
    facet: Facet,
    facetValue: string,
    draws: number[],
    exclude: ReadonlySet<string>,
  ): string | null {
    const inFacet = DEMO_SONGS.filter((s) => facetValuesOf(s, facet).includes(facetValue));
    const candidates = weightedByKey(inFacet, (s) => s.artistId);
    let chosen: string | null = null;
    for (const r of draws) {
      const candidate = pick(candidates, r);
      if (!candidate) break;
      chosen = candidate;
      if (!exclude.has(candidate)) break;
    }
    return chosen;
  }

  private pickReleaseGroup(artistId: string, r: number): string | null {
    const songs = DEMO_SONGS.filter((s) => s.artistId === artistId);
    return pick(
      weightedByKey(songs, (s) => s.releaseGroupId),
      r,
    );
  }

  private pickRecording(releaseGroupId: string, r: number): string | null {
    const songs = DEMO_SONGS.filter((s) => s.releaseGroupId === releaseGroupId);
    return pick(
      songs.map((s) => ({ value: s.recordingId, descendantCount: 1 })),
      r,
    );
  }

  private toSong(s: DemoSong): Song {
    return {
      recordingId: s.recordingId,
      title: s.title,
      artist: s.artist,
      artistId: s.artistId,
      releaseTitle: s.releaseTitle,
      releaseGroupId: s.releaseGroupId,
      year: s.year,
      isrc: null,
      durationMs: s.durationMs,
      coverArtUrl: s.coverArtUrl ?? null,
      previewUrl: s.previewUrl ?? null,
      genres: s.genres,
    };
  }

  private toLinks(s: DemoSong): PlatformLink[] {
    return PLATFORMS.map((p) => searchLink(p.id, s.artist, s.title)).filter(shouldShowLink);
  }

  private require(recordingId: string): DemoSong {
    const s = this.byRecording.get(recordingId);
    if (!s) throw new Error(`unknown recording: ${recordingId}`);
    return s;
  }
}

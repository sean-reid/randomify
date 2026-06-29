import type { PlatformLink, Song, Facet, Weighted } from '@randomify/shared';
import type { CorpusProvider } from './corpus.js';

/**
 * Corpus backed by Neon Postgres through Hyperdrive.
 *
 * Each level is one indexed prefix-sum query against the precomputed weight
 * tables, for example:
 *
 *   -- artist within a facet value, weighted by tempered subtree size
 *   SELECT artist_id FROM facet_artist
 *   WHERE facet_type = $1 AND facet_id = $2 AND artist_id <> ALL($3)
 *     AND cum_weight >= $4
 *   ORDER BY cum_weight LIMIT 1;
 *
 * Filled in once the corpus and Hyperdrive binding are provisioned. The query
 * builder above is the shape; the pg client wiring lands with the corpus PR.
 */
export class PostgresCorpusProvider implements CorpusProvider {
  constructor(private readonly hyperdrive: Hyperdrive) {}

  facetValues(_facet: Facet): Promise<Weighted<string>[]> {
    return this.notImplemented();
  }

  artistsInFacet(
    _facet: Facet,
    _facetValue: string,
    _exclude: ReadonlySet<string>,
  ): Promise<Weighted<string>[]> {
    return this.notImplemented();
  }

  releaseGroups(_artistId: string): Promise<Weighted<string>[]> {
    return this.notImplemented();
  }

  recordings(_releaseGroupId: string): Promise<Weighted<string>[]> {
    return this.notImplemented();
  }

  loadSong(_recordingId: string): Promise<Song> {
    return this.notImplemented();
  }

  links(_recordingId: string): Promise<PlatformLink[]> {
    return this.notImplemented();
  }

  private notImplemented(): Promise<never> {
    void this.hyperdrive;
    return Promise.reject(new Error('PostgresCorpusProvider is not wired up yet'));
  }
}

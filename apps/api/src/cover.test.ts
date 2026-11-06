import { describe, expect, it } from 'vitest';
import { coverVariant } from './cover.js';

const BASE = 'https://cdn-images.dzcdn.net/images/cover/0a1b2c3d4e5f/1000x1000-000000-80-0-0';

describe('coverVariant', () => {
  it('rewrites the size and keeps hash, suffix and extension', () => {
    expect(coverVariant(`${BASE}.jpg`, 500)).toBe(
      'https://cdn-images.dzcdn.net/images/cover/0a1b2c3d4e5f/500x500-000000-80-0-0.jpg',
    );
    expect(coverVariant(`${BASE}.webp`, 250)).toContain('/250x250-000000-80-0-0.webp');
  });

  it('keeps a query string', () => {
    expect(coverVariant(`${BASE}.png?x=1`, 500)).toMatch(/500x500-000000-80-0-0\.png\?x=1$/);
  });

  it('leaves other hosts and plain http unchanged', () => {
    const other = 'https://example.com/images/cover/0a1b/1000x1000-000000-80-0-0.jpg';
    expect(coverVariant(other, 500)).toBe(other);
    const http = `${BASE}.jpg`.replace('https:', 'http:');
    expect(coverVariant(http, 500)).toBe(http);
  });

  it('leaves non-matching paths unchanged', () => {
    for (const url of [
      'https://cdn-images.dzcdn.net/images/artist/0a1b/1000x1000-000000-80-0-0.jpg',
      'https://cdn-images.dzcdn.net/images/cover/0a1b/1000x1000-000000-80-0-0.gif',
      'https://cdn-images.dzcdn.net/images/cover/xyz/1000x1000-000000-80-0-0.jpg',
    ]) {
      expect(coverVariant(url, 500)).toBe(url);
    }
  });

  it('tolerates a malformed URL', () => {
    expect(coverVariant('not a url', 500)).toBe('not a url');
    expect(coverVariant('', 500)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { RecentArtists } from './recent.js';

describe('RecentArtists', () => {
  it('serializes ids into the exclude param', () => {
    const recent = new RecentArtists();
    recent.add('a');
    recent.add('b');
    expect(recent.toParam()).toBe('a,b');
  });

  it('ignores empty ids', () => {
    const recent = new RecentArtists();
    recent.add('');
    expect(recent.size).toBe(0);
  });

  it('moves a repeated id to the most recent position', () => {
    const recent = new RecentArtists();
    recent.add('a');
    recent.add('b');
    recent.add('a');
    expect(recent.toParam()).toBe('b,a');
    expect(recent.size).toBe(2);
  });

  it('caps history at the configured size, dropping the oldest', () => {
    const recent = new RecentArtists(3);
    for (const id of ['a', 'b', 'c', 'd']) recent.add(id);
    expect(recent.toParam()).toBe('b,c,d');
    expect(recent.size).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import {
  diceCoefficient,
  durationWithin,
  isConfident,
  normalizeArtist,
  normalizeTitle,
  scoreMatch,
} from './verify.js';
import type { Fingerprint } from './types.js';

describe('normalizeTitle', () => {
  it('strips diacritics, case, and punctuation', () => {
    expect(normalizeTitle('La Vie en Rose!')).toBe('la vie en rose');
  });

  it('removes remaster and version parentheticals', () => {
    expect(normalizeTitle('Paranoid Android (Remastered 2017)')).toBe('paranoid android');
    expect(normalizeTitle('So What (Mono Version)')).toBe('so what');
  });

  it('drops featured-artist tails', () => {
    expect(normalizeTitle('Redbone (feat. Someone)')).toBe('redbone');
    expect(normalizeTitle('Track ft. Guest')).toBe('track');
  });
});

describe('normalizeArtist', () => {
  it('folds diacritics and ampersands', () => {
    expect(normalizeArtist('Sigur Rós')).toBe('sigur ros');
    expect(normalizeArtist('Simon & Garfunkel')).toBe('simon and garfunkel');
  });
});

describe('diceCoefficient', () => {
  it('is 1 for identical token sets and 0 for disjoint', () => {
    expect(diceCoefficient(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(diceCoefficient(new Set(['a']), new Set(['b']))).toBe(0);
  });
});

describe('durationWithin', () => {
  it('honors the tolerance and treats missing as no match', () => {
    expect(durationWithin(180000, 181000)).toBe(true);
    expect(durationWithin(180000, 190000)).toBe(false);
    expect(durationWithin(null, 180000)).toBe(false);
  });
});

describe('scoreMatch', () => {
  const query: Fingerprint = {
    artist: 'Radiohead',
    title: 'Paranoid Android',
    durationMs: 383000,
  };

  it('confidently matches the same track with a cosmetic title difference', () => {
    const candidate: Fingerprint = {
      artist: 'Radiohead',
      title: 'Paranoid Android (Remastered)',
      durationMs: 384000,
    };
    expect(isConfident(scoreMatch(candidate, query))).toBe(true);
  });

  it('rejects a different track by the same artist', () => {
    const candidate: Fingerprint = {
      artist: 'Radiohead',
      title: 'Karma Police',
      durationMs: 261000,
    };
    expect(isConfident(scoreMatch(candidate, query))).toBe(false);
  });

  it('rejects a same-title track of a very different length', () => {
    const candidate: Fingerprint = {
      artist: 'Radiohead',
      title: 'Paranoid Android',
      durationMs: 600000,
    };
    expect(isConfident(scoreMatch(candidate, query))).toBe(false);
  });
});

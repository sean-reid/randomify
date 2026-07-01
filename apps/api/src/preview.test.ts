import { describe, expect, it } from 'vitest';
import { resolvePreview, isDeezerPreviewUrl, type PreviewFetch } from './preview.js';

const ok = (body: unknown): PreviewFetch => {
  const fn = ((url: string) => {
    (fn as PreviewFetch & { url?: string }).url = url;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  }) as PreviewFetch & { url?: string };
  return fn;
};

describe('resolvePreview', () => {
  it('returns a fresh preview URL for a track', async () => {
    const fn = ok({
      id: 123,
      preview: 'https://cdnt-preview.dzcdn.net/fresh.mp3?hdnea=exp',
    }) as PreviewFetch & {
      url?: string;
    };
    const outcome = await resolvePreview('123', fn);
    expect(fn.url).toBe('https://api.deezer.com/2.0/track/123');
    expect(outcome).toEqual({
      kind: 'ok',
      url: 'https://cdnt-preview.dzcdn.net/fresh.mp3?hdnea=exp',
    });
  });

  it('reports quota when Deezer returns error code 4 (throttled, HTTP 200)', async () => {
    const outcome = await resolvePreview(
      '1',
      ok({ error: { type: 'Exception', code: 4, message: 'Quota limit exceeded' } }),
    );
    expect(outcome).toEqual({ kind: 'quota' });
  });

  it('reports a deezer_error for other body errors (e.g. unknown track)', async () => {
    const outcome = await resolvePreview('1', ok({ error: { type: 'DataException', code: 800 } }));
    expect(outcome).toEqual({ kind: 'deezer_error', code: 800 });
  });

  it('reports none when the track has no preview', async () => {
    expect(await resolvePreview('1', ok({ id: 1, preview: '' }))).toEqual({ kind: 'none' });
  });

  it('reports http_error with the status on a non-ok response', async () => {
    const fn: PreviewFetch = () =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    expect(await resolvePreview('1', fn)).toEqual({ kind: 'http_error', status: 503 });
  });

  it('rejects a preview URL that is not on a Deezer CDN host', async () => {
    expect(await resolvePreview('1', ok({ preview: 'https://evil.example/x.mp3' }))).toEqual({
      kind: 'deezer_error',
    });
  });
});

describe('isDeezerPreviewUrl', () => {
  it('accepts https Deezer CDN hosts and rejects everything else', () => {
    expect(isDeezerPreviewUrl('https://cdnt-preview.dzcdn.net/a.mp3?hdnea=x')).toBe(true);
    expect(isDeezerPreviewUrl('https://cdns-preview-9.dzcdn.net/stream/b.mp3')).toBe(true);
    expect(isDeezerPreviewUrl('http://cdnt-preview.dzcdn.net/a.mp3')).toBe(false); // not https
    expect(isDeezerPreviewUrl('https://evil.example/dzcdn.net.mp3')).toBe(false); // host mismatch
    expect(isDeezerPreviewUrl('not a url')).toBe(false);
  });
});

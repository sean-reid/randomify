import { expect, test } from '@playwright/test';
import { SAMPLE_SPIN } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  // Stand in for the API so the UI is exercised deterministically.
  await page.route('**/spin*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_SPIN),
    });
  });
});

test('shows a song with player and links on load', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'randomify' })).toBeVisible();
  await expect(page.getByTestId('title')).toHaveText(SAMPLE_SPIN.song.title);
  await expect(page.getByText(SAMPLE_SPIN.song.artist)).toBeVisible();

  // Player surfaces when the song has a preview.
  await expect(page.getByTestId('controls')).toBeVisible();
  await expect(page.getByTestId('playpause')).toBeVisible();
  await expect(page.getByTestId('player-audio')).toBeAttached();

  const links = page.getByTestId('links').getByRole('link');
  await expect(links).toHaveCount(SAMPLE_SPIN.links.length);

  await page.screenshot({
    path: testInfo.outputPath(`result-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('shuffle discovers another song', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();

  let spins = 0;
  await page.route('**/spin*', async (route) => {
    spins += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_SPIN),
    });
  });

  await page.getByTestId('shuffle').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect.poll(() => spins).toBeGreaterThan(0);
});

test('hides the keyboard hint on touch devices', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  const hint = page.getByTestId('hint');
  if (testInfo.project.name === 'mobile') {
    await expect(hint).toBeHidden();
  } else {
    await expect(hint).toBeVisible();
  }
});

test('space toggles play/pause without shuffling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();

  let spins = 0;
  await page.route('**/spin*', async (route) => {
    spins += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_SPIN),
    });
  });

  const paused = () =>
    page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused);

  const before = await paused();
  await page.keyboard.press('Space');
  // Play state flips, and no new song was fetched.
  await expect.poll(paused).toBe(!before);
  expect(spins).toBe(0);
});

test('skips a song with no preview and shows the next playable one', async ({ page }) => {
  // The app is player-first, so a song with no preview is skipped, never shown.
  let n = 0;
  await page.route('**/spin*', async (route) => {
    n += 1;
    const noPreview = n === 1;
    const body = {
      ...SAMPLE_SPIN,
      song: {
        ...SAMPLE_SPIN.song,
        recordingId: noPreview ? 'no-prev-1' : 'good-1',
        title: noPreview ? 'No Preview Song' : 'Good Song',
        previewUrl: noPreview ? null : SAMPLE_SPIN.song.previewUrl,
      },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('title')).toHaveText('Good Song');
  await expect(page.getByTestId('playpause')).toBeEnabled();
});

test('skips a song whose preview is dead and shows the next playable one', async ({ page }) => {
  // The dead preview's proxy URL 404s; the manual-redirect preflight sees that
  // and the song is never committed to the deck.
  await page.route('**/dead-preview*', (route) =>
    route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' }),
  );

  let n = 0;
  await page.route('**/spin*', async (route) => {
    n += 1;
    const dead = n === 1;
    const body = {
      ...SAMPLE_SPIN,
      song: {
        ...SAMPLE_SPIN.song,
        recordingId: dead ? 'dead-1' : 'good-1',
        title: dead ? 'Dead Song' : 'Good Song',
        previewUrl: dead ? 'https://example.test/dead-preview.mp3' : SAMPLE_SPIN.song.previewUrl,
      },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('title')).toHaveText('Good Song');
});

test('browse backward and forward through the deck', async ({ page }) => {
  // Distinct songs per spin so navigation is observable.
  let n = 0;
  await page.route('**/spin*', async (route) => {
    n += 1;
    const body = {
      ...SAMPLE_SPIN,
      song: { ...SAMPLE_SPIN.song, recordingId: `rec-${n}`, title: `Song ${n}` },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('title')).toHaveText('Song 1');
  await expect(page.getByTestId('prev')).toBeDisabled();

  // Next at the front of the deck discovers a fresh song.
  await page.getByTestId('next').click();
  await expect(page.getByTestId('title')).toHaveText('Song 2');

  // Back replays the previous song; forward returns to it (no new fetch).
  await page.getByTestId('prev').click();
  await expect(page.getByTestId('title')).toHaveText('Song 1');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('title')).toHaveText('Song 2');
});

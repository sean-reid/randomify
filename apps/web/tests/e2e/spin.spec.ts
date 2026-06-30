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

test('a song without a preview shows no play affordance, links still work', async ({ page }) => {
  await page.route('**/spin*', async (route) => {
    const body = { ...SAMPLE_SPIN, song: { ...SAMPLE_SPIN.song, previewUrl: null } };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('playpause')).toBeDisabled();
  await expect(page.getByTestId('cover-toggle')).toHaveCount(0);
  await expect(page.getByTestId('links').getByRole('link')).toHaveCount(SAMPLE_SPIN.links.length);
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

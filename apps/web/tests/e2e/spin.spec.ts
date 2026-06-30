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

test('shows a song with links to every platform on load', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'randomify' })).toBeVisible();
  await expect(page.getByTestId('title')).toHaveText(SAMPLE_SPIN.song.title);
  await expect(page.getByText(SAMPLE_SPIN.song.artist)).toBeVisible();

  const links = page.getByTestId('links').getByRole('link');
  await expect(links).toHaveCount(SAMPLE_SPIN.links.length);

  await page.screenshot({
    path: testInfo.outputPath(`result-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('shuffling fetches another song', async ({ page }) => {
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
  expect(spins).toBeGreaterThan(0);
});

test('hides the space-key hint on touch devices', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  const hint = page.getByTestId('hint');
  if (testInfo.project.name === 'mobile') {
    await expect(hint).toBeHidden();
  } else {
    await expect(hint).toBeVisible();
  }
});

test('the space key triggers a shuffle', async ({ page }) => {
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

  await page.keyboard.press('Space');
  await expect.poll(() => spins).toBeGreaterThan(0);
});

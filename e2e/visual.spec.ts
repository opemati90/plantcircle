import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

// Screenshots at the design's reference size (390 × 844). Compare against the
// design canvas when changing layout; update with `npm run test:visual -- -u`.

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

for (const [name, path, ready] of [
  ['welcome', '/', 'Find your people.'],
  ['goals', '/?step=goals', 'What brings you here?'],
  ['city', '/?step=city', 'Where are you based?'],
  ['plan', '/plans/cooking-night', 'West African Cooking Night'],
  ['signup', '/signup', 'Create your account'],
] as const) {
  test(name, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: ready })).toBeVisible();
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}

test('home (signed in, with an upcoming Plan)', async ({ page }) => {
  await signInWithEmail(page, '/plans/sunday-potluck?join=1');
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: /Up next/ })).toBeVisible();
  await expect(page).toHaveScreenshot('home.png');
});

test('plan (going)', async ({ page }) => {
  await signInWithEmail(page, '/plans/cooking-night?join=1');
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page).toHaveScreenshot('plan-going.png');
});

test('plan (sign-up sheet)', async ({ page }) => {
  await page.goto('/plans/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveScreenshot('plan-sheet.png');
});

test('plan (RSVP failed)', async ({ page }) => {
  await signInWithEmail(page, '/plans/cooking-night');
  await page.evaluate(() => window.__pcFixtures?.failNext('joinPlan'));
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveScreenshot('rsvp-error.png');
});

test('verify email', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByLabel('6-digit code').fill('4819');
  await expect(page).toHaveScreenshot('verify.png', {
    // The resend countdown changes every second.
    mask: [page.getByText(/Resend in/)],
  });
});

import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail, dismissNotificationPrompt } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('signed out, My Plans asks the visitor to sign in instead of listing anything', async ({
  page,
}) => {
  await page.goto('/my-plans');
  await expect(page.getByRole('heading', { name: 'Sign in to see your Plans' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/sign-up/);
});

test('a joined Plan appears under Going, and a waitlisted one shows its place in line', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');

  await page.getByRole('link', { name: /West African Cooking Night/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();

  // Home shows what the person joined, with the full list one link away.
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Your Plans' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /^West African Cooking Night Sat 17:00 · Neukölln Going/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'See all, My Plans' }).click();
  await expect(page).toHaveURL(/my-plans/);
  await expect(page.getByRole('tab', { name: 'Going' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toContainText(
    'Going',
  );

  await page.goto('/plan/ramen-workshop');
  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();

  await page.goto('/my-plans');
  await expect(page.getByRole('link', { name: /Vegan Ramen Workshop/ })).toContainText(
    'Waitlist · 4th',
  );
});

test('the Hosting and Past tabs each say what they show, and Hosting leads to creating a Plan', async ({
  page,
}) => {
  await signInWithEmail(page, '/my-plans');

  await page.getByRole('tab', { name: 'Hosting' }).click();
  await expect(page.getByRole('heading', { name: 'Host your first Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a Plan' }).click();
  // Without a home city, creating a Plan asks for one first.
  await expect(
    page.getByRole('heading', { name: 'Choose your home city first, then you can host.' }),
  ).toBeVisible();

  await page.goto('/my-plans');
  await page.getByRole('tab', { name: 'Past' }).click();
  await expect(page.getByRole('heading', { name: 'No past Plans yet' })).toBeVisible();
});

test('a guest who is going can bring a friend with the Plan’s link', async ({ page }) => {
  await signInWithEmail(page, '/plan/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Bring a friend' }).click();
  await expect(page.getByText('Message copied. Send it to a friend.')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('https://plantcircle.app/p/cooking-night');
});

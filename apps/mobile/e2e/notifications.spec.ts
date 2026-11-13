import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('the first RSVP asks for notifications once, and the join shows up under Updates in the Inbox', async ({ page }) => {
  await signInWithEmail(page, '/plan/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Never miss a spot' })).toBeVisible();
  await expect(page.getByText('Quiet from 22:00 to 08:00', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();

  // Not asked again on the next join.
  await page.goto('/plan/sunday-potluck');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Never miss a spot' })).toHaveCount(0);

  await page.goto('/inbox');
  await page.getByRole('tab', { name: /Updates/ }).click();
  const row = page.getByRole('link', { name: /You’re going to West African Cooking Night/ });
  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(/Unread/);
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('link', { name: /You’re going to West African Cooking Night/ })).not.toHaveAccessibleName(/Unread/);
  await page.getByRole('link', { name: /You’re going to West African Cooking Night/ }).click();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
});

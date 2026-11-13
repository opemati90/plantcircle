import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail, type FixtureWindow } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a city with nothing this week invites you to start a Plan and to join online from home', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: /Change city/ }).click();
  await page.getByRole('radio', { name: 'Porto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Be the first in Porto' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Start your own Plan/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join from home' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Vegan Feijoada \(online\)/ })).toBeVisible();
  await page.getByRole('link', { name: /Start your own Plan/ }).click();
  await expect(page).toHaveURL(/create/);
});

test('a server error says your Plans still work and leads to My Plans', async ({ page }) => {
  await signInWithEmail(page, '/my-plans');
  await page.addInitScript(() => {
    (window as FixtureWindow).__pcFixtureFailures = { getPlan: 50 };
  });
  await page.goto('/plan/cooking-night');
  await expect(page.getByRole('link', { name: /Your Plans still work/ })).toBeVisible();
  await page.getByRole('link', { name: /Your Plans still work/ }).click();
  await expect(page).toHaveURL(/my-plans/);
});

import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('Home can go back to Anywhere after choosing a city', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('radio', { name: 'Berlin' }).click();
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();

  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('radio', { name: 'Anywhere' }).click();
  await expect(page.getByRole('heading', { name: 'This week', exact: true })).toBeVisible();
});

test('Explore can show every city in a country', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Browse another city' }).click();
  await page.getByRole('radio', { name: 'All in Germany' }).click();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();

  await page.getByRole('button', { name: 'Browse another city' }).click();
  await page.getByRole('radio', { name: 'All in Portugal' }).click();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { chooseCity, freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('browsing another city in Explore does not change the home city', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Browse another city' }).click();
  await chooseCity(page, 'Lisbon');
  await expect(page.getByRole('button', { name: 'Browse another city' })).toContainText(
    'Lisbon',
  );
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toHaveCount(0);

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change city' })).toContainText('Anywhere');
});

test('Anywhere in Explore lists Plans from every city', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Browse another city' }).click();
  await page.getByRole('radio', { name: 'Anywhere' }).click();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
});

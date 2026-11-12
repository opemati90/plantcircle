import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('typing in the city picker narrows the list, by city or by country', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  const search = page.getByRole('textbox', { name: 'Search cities' });
  await search.fill('lis');
  await expect(page.getByRole('radio', { name: 'Lisbon' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Berlin' })).toHaveCount(0);

  await search.fill('germ');
  await expect(page.getByRole('radio', { name: 'Berlin' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Lisbon' })).toHaveCount(0);

  await search.fill('zzz');
  await expect(page.getByText('No city matches “zzz”')).toBeVisible();
});

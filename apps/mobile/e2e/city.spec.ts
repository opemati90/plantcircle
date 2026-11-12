import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('Home city can be changed from the city chip, and the title follows it', async ({
  page,
}) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Change city' })).toBeVisible();
  await page.getByRole('radio', { name: 'Lisbon' }).click();
  await expect(page.getByRole('heading', { name: 'This week in Lisbon' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change city' })).toContainText('Lisbon');
});

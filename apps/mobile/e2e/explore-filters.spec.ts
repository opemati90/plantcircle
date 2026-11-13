import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('the Filters sheet narrows Plans by where and price, shows active chips, and clears', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Where' }).getByRole('radio', { name: 'Online' }).click();
  await expect(page.getByRole('button', { name: /Show results \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: /Show results/ }).click();

  await expect(page.getByRole('link', { name: /Vegan Feijoada \(online\)/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'PLANS · 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters, 1 active' })).toBeVisible();

  // A filter with nothing behind it shows the no-results page with a way to host and words to try.
  await page.getByRole('button', { name: 'Filters, 1 active' }).click();
  await page.getByRole('radiogroup', { name: 'Price' }).getByRole('radio', { name: 'Paid' }).click();
  await expect(page.getByRole('button', { name: /Show results \(0\)/ })).toBeVisible();
  await page.getByRole('button', { name: /Show results/ }).click();
  await expect(page.getByRole('heading', { name: 'Nothing matches those filters' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove filter Paid' }).click();
  await expect(page.getByRole('link', { name: /Vegan Feijoada \(online\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Filters, 1 active' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: /Show results/ }).click();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();

  // Trying a word from the no-results page searches for it.
  await page.getByRole('textbox', { name: 'Search' }).fill('tempeh');
  await expect(page.getByRole('heading', { name: 'No Plans match “tempeh”' })).toBeVisible();
  await page.getByRole('button', { name: 'potluck' }).click();
  await expect(page.getByRole('link', { name: /Sunday Community Potluck/ })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('an organizer shares a group order and a member registers non-binding interest', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('radio', { name: 'Berlin', exact: true }).click();
  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await page.getByRole('link', { name: /Group order/ }).click();

  await expect(page.getByRole('heading', { name: 'Where are you ordering from?' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Supplier' }).fill('Organic farm shop');
  await page.getByRole('textbox', { name: 'Title' }).fill('Bulk chickpeas and lentils');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('textbox', { name: 'Item 1' }).fill('Chickpeas');
  await page.getByRole('textbox', { name: 'Target 1' }).fill('50');
  await page.getByRole('textbox', { name: 'Est. price per unit (optional) 1' }).fill('2.20');
  await expect(page.getByText('50 kg · ≈')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('radiogroup', { name: 'Interest closes' }).getByRole('radio').nth(2).click();
  await page.getByRole('radiogroup', { name: 'Pickup starts' }).getByRole('radio').nth(4).click();
  await page.getByRole('textbox', { name: 'Pickup address' }).fill('Weserstraße 1, courtyard');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Ready to share' })).toBeVisible();
  await expect(page.getByText(/PlantCircle doesn’t handle money/)).toBeVisible();
  await page.getByRole('button', { name: 'Share group order' }).click();

  await expect(page.getByRole('heading', { name: 'Bulk chickpeas and lentils' })).toBeVisible();
  await expect(page.getByText('of 50 kg')).toBeVisible();
  await page.getByRole('button', { name: 'More Chickpeas' }).click();
  await page.getByRole('button', { name: 'More Chickpeas' }).click();
  await expect(page.getByText('2 kg', { exact: true })).toBeVisible();
  await expect(page.getByText('≈ €4.40')).toBeVisible();
  await page.getByRole('button', { name: 'Count me in' }).click();
  await expect(page.getByRole('button', { name: 'Update my amount' })).toBeVisible();
  await expect(page.getByText('1 neighbours', { exact: false })).toBeVisible();
  await expect(page.getByText(/You pay .* directly at pickup/)).toBeVisible();
});

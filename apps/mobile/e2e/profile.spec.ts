import { expect, test } from '@playwright/test';
import { chooseCity, freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member edits their name, home city and interests from Profile', async ({ page }) => {
  await signInWithEmail(page, '/profile');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Lena Ko');
  await page.getByRole('checkbox', { name: 'Buy food together' }).click();
  await page.getByRole('button', { name: /^Home city/ }).click();
  await chooseCity(page, 'Hamburg');
  await expect(page.getByRole('button', { name: /^Home city: Hamburg/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByText('Lena Ko')).toBeVisible();
  await expect(page.getByText('Hamburg')).toBeVisible();
});

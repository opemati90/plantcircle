import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a host checks a guest in, undoes it, and sees the summary change', async ({ page }) => {
  // A Plan is published in the home city, so the host picks one first.
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('radio', { name: 'Berlin', exact: true }).click();

  // Two hours ahead: check-in is already open, and End Plan is not yet.
  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await page.getByRole('radio', { name: 'Cooking night' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Lentil night');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(0).click();
  await page.getByRole('radio', { name: '21:00' }).click();
  await page.getByRole('radio', { name: '120 min' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Area' }).fill('Neukölln');
  await page.getByRole('textbox', { name: 'Exact address' }).fill('Weserstraße 1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('heading', { name: 'Your Plan is live' })).toBeVisible();

  await page.getByRole('button', { name: 'Manage' }).click();
  await expect(page.getByRole('heading', { name: 'Manage this Plan' })).toBeVisible();
  await expect(page.getByText('Mia K.')).toBeVisible();
  await expect(page.getByText('Lena', { exact: true })).toBeVisible();
  await expect(page.getByText('On the waitlist')).toBeVisible();
  await expect(page.getByText('You can end the Plan once it starts.')).toBeVisible();

  await page.getByRole('button', { name: 'Check in Mia K.' }).click();
  await expect(page.getByRole('button', { name: 'Undo check-in for Mia K.' })).toBeVisible();
  await expect(page.getByText('Checked in', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Undo check-in for Mia K.' }).click();
  await expect(page.getByRole('button', { name: 'Check in Mia K.' })).toBeVisible();
});

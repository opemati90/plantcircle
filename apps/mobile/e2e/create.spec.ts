import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member publishes an in-person cooking night, then sees its share link', async ({ page }) => {
  // A Plan is published in the member's home city, so the member picks one first.
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('radio', { name: 'Berlin', exact: true }).click();
  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await page.getByRole('radio', { name: 'Cooking night' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('textbox', { name: 'Title' }).fill('Lentil night');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Two days ahead, so the first evening is comfortably more than an hour away.
  await page.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(2).click();
  await page.getByRole('radio', { name: '18:00' }).click();
  await page.getByRole('radio', { name: '120 min' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('textbox', { name: 'Area' }).fill('Neukölln');
  await page.getByRole('textbox', { name: 'Exact address' }).fill('Weserstraße 1');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();

  await expect(page.getByRole('heading', { name: 'Your Plan is live' })).toBeVisible();
  await expect(page.getByText('plantcircle.app/p/')).toBeVisible();
});

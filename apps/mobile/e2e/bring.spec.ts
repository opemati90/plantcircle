import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a host adds an item to bring, changes it, and sees how many are brought', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('radio', { name: 'Berlin', exact: true }).click();

  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await page.getByRole('radio', { name: 'Potluck' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Potluck in the park');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(0).click();
  await page.getByRole('radio', { name: '21:00' }).click();
  await page.getByRole('radio', { name: '120 min' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Area' }).fill('Tempelhofer Feld');
  await page.getByRole('textbox', { name: 'Exact address' }).fill('Tempelhofer Damm');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('button', { name: 'Manage' }).click();

  await page.getByRole('button', { name: 'Add something' }).click();
  await page.getByRole('textbox', { name: 'What to bring' }).fill('Sourdough');
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Sourdough')).toBeVisible();
  await expect(page.getByText('0 of 2 brought')).toBeVisible();

  await page.getByRole('button', { name: 'Change Sourdough' }).click();
  await page.getByRole('textbox', { name: 'What to bring' }).fill('Rye bread');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Rye bread')).toBeVisible();
  await expect(page.getByText('Sourdough')).toHaveCount(0);
});

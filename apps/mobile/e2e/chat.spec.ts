import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a Circle member sends a message and sees it in the chat', async ({ page }) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.getByRole('button', { name: 'Circle chat' }).click();
  await expect(page.getByRole('heading', { name: 'No messages yet' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Write a message' }).fill('  Sunday soup?  ');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Sunday soup?', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Write a message' })).toHaveValue('');
});

test('a host opens the Plan chat from Manage and posts to it', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Plan chat' }).click();
  await page.getByRole('textbox', { name: 'Write a message' }).fill('Bring a folding chair');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Bring a folding chair', { exact: true })).toBeVisible();
});

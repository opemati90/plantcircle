import { expect, test } from '@playwright/test';
import { chooseCity, freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member joins an open Circle and asks to join one that needs approval', async ({
  page,
}) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await expect(page.getByRole('link', { name: /Budget Plant Cooking/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Neukölln Plant Kitchen/ })).toBeVisible();

  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Budget Plant Cooking/ }).click();
  await page.getByRole('button', { name: 'Ask to join' }).click();
  // The request screen, as the CircleRequest design has it.
  await expect(page.getByText('LOCAL CIRCLE · APPROVAL NEEDED')).toBeVisible();
  await expect(page.getByText('Private Circle')).toBeVisible();
  await expect(page.getByText('Moderated by Jonas K.')).toBeVisible();
  await expect(page.getByText('THE MODERATORS ASK')).toBeVisible();
  await page.getByRole('textbox').fill('I cook on Sundays');
  await expect(page.getByText('17 / 300')).toBeVisible();
  await page.getByRole('button', { name: 'Request to join' }).click();
  await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible();
  await page.getByRole('button', { name: 'Open the Circle' }).click();
  await expect(page.getByRole('button', { name: 'Request sent' })).toBeVisible();
});

test('a member starts a Circle from Explore and lands on its page', async ({ page }) => {
  // A Circle belongs to a home city, so the member picks one first, then navigates in the app.
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await page.getByRole('tab', { name: 'Explore' }).click();
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('button', { name: 'Start a Circle' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Vegan bakers');
  await page.getByRole('button', { name: 'Create Circle' }).click();
  await expect(page.getByRole('heading', { name: 'Vegan bakers' })).toBeVisible();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
});

test('an owner reviews a request to their Circle and approves it', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await page.getByRole('tab', { name: 'Explore' }).click();
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('button', { name: 'Start a Circle' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Pickling party');
  await page.getByRole('radio', { name: /With approval/ }).click();
  await page.getByRole('button', { name: 'Create Circle' }).click();

  // Approvals live in the About tab, as the design has them.
  await page.getByRole('tab', { name: 'About', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Moderator: 1 join request/ })).toBeVisible();
  await expect(page.getByText('Mia K.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('No one is waiting right now.')).toBeVisible();
});

test('a member can leave a Circle', async ({ page }) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
  await page.getByRole('button', { name: 'Leave Circle' }).click();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  await expect(page.getByText('You’re a member')).toHaveCount(0);
});

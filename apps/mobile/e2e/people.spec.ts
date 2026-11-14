import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member connects back with someone in a shared Circle who asked first', async ({
  page,
}) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.goto('/explore');
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await expect(page.getByText('Mia K.')).toBeVisible();
  await page.getByRole('button', { name: 'Connect back' }).click();
  // Once connected, the row offers Message in place of the connect action.
  await expect(page.getByRole('button', { name: 'Message Mia K.' })).toBeVisible();
});

test('the People choice is off by default and can be turned on from Profile', async ({
  page,
}) => {
  // The People choice lives under Profile → Privacy.
  await signInWithEmail(page, '/profile');
  await page.getByRole('link', { name: 'Privacy' }).click();
  const choice = page.getByRole('switch', { name: 'Show me in People' });
  // The switch is disabled until the profile has loaded; wait for it before reading its state.
  await expect(choice).toBeEnabled();
  await expect(choice).not.toBeChecked();
  await choice.click();
  await expect(choice).toBeChecked();
});

test('a visitor who is not signed in is asked to sign in, not shown an error', async ({
  page,
}) => {
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to see people' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
});

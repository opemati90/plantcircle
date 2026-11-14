import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a message request leads to the sender’s profile, where it can be answered', async ({
  page,
}) => {
  // Profiles are shown only to people who share a Circle.
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
  await page.goto('/messages/requests');
  await page.getByRole('link', { name: 'See Mia K.’s profile' }).click();
  await expect(page.getByRole('heading', { name: 'Mia K.' })).toBeVisible();
  await expect(page.getByText('Host · level 2')).toBeVisible();
  await expect(page.getByText('Plans hosted')).toBeVisible();
  await expect(page.getByText('Circles you share')).toBeVisible();
  await expect(page.getByText('Hi, are you bringing the lentils?').last()).toBeVisible();
  await expect(
    page.getByText(/Exact location, diet and contact details are never shown/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Accept Mia K.' }).click();
  await expect(page).toHaveURL(/chat\/direct/);
});

test('a profile link asks a signed-out visitor to sign in', async ({ page }) => {
  await page.goto('/person/fixture-mia-k');
  await expect(page.getByRole('heading', { name: 'Sign in to see people' })).toBeVisible();
});

test('an unknown person shows a clear dead end with a way back', async ({ page }) => {
  await signInWithEmail(page, '/person/nobody');
  await expect(
    page.getByRole('heading', { name: 'This profile isn’t available' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' }).last()).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a message request leads to the sender’s profile, where it can be answered', async ({
  page,
}) => {
  await signInWithEmail(page, '/messages/requests');
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

test('an unknown person shows a clear dead end with a way back', async ({ page }) => {
  await signInWithEmail(page, '/person/nobody');
  await expect(
    page.getByRole('heading', { name: 'This profile isn’t available' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' }).last()).toBeVisible();
});

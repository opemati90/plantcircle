import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member accepts a first-message request, then chats with that person and mutes the chat', async ({
  page,
}) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.goto('/explore');
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await page.getByRole('link', { name: 'Message requests' }).click();
  await expect(page.getByText('Hi, are you bringing the lentils?')).toBeVisible();
  // Accepting opens the chat, with the first message already in it.
  await page.getByRole('button', { name: 'Accept Mia K.' }).click();
  await expect(page.getByText('Hi, are you bringing the lentils?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Mute for 8 hours' }).click();
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
});

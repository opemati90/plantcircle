import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('the inbox lists a joined Circle and the request, filters by kind, and opens the chat', async ({
  page,
}) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  // The Circle page has no tab bar, so go through Explore's.
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Inbox' }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByRole('link', { name: '1 message request' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Neukölln Plant Kitchen\. No messages yet/ }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Direct', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await expect(page.getByRole('heading', { name: 'Circle chat' })).toBeVisible();
});

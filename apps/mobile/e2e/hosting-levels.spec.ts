import { expect, test } from '@playwright/test';
import {
  chooseCity,
  enableAllFeatures,
  freezeTime,
  signInWithEmail,
  type FixtureWindow,
} from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('hosting opens after three posts: online first, in person once the account is two weeks old', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.setHostStats({ posts: 1, accountDays: 3 }),
  );
  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Share 3 dishes first' })).toBeVisible();
  await expect(page.getByText('1 of 3 shared')).toBeVisible();
  await page.getByRole('button', { name: 'Share what you cooked' }).click();
  await expect(page.getByRole('heading', { name: 'Share what you cooked' })).toBeVisible();

  // Three posts: online Plans, up to 12 spots; in person waits for a two-week-old account.
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.setHostStats({ posts: 3, accountDays: 3 }),
  );
  await page.goto('/create');
  await page.getByRole('radio', { name: 'Cooking night' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Lentil night');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(2).click();
  await page.getByRole('radio', { name: '18:00' }).click();
  await page.getByRole('radio', { name: '120 min' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('In-person Plans open two weeks after you join.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Online' })).toBeChecked();
  await page
    .getByRole('textbox', { name: 'Google Meet link' })
    .fill('https://meet.example.com/abc');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Up to 12 spots.')).toBeVisible();
});

test('the profile shows your cooking weeks and where hosting stands, with no levels at launch', async ({
  page,
}) => {
  await signInWithEmail(page, '/profile');
  await expect(page.getByText('Your cooking weeks')).toBeVisible();
  await expect(page.getByText('Share something you cooked this week')).toBeVisible();
  await expect(page.getByText('You can host Plans online and in person')).toBeVisible();
  await expect(page.getByText('Level 2', { exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.setHostStats({ posts: 1 }),
  );
  await page.reload();
  await page.getByRole('link', { name: 'Share 2 more dishes to host a Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Share what you cooked' })).toBeVisible();
});

test('with every part switched on, a recipe can be upvoted and its author followed', async ({
  page,
}) => {
  await enableAllFeatures(page);
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).first().click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
  await page.goto('/recipe/efo-riro-smoked-tofu');
  const upvote = page.getByRole('button', { name: /^Upvote, / });
  await expect(upvote).toHaveAccessibleName('Upvote, 38 upvotes');
  await expect(upvote).toHaveAttribute('aria-pressed', 'false');
  await upvote.click();
  await expect(upvote).toHaveAccessibleName('Upvote, 39 upvotes');
  await expect(upvote).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Follow Ama O.' }).click();
  await expect(page.getByRole('button', { name: 'Unfollow Ama O.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Upvote, / })).toHaveAccessibleName(
    'Upvote, 39 upvotes',
  );
  await expect(page.getByRole('button', { name: 'Unfollow Ama O.' })).toBeVisible();
});

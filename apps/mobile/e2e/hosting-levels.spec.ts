import { expect, test } from '@playwright/test';
import { chooseCity, freezeTime, signInWithEmail, type FixtureWindow } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member with no recipe cannot host yet; one recipe opens small online Plans', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.setHostStats({
      recipes: 0,
      hosted: 0,
      followers: 0,
      upvotes: 0,
    }),
  );
  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Share a recipe first' })).toBeVisible();
  await expect(page.getByText('Level 0', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Recipes shared' })).toBeVisible();
  await expect(page.getByText('0 of 1')).toBeVisible();

  // Level 1: online only, up to 6 spots; the in-person choice is locked and says why.
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.setHostStats({ recipes: 1 }),
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
  await expect(page.getByText('In-person Plans open at level 2.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Online' })).toBeChecked();
  await page
    .getByRole('textbox', { name: 'Google Meet link' })
    .fill('https://meet.example.com/abc');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Up to 6 spots at your level.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'More servings' })).toBeDisabled();
});

test('the profile shows the level and the next steps; a recipe can be upvoted and its author followed', async ({
  page,
}) => {
  await signInWithEmail(page, '/profile');
  await expect(page.getByText('Host', { exact: true })).toBeVisible();
  await expect(page.getByText('Level 2', { exact: true })).toBeVisible();
  await expect(page.getByText('NEXT: PILLAR')).toBeVisible();
  await expect(page.getByText('12 of 100')).toBeVisible();
  await expect(page.getByText('40 of 2,000')).toBeVisible();

  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
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
  // Both survive a reload: the fixture backend keeps them like the database would.
  await page.reload();
  await expect(page.getByRole('button', { name: /^Upvote, / })).toHaveAccessibleName(
    'Upvote, 39 upvotes',
  );
  await expect(page.getByRole('button', { name: 'Unfollow Ama O.' })).toBeVisible();
});

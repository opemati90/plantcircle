import { expect, test, type Page } from '@playwright/test';
import { freezeTime, signInWithEmail, type FixtureWindow } from './support';

/** Circle conversations (docs/superpowers/specs/2026-11-16-circle-conversations-design.md). */

async function joinKitchen(page: Page) {
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).first().click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member shares a question without a photo, and it shows in the Circle, not on Home', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.getByRole('tab', { name: 'Posts' }).click();
  await page.getByRole('button', { name: 'New post' }).click();
  await expect(page.getByRole('heading', { name: 'Share what you cooked' })).toBeVisible();
  await page.getByRole('radio', { name: 'Question' }).click();
  await expect(page.getByRole('heading', { name: 'Share with your Circle' })).toBeVisible();
  // No photo needed, and no challenge for a question.
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('Where do you buy good tempeh?');
  await page.getByRole('button', { name: 'Share with Neukölln Plant Kitchen' }).click();
  await expect(page.getByText('Shared with Neukölln Plant Kitchen')).toBeVisible();
  await expect(page.getByText('Where do you buy good tempeh?').last()).toBeVisible();
  // Ask how is for what someone cooked; comments are for everything.
  await expect(page.getByRole('button', { name: /^Ask .* how they made it$/ })).toHaveCount(0);
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Cooked in your Circles' })).toBeVisible();
  await expect(page.getByText('Where do you buy good tempeh?')).toHaveCount(0);
});

test('a Cooked post still needs a photo; a long text post is told how much is too much', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cook/new');
  await page.getByRole('textbox', { name: 'What did you make?' }).fill('Dal');
  await expect(
    page.getByRole('button', { name: 'Share with Neukölln Plant Kitchen' }),
  ).toBeDisabled();
  await expect(page.getByText('Add a photo to share.')).toBeVisible();
  await page.getByRole('radio', { name: 'Tip' }).click();
  await page.getByRole('textbox', { name: 'Your tip' }).fill('x'.repeat(200));
  await expect(
    page.getByRole('button', { name: 'Share with Neukölln Plant Kitchen' }),
  ).toBeEnabled();
  await page.getByRole('radio', { name: 'Cooked' }).click();
  await expect(page.getByText('60 characters too many').first()).toBeVisible();
});

test('members comment on a post, oldest first, and delete their own comment', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cook/cook-mia-efo');
  await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible();
  await expect(page.getByText('That looks amazing. Saving the idea for Sunday.')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Write a comment' })
    .fill('Which greens did you use?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Which greens did you use?')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Write a comment' })).toHaveValue('');
  // The count on the card follows.
  await expect(page.getByRole('link', { name: '2 comments' })).toBeVisible();
  await page.getByRole('button', { name: 'Comment options' }).last().click();
  await page.getByRole('button', { name: 'Delete comment' }).click();
  await page.getByRole('button', { name: 'Delete comment' }).last().click();
  await expect(page.getByText('Which greens did you use?')).toHaveCount(0);
});

test('a host removes a member’s post and comment; a member cannot', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cook/cook-ola-tip');
  await page.getByRole('button', { name: 'Post options' }).click();
  await expect(page.getByRole('button', { name: 'Remove post' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.makeModerator('neukolln-plant-kitchen'),
  );
  await page.reload();
  // A comment first.
  await expect(page.getByText('Tried it with cumin last night. You were right.')).toBeVisible();
  await page.getByRole('button', { name: 'Comment options' }).first().click();
  await page.getByRole('button', { name: 'Remove comment' }).click();
  await expect(
    page.getByText('Its author is told. Only they will still see it.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Tried it with cumin last night. You were right.')).toHaveCount(
    0,
  );
  // Then the post: it leaves the Circle's feed.
  await page.getByRole('button', { name: 'Post options' }).click();
  await page.getByRole('button', { name: 'Remove post' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  // The post screen closes once it is removed.
  await expect(page).toHaveURL(/\/home/);
  await page.goto('/circle/neukolln-plant-kitchen?tab=posts');
  await expect(
    page.getByText('Efo riro for six, with extra smoked tofu').first(),
  ).toBeVisible();
  await expect(page.getByText(/Toast whole spices/)).toHaveCount(0);
});

test('comment notices have their own switch in Notifications', async ({ page }) => {
  await signInWithEmail(page, '/profile');
  await page.goto('/profile/notifications');
  const toggle = page.getByRole('switch', { name: /Comments on your posts/ });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

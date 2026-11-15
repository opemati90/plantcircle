import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { freezeTime, signInWithEmail, type FixtureWindow } from './support';

const PHOTO = join(__dirname, '../../../supabase/tests/fixtures/gps.jpg');
/** Optional folder for screenshots of each screen (visual review). */
const rawShots: unknown = process.env.PC_SHOTS;
const SHOTS = typeof rawShots === 'string' ? rawShots : undefined;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function joinKitchen(page: Page) {
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('Home shows what your Circles cooked, and the feed ends rather than scrolls', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await expect(page.getByRole('heading', { name: 'Cooked in your Circles' })).toBeVisible();
  // Not in a Circle yet: an invitation instead of posts.
  await expect(page.getByText('Cooked something today?')).toBeVisible();
  await joinKitchen(page);
  await page.goto('/home');
  await expect(
    page.getByRole('link', { name: /Efo riro for six, with extra smoked tofu, Mia K\./ }),
  ).toBeVisible();
  await shot(page, 'home');
  await page.getByRole('link', { name: 'See all, Cooked in your Circles' }).click();
  await expect(page.getByRole('heading', { name: 'Cooked in your Circles' })).toBeVisible();
  await expect(
    page.getByText('Sunday batch: three jars of chickpea stew for the week').last(),
  ).toBeVisible();
  // A post from a Circle the member is not in never shows.
  await expect(page.getByText('Dal for twelve under €15')).toHaveCount(0);
  await expect(page.getByText('You’re all caught up')).toBeVisible();
  await shot(page, 'feed');
});

test('Yum toggles with its count, and Ask how opens a chat with an editable draft', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cooks');
  const yum = page.getByRole('button', { name: 'Yum, 7 yums' });
  await yum.click();
  await expect(page.getByRole('button', { name: 'Yum, 8 yums' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Yum, 8 yums' }).click();
  await expect(page.getByRole('button', { name: 'Yum, 7 yums' })).toBeVisible();
  await page.getByRole('link', { name: 'Recipe: Efo Riro with Smoked Tofu' }).click();
  await expect(page.getByRole('heading', { name: 'Efo Riro with Smoked Tofu' })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Ask Mia K. how they made it' }).click();
  await expect(page).toHaveURL(/chat\/direct\/fixture-mia-k/);
  await expect(page.getByRole('textbox').last()).toHaveValue(
    'Hi! How did you make your “Efo riro for six, with extra smoked tofu”?',
  );
});

test('sharing a photo: Circle first, photo, caption, recipe; then it can be deleted from Your posts', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cook/new');
  await expect(page.getByRole('heading', { name: 'Share what you cooked' })).toBeVisible();
  await expect(page.getByText('Sharing with Neukölln Plant Kitchen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Share with Neukölln Plant Kitchen' }),
  ).toBeDisabled();
  await shot(page, 'composer-empty');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a photo' }).click();
  await (await chooser).setFiles(PHOTO);
  await expect(page.getByRole('img', { name: 'Your photo' })).toBeVisible();
  await page.getByRole('textbox', { name: 'What did you make?' }).fill('Red lentil dal');
  await page.getByRole('button', { name: 'Link a recipe from this Circle' }).click();
  await page.getByRole('button', { name: /Efo Riro with Smoked Tofu/ }).click();
  await page.getByRole('button', { name: 'Describe the photo for screen readers' }).click();
  await page.getByRole('textbox', { name: 'Photo description' }).fill('A bowl of dal');
  await shot(page, 'composer-ready');
  await page.getByRole('button', { name: 'Share with Neukölln Plant Kitchen' }).click();

  await expect(page.getByText('Shared with Neukölln Plant Kitchen')).toBeVisible();
  await expect(page.getByText('Red lentil dal')).toBeVisible();
  await expect(page.getByRole('img', { name: 'A bowl of dal' })).toBeVisible();
  // Your own post: no Yum or Ask how for yourself.
  await expect(page.getByRole('button', { name: /^Yum/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Ask / })).toHaveCount(0);
  await shot(page, 'post-shared');

  await page.goto('/profile/posts');
  await expect(page.getByRole('heading', { name: 'Your posts' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete “Red lentil dal”' }).click();
  await page.getByRole('button', { name: 'Delete post' }).click();
  await page.getByRole('button', { name: 'Delete post' }).click();
  await expect(page.getByText(/Nothing shared yet/)).toBeVisible();
});

test('a post can be reported, and its author blocked, from the post’s options', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cooks');
  await page.getByRole('button', { name: 'Post options' }).first().click();
  await page.getByRole('button', { name: 'Report this post' }).click();
  await expect(page.getByRole('heading', { name: 'What’s going on?' })).toBeVisible();
  await expect(page.getByText(/About: Efo riro for six/)).toBeVisible();
  await page.goto('/cooks');
  await page.getByRole('button', { name: 'Post options' }).first().click();
  await page.getByRole('button', { name: 'Block Mia K.' }).click();
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByText('Efo riro for six, with extra smoked tofu')).toHaveCount(0);
});

test('the Circle’s Posts tab is its feed for members, and a teaser for everyone else', async ({
  page,
}) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('tab', { name: 'Posts' }).click();
  await expect(
    page.getByText('Members share what they cook here. Join to see it.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('Efo riro for six, with extra smoked tofu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share what you cooked' })).toBeVisible();
  await shot(page, 'circle-posts');
});

test('a recipe offers “I cooked this”, which starts a post linked to it', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/recipe/efo-riro-smoked-tofu');
  await page.getByRole('button', { name: 'I cooked this' }).click();
  await expect(page.getByRole('heading', { name: 'Share what you cooked' })).toBeVisible();
  await expect(page.getByText('Efo Riro with Smoked Tofu').last()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove Efo Riro with Smoked Tofu' }),
  ).toBeVisible();
});

test('a reported post reaches staff with its photo and caption', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await joinKitchen(page);
  await page.goto('/cooks');
  await page.getByRole('button', { name: 'Post options' }).first().click();
  await page.getByRole('button', { name: 'Report this post' }).click();
  await page.getByRole('radio', { name: 'Something else' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByRole('textbox', { name: 'What’s wrong with this post?' })
    .fill('This is not food.');
  await page.getByRole('checkbox', { name: /accurate and complete/ }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  const ref = (await page.getByText(/Case PC-\d+/).textContent())?.replace('Case ', '') ?? '';
  await page.evaluate(() => {
    (window as FixtureWindow).__pcFixtures?.makeStaff();
  });
  await page.goto('/console');
  await page.getByRole('button', { name: new RegExp(`${ref} · Something else`) }).click();
  await expect(page.getByText('POST', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'A table of shared dishes with greens and rice' }),
  ).toBeVisible();
  await expect(page.getByText('Efo riro for six, with extra smoked tofu').last()).toBeVisible();
});

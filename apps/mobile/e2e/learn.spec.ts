import { expect, test } from '@playwright/test';
import { chooseCity, freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member opens a shared recipe and rescales it, with the allergen state shown', async ({
  page,
}) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await page.getByRole('link', { name: /Efo Riro with Smoked Tofu/ }).click();
  await expect(page.getByRole('heading', { name: 'Efo Riro with Smoked Tofu' })).toBeVisible();
  await expect(page.getByText('500 g')).toBeVisible();
  await expect(
    page.getByText('Allergens not confirmed. Check every ingredient yourself.'),
  ).toBeVisible();

  // Four servings up, from 4 to 8: the 500 g spinach becomes 1,000 g.
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'More servings' }).click();
  }
  await expect(page.getByText('1,000 g')).toBeVisible();
});

test('a member shares a recipe into a Circle they are in', async ({ page }) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.goto('/recipe/new');
  await page.getByRole('radio', { name: 'Neukölln Plant Kitchen' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Lentil dal');
  await page.getByRole('textbox', { name: 'Ingredient 1' }).fill('Red lentils');
  await page.getByRole('textbox', { name: 'Amount 1' }).fill('250');
  await page.getByRole('textbox', { name: 'Unit 1' }).fill('g');
  await page
    .getByRole('textbox', { name: 'Step 1' })
    .fill('Simmer the lentils for 20 minutes.');
  await page.getByRole('button', { name: 'Skip it for now' }).click();
  await page.getByRole('button', { name: 'Share recipe' }).click();

  await expect(page.getByRole('heading', { name: 'Lentil dal' })).toBeVisible();
  await expect(
    page.getByText('Allergens not confirmed. Check every ingredient yourself.'),
  ).toBeVisible();
});

test('“Cook this together” starts a Plan from the recipe, prefilled and credited', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
  await page.goto('/recipe/efo-riro-smoked-tofu');
  await page.getByRole('button', { name: 'Cook this together' }).click();
  await expect(page.getByRole('radio', { name: 'Cooking night' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(
    'Cook Efo Riro with Smoked Tofu together',
  );
  await expect(
    page.getByText('Prefilled from Efo Riro with Smoked Tofu by Ama O.'),
  ).toBeVisible();
});

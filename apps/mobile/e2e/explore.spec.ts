import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('Explore lists the coming month of Plans and searches them as the member types', async ({
  page,
}) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Plans', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sunday Community Potluck/ })).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Search' });
  await search.fill('potluck');
  await expect(page.getByRole('link', { name: /Sunday Community Potluck/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toHaveCount(0);

  await search.fill('zzz');
  await expect(page.getByRole('heading', { name: 'No Plans match “zzz”' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
});

test('every Explore tab opens its own content', async ({ page }) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No recipes yet' })).toBeVisible();
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await expect(
    page.getByText('Only people who chose to be visible, from Circles you share.'),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'People', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

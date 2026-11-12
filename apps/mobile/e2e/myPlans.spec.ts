import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('signed out, My Plans asks the visitor to sign in instead of listing anything', async ({
  page,
}) => {
  await page.goto('/my-plans');
  await expect(page.getByRole('heading', { name: 'Sign in to see your Plans' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/sign-up/);
});

test('a joined Plan appears under Going, and a waitlisted one shows its place in line', async ({
  page,
}) => {
  await signInWithEmail(page, '/home');

  await page.getByRole('link', { name: /West African Cooking Night/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();

  await page.goto('/my-plans');
  await expect(page.getByRole('tab', { name: 'Going' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toContainText(
    'Going',
  );

  await page.goto('/plan/ramen-workshop');
  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();

  await page.goto('/my-plans');
  await expect(page.getByRole('link', { name: /Vegan Ramen Workshop/ })).toContainText(
    'Waitlist · 4th',
  );
});

test('the Hosting and Past tabs each say what they show, and Hosting leads to creating a Plan', async ({
  page,
}) => {
  await signInWithEmail(page, '/my-plans');

  await page.getByRole('tab', { name: 'Hosting' }).click();
  await expect(page.getByRole('heading', { name: 'Host your first Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a Plan' }).click();
  // Without a home city, creating a Plan asks for one first.
  await expect(
    page.getByRole('heading', { name: 'Choose your home city first, then you can host.' }),
  ).toBeVisible();

  await page.goto('/my-plans');
  await page.getByRole('tab', { name: 'Past' }).click();
  await expect(page.getByRole('heading', { name: 'No past Plans yet' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail, type FixtureWindow } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('sign-up waits for the age confirmation, and the under-18 path stores nothing', async ({
  page,
}) => {
  await page.goto('/sign-up?next=%2Fhome');
  await expect(page.getByRole('button', { name: 'Continue with email' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  await page.getByRole('link', { name: 'I’m under 18' }).click();
  await expect(page.getByRole('heading', { name: 'PlantCircle is for adults' })).toBeVisible();
  await expect(page.getByText('We haven’t saved any of your details.')).toBeVisible();
  await page.getByRole('button', { name: 'Browse public recipes' }).click();
  await expect(page).toHaveURL(/explore/);
  await page.goto('/under-18');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page).toHaveURL(/welcome/);
  expect(
    await page.evaluate(() =>
      (localStorage.getItem('pc.fixtures.v2') ?? '').includes('"session":{'),
    ),
  ).toBe(false);
});

test('a new required Terms version blocks the tabs until accepted; Profile shows the current terms otherwise', async ({
  page,
}) => {
  await signInWithEmail(page, '/profile');
  await page.getByRole('link', { name: 'Terms and community rules' }).click();
  await expect(
    page.getByText('You’re on the current versions. Read them any time.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Community Rules' })).toBeVisible();

  await page.evaluate(() => {
    (window as FixtureWindow).__pcFixtures?.publishTerms();
  });
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'We’ve updated our Terms' })).toBeVisible();
  await expect(
    page.getByText('3 things changed. They take effect on Monday, 2 November.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText('Paid workshops')).toBeVisible();
  await expect(page.getByRole('button', { name: /I don’t agree/ })).toBeVisible();
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page).toHaveURL(/home/);
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
});

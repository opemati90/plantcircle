import { expect, test } from '@playwright/test';
import { finishOnboarding, freezeTime, signInWithEmail } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('first run: browse, sign up with an email code, join, bring something, cancel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your people.' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();

  const goal = page.getByRole('button', { name: 'Cook and learn together' });
  await goal.click();
  await expect(goal).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Where are you based?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Value before account: Home is visible without signing in.
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();
  await page.getByRole('link', { name: /West African Cooking Night/ }).click();
  await expect(page.getByText('4 people are going')).toBeVisible();
  await expect(page.getByText('exact address after you join')).toBeVisible();

  await page.getByRole('button', { name: 'Join', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Save your spot' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: 'Use email instead' }).click();

  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('That code didn’t work');
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();

  // Back on the Plan, and the join the visitor asked for has been completed.
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page.getByText('You and 4 others are going')).toBeVisible();
  await expect(page.getByText('3 of 8 spots left')).toBeVisible();
  await expect(page.getByText('Address unlocks Friday, 17:00')).toBeVisible();
  await expect(page).toHaveURL(/\/plans\/cooking-night$/);

  await page.getByRole('button', { name: /I’ll bring it.*Plantains/ }).click();
  await expect(page.getByText('You’re bringing this')).toBeVisible();

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByText('Good evening, Lena')).toBeVisible();
  const upNext = page.getByRole('link', { name: /Up next/ });
  await expect(upNext).toContainText('Saturday 17:00');
  await upNext.click();

  await page.getByRole('button', { name: 'You’re going' }).click();
  await page.getByRole('button', { name: 'Cancel my spot' }).click();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  await expect(page.getByText('4 people are going')).toBeVisible();
  await expect(page.getByText('1 of 2 still open')).toBeVisible();
});

test('continue with Apple signs in and returns to the Plan', async ({ page }) => {
  await finishOnboarding(page);
  await page.goto('/plans/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
});

test('a failed RSVP is reported, holds no spot, and can be retried', async ({ page }) => {
  await signInWithEmail(page, '/plans/cooking-night');
  await page.evaluate(() => window.__pcFixtures?.failNext('joinPlan'));
  await page.getByRole('button', { name: 'Join', exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t save your RSVP');
  await expect(alert).toContainText('Your spot isn’t held yet');
  await expect(page.getByText('4 people are going')).toBeVisible();
  await expect(page.getByText('Check your connection')).toBeVisible();

  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a full Plan cannot be joined', async ({ page }) => {
  await signInWithEmail(page, '/plans/ramen-workshop');
  await expect(page.getByText('All 8 spots are taken')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full' })).toBeDisabled();
});

test('Home shows an error with a working retry when loading fails', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('failed-once')) {
      sessionStorage.setItem('failed-once', '1');
      window.__pcFixtureFailures = { listPlans: 2 };
    }
  });
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Can’t reach PlantCircle' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();
});

test('an unknown Plan shows a clear dead end, not a broken screen', async ({ page }) => {
  await page.goto('/plans/does-not-exist');
  await expect(page.getByRole('heading', { name: 'This Plan isn’t available' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('sign-in never redirects off-site', async ({ page }) => {
  await signInWithEmail(page, 'https://evil.example/phish');
  await expect(page).toHaveURL(/localhost:\d+\/home$/);
});

test('signing out returns Home to the anonymous state', async ({ page }) => {
  await signInWithEmail(page);
  await expect(page.getByText('Good evening, Lena')).toBeVisible();
  await page.getByRole('link', { name: 'Profile' }).first().click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Good evening', { exact: true })).toBeVisible();
});

test('Home filters narrow the list', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Social' }).click();
  await expect(page.getByRole('link', { name: /Sunday Community Potluck/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Online' }).click();
  await expect(page.getByText('No Plans match this filter this week.')).toBeVisible();
});

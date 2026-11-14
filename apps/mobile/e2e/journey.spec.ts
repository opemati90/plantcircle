import { expect, test } from '@playwright/test';
import { chooseCity } from './support';
import {
  freezeTime,
  signInWithEmail,
  type FixtureWindow,
  dismissNotificationPrompt,
} from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('first run: pick a city, browse, sign up with an email code, join, bring something, cancel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your people.' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();

  const goal = page.getByRole('checkbox', { name: 'Cook and learn together' });
  await goal.click();
  await expect(goal).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Cities come from data; nothing is preselected and Continue waits for a choice.
  await expect(page.getByRole('heading', { name: 'Where are you based?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await chooseCity(page, 'Berlin');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Value before account: Home is visible without signing in.
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();
  await page.getByRole('link', { name: /West African Cooking Night/ }).click();
  await expect(page.getByText('4 people are going')).toBeVisible();
  await expect(page.getByText('exact address after you join')).toBeVisible();

  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your spot' })).toBeVisible();
  await page.getByRole('link', { name: 'Use email instead' }).click();
  await expect(page.getByRole('heading', { name: 'Save your spot' })).toHaveCount(0);

  // Nothing continues before the age confirmation; then an empty email is caught inline.
  await expect(page.getByRole('button', { name: 'Continue with email' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I’m 18 or older' }).click();
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
  await page.getByRole('textbox', { name: '6-digit code' }).fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('That code didn’t work');
  await page.getByRole('textbox', { name: '6-digit code' }).fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  // The first sign-in asks the privacy choices once; the visitor keeps only what is needed.
  await page.getByRole('button', { name: 'Only needed' }).click();
  // The first RSVP asks for notifications once.
  await dismissNotificationPrompt(page);

  // Back on the Plan, and the join the visitor asked for has been completed.
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page.getByText('You and 4 others are going')).toBeVisible();
  await expect(page.getByText('3 of 8 spots left')).toBeVisible();
  await expect(page.getByText('Address unlocks Friday, 17:00')).toBeVisible();

  await page.getByRole('button', { name: 'I’ll bring it: Plantains' }).click();
  await expect(page.getByText('You’re bringing this')).toBeVisible();

  // Withdrawing frees the place again; bringing it once more keeps the rest of the journey as it was.
  await page.getByRole('button', { name: 'Withdraw Plantains' }).click();
  await expect(page.getByRole('button', { name: 'I’ll bring it: Plantains' })).toBeVisible();
  await page.getByRole('button', { name: 'I’ll bring it: Plantains' }).click();
  await expect(page.getByText('You’re bringing this')).toBeVisible();

  await page.goto('/home');
  await expect(page.getByText('Good evening, Lena')).toBeVisible();
  // Your Plans carries the nudge for the next Plan.
  await page
    .getByRole('link', { name: /^West African Cooking Night Sat 17:00 · Neukölln Going/ })
    .first()
    .click();

  await page.getByRole('button', { name: 'You’re going' }).click();
  await page.getByRole('button', { name: 'Cancel my spot' }).click();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  await expect(page.getByText('4 people are going')).toBeVisible();
  await expect(page.getByText('1 of 2 still open')).toBeVisible();
});

test('skipping the city shows Plans everywhere, with no city in the title', async ({
  page,
}) => {
  await page.goto('/city');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'This week', exact: true })).toBeVisible();
  await expect(page.getByText('Anywhere')).toBeVisible();
});

test('continue with Apple from the sheet signs in and joins', async ({ page }) => {
  await page.goto('/plan/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I’m 18 or older' }).click();
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
});

test('a failed RSVP is reported, holds no spot, and can be retried', async ({ page }) => {
  await signInWithEmail(page, '/plan/cooking-night');
  await page.evaluate(() => (globalThis as FixtureWindow).__pcFixtures?.failNext('joinPlan'));
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await dismissNotificationPrompt(page);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t save your RSVP');
  await expect(alert).toContainText('Your spot isn’t held yet');
  await expect(page.getByText('4 people are going')).toBeVisible();
  await expect(page.getByText('Check your connection')).toBeVisible();

  await alert.getByRole('button', { name: 'Retry' }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Home shows an error with a working retry when loading fails', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('failed-once')) {
      sessionStorage.setItem('failed-once', '1');
      (globalThis as FixtureWindow).__pcFixtureFailures = { listPlans: 2 };
    }
  });
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Can’t reach PlantCircle' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: /^This week/ })).toBeVisible();
});

test('an unknown Plan shows a clear dead end with a next step', async ({ page }) => {
  await page.goto('/plan/does-not-exist');
  await expect(page.getByRole('heading', { name: 'This Plan isn’t available' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('sign-in never redirects off-site', async ({ page }) => {
  await signInWithEmail(page, 'https://evil.example/phish');
  await expect(page).toHaveURL(/localhost:\d+\/home$/);
});

test('signing out returns Home to the anonymous state', async ({ page }) => {
  await signInWithEmail(page);
  await expect(page.getByText('Good evening, Lena')).toBeVisible();
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('Home filters narrow the list', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('radio', { name: 'Social' }).click();
  await expect(page.getByRole('link', { name: /Sunday Community Potluck/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Online' }).click();
  await expect(page.getByText('No Plans match this filter this week.')).toBeVisible();
});

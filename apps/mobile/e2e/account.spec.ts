import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

/** Signs in without answering the privacy choices, so the test can see them. */
async function signInToChoices(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/sign-up?next=%2Fhome');
  await page.getByRole('checkbox', { name: 'I’m 18 or older' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByRole('textbox', { name: '6-digit code' }).fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
}

test('the first sign-in asks the privacy choices once, with consent off by default', async ({
  page,
}) => {
  await signInToChoices(page);
  await expect(page.getByRole('heading', { name: 'Your privacy choices' })).toBeVisible();
  await expect(page.getByText('Always on')).toBeVisible();
  const analytics = page.getByRole('switch', { name: 'Help improve PlantCircle' });
  await expect(analytics).not.toBeChecked();
  await analytics.click();
  await page.getByRole('button', { name: 'Save choices' }).click();
  await expect(page).toHaveURL(/home/);
  // Dev fixtures persist a moment after the screen moves on; wait for that before a full reload.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (localStorage.getItem('pc.fixtures.v2') ?? '').includes('"analyticsConsent":true'),
      ),
    )
    .toBe(true);

  // Not asked again; the choice is kept and can be changed from Privacy.
  await page.goto('/profile/privacy');
  await page.getByRole('link', { name: /Your privacy choices/ }).click();
  await expect(page.getByRole('switch', { name: 'Help improve PlantCircle' })).toBeChecked();
  await page.getByRole('button', { name: 'Only needed' }).click();
  await expect(page).toHaveURL(/profile\/privacy/);
});

test('notification settings save switch by switch and keep changes always on', async ({
  page,
}) => {
  await signInToChoices(page);
  await page.getByRole('button', { name: 'Only needed' }).click();
  await page.goto('/profile');
  await page.getByRole('link', { name: 'Notifications' }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Changes and cancellations')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Changes and cancellations' })).toHaveCount(0);
  const direct = page.getByRole('switch', { name: 'Direct messages' });
  await expect(direct).toBeChecked();
  await direct.click();
  await expect(direct).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Direct messages' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: /Quiet hours, 22:00–08:00/ })).toBeChecked();
});

test('a copy of the data can be requested once, and deleting the account is a two-step choice that signs out', async ({
  page,
}) => {
  await signInToChoices(page);
  await page.getByRole('button', { name: 'Only needed' }).click();
  await page.goto('/profile');
  await page.getByRole('link', { name: 'Account and data' }).click();
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText(/We email a link within 48 h/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Requested' })).toBeDisabled();

  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Delete for good?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep my account' }).click();
  await expect(page.getByText('Delete for good?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Delete my account' }).last().click();
  await expect(page).toHaveURL(/welcome/);
  await page.goto('/profile/account');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('the accessibility statement names the standard, the gaps, and opens a report about the app', async ({
  page,
}) => {
  await signInToChoices(page);
  await page.getByRole('button', { name: 'Only needed' }).click();
  await page.goto('/profile/accessibility');
  await expect(page.getByText('WCAG 2.2: AA everywhere, AAA where possible')).toBeVisible();
  await expect(page.getByText('Known gap: waitlist offers')).toBeVisible();
  await page.getByRole('button', { name: 'Report a problem' }).click();
  await expect(page.getByRole('textbox', { name: 'What isn’t working?' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'What isn’t working?' })
    .fill('The day strip cannot be reached with VoiceOver.');
  await page.getByRole('checkbox', { name: /accurate and complete/ }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/Case PC-\d+/)).toBeVisible();
});

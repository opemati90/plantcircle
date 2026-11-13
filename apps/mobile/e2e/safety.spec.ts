import { expect, test } from '@playwright/test';
import { freezeTime, signInWithEmail, type FixtureWindow } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a member reports a Plan and gets a case reference, anonymously', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('link', { name: /West African Cooking Night/ }).click();
  await page.getByRole('link', { name: 'Report this Plan' }).click();

  await expect(page.getByRole('heading', { name: 'What’s going on?' })).toBeVisible();
  await expect(page.getByText('Call 112 (emergency) or 110 (police)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByRole('radio', { name: 'Unsafe place' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Tell us what happened' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send report' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'What’s wrong with this Plan?' }).fill('The address is a construction site with no lighting.');
  await expect(page.getByRole('button', { name: 'Send report' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /accurate and complete/ }).click();
  await page.getByRole('button', { name: 'Send report' }).click();

  await expect(page.getByRole('heading', { name: 'Thanks, we’re on it' })).toBeVisible();
  await expect(page.getByText(/Case PC-\d+/)).toBeVisible();
  await expect(page.getByText('They won’t know who reported them.')).toBeVisible();
  // A Plan report names no person, so there is nobody to block from here.
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/home/);
});

test('reporting a person can also block them; blocked people are listed under Privacy and can be unblocked', async ({ page }) => {
  await signInWithEmail(page, '/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();

  await page.goto('/explore');
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await page.getByRole('link', { name: 'Report Mia K.' }).click();
  await page.getByRole('radio', { name: 'Stalking or unwanted contact' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'What’s wrong with this person?' }).fill('Kept messaging after I said no.');
  await page.getByRole('checkbox', { name: /accurate and complete/ }).click();
  await page.getByRole('button', { name: 'Send report' }).click();

  const blockSwitch = page.getByRole('switch', { name: 'Also block Mia K.' });
  await expect(blockSwitch).not.toBeChecked();
  await blockSwitch.click();
  await expect(blockSwitch).toBeChecked();
  await expect(page.getByText('Mia K. is blocked. You can undo this under Privacy.')).toBeVisible();

  // Gone from People, listed under Privacy, and a way back.
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await expect(page.getByText('Mia K.')).toHaveCount(0);
  await page.goto('/profile/privacy');
  await page.getByRole('link', { name: /Blocked people/ }).click();
  await expect(page.getByText('Mia K.')).toBeVisible();
  await page.getByRole('button', { name: 'Unblock Mia K.' }).click();
  await expect(page.getByText('Nobody blocked')).toBeVisible();
});

test('a paused account sees the statement of reasons, cannot join, and can appeal once', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.evaluate(() => {
    (window as FixtureWindow).__pcFixtures?.suspend();
  });
  await page.reload();
  await page.getByRole('link', { name: 'Your account is paused. See why' }).click();

  await expect(page.getByRole('heading', { name: /Your account is paused until/ })).toBeVisible();
  await expect(page.getByText('Repeated messages after a member declined contact')).toBeVisible();
  await expect(page.getByText('Community Rules §3 — no unwanted contact')).toBeVisible();
  await expect(page.getByText('A person reviewed it; a tool only sorted the report.')).toBeVisible();
  await page.getByRole('button', { name: 'Appeal this decision' }).click();
  await page.getByRole('textbox', { name: 'Appeal this decision' }).fill('It was a group order question, not an ad.');
  await page.getByRole('button', { name: 'Send appeal' }).click();
  await expect(page.getByText('Your appeal is with a second reviewer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Other ways to challenge it' })).toBeVisible();

  // Writing is paused: joining a Plan is refused with the reason, reading still works.
  await page.goto('/home');
  await page.getByRole('link', { name: /Sunday Community Potluck/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('Posting, RSVPs and messaging are paused. See why under Profile.')).toBeVisible();
});

test('staff see the queue in the web console and apply a decision with a reason, which is logged', async ({ page }) => {
  await signInWithEmail(page, '/home');
  await page.getByRole('link', { name: /West African Cooking Night/ }).click();
  await page.getByRole('link', { name: 'Report this Plan' }).click();
  await page.getByRole('radio', { name: 'Scam or fraud' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'What’s wrong with this Plan?' }).fill('The host asked everyone to pay in advance to a personal account.');
  await page.getByRole('checkbox', { name: /accurate and complete/ }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  const ref = (await page.getByText(/Case PC-\d+/).textContent())?.replace('Case ', '') ?? '';

  // Members never reach the console.
  await page.goto('/console');
  await expect(page.getByText('Page not found')).toBeVisible();

  await page.evaluate(() => {
    (window as FixtureWindow).__pcFixtures?.makeStaff();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Safety console' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`${ref} · Scam or fraud`) }).click();
  await expect(page.getByText('The host asked everyone to pay in advance to a personal account.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose an action' })).toBeDisabled();
  await page.getByRole('radio', { name: 'Warn' }).click();
  await page.getByRole('textbox', { name: /^Reason/ }).fill('Advance payments outside the app are not allowed.');
  await page.getByRole('button', { name: 'Apply decision' }).click();
  await expect(page.getByText('Decision applied')).toBeVisible();
  await expect(page.getByText(/Warn · Advance payments/)).toBeVisible();

  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByText(/staff\.warn/)).toBeVisible();
  await expect(page.getByText('Advance payments outside the app are not allowed.')).toBeVisible();
});

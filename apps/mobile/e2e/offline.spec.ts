import { expect, test } from '@playwright/test';
import { dismissNotificationPrompt, signInWithEmail, type FixtureWindow } from './support';

// Real time here: the persister throttles writes by the clock, which a frozen clock never advances.

test('a joined Plan and My Plans stay readable offline from the saved copy, and changes wait', async ({ page }) => {
  await signInWithEmail(page, '/plan/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expect(page.getByText('Saved on this phone:', { exact: false })).toBeVisible();
  await page.goto('/my-plans');
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
  // Let the persisted cache catch up before the connection goes.
  await expect
    .poll(() => page.evaluate(() => { const c = localStorage.getItem('pc.query-cache') ?? ''; return c.includes('"myPlans"') && c.includes('"cooking-night"'); }), { timeout: 15_000 })
    .toBe(true);

  // Every fetch now fails as the network would: the saved copies show, with the bar.
  await page.addInitScript(() => {
    (window as FixtureWindow).__pcFixtureFailures = { getPlan: 50, listMyPlans: 50 };
  });
  await page.goto('/plan/cooking-night');
  await expect(page.getByRole('status').filter({ hasText: /You’re offline · saved at/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'West African Cooking Night' })).toBeVisible();
  await expect(page.getByText('Can’t change your RSVP')).toBeVisible();
  await expect(page.getByRole('button', { name: 'You’re going' })).toHaveCount(0);

  await page.goto('/my-plans');
  await expect(page.getByRole('status').filter({ hasText: /You’re offline/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /West African Cooking Night/ })).toBeVisible();
});

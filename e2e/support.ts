import { expect, type Page } from '@playwright/test';

/** Monday evening in Berlin, so fixture Plans land on Sat 7 / Sun 8 November as in the design. */
export const NOW = new Date('2026-11-02T19:00:00+01:00');

export async function freezeTime(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
}

export async function finishOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();
}

export async function signInWithEmail(page: Page, next = '/home'): Promise<void> {
  await page.goto(`/signup?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).not.toHaveURL(/verify/);
}

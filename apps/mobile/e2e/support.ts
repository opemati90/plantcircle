import { expect, type Page } from '@playwright/test';

/** Monday evening in Berlin, so sample Plans land on Sat 7 / Sun 8 November as in the prototype. */
export const NOW = new Date('2026-11-02T19:00:00+01:00');

type Operation =
  | 'listPlans'
  | 'getPlan'
  | 'joinPlan'
  | 'cancelRsvp'
  | 'claimBringItem'
  | 'joinWaitlist'
  | 'confirmOffer';
export interface FixtureWindow {
  __pcFixtures?: {
    failNext: (operation: Operation, times?: number) => void;
    freeSpot: (planId: string, offerMs?: number) => void;
  };
  __pcFixtureFailures?: Partial<Record<Operation, number>>;
}

export async function freezeTime(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
}

export async function signInWithEmail(page: Page, next = '/home'): Promise<void> {
  await page.goto(`/sign-up?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByRole('textbox', { name: '6-digit code' }).fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).not.toHaveURL(/verify/);
}

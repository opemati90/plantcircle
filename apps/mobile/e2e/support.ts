import { expect, type Page } from '@playwright/test';

/** Monday evening in Berlin, so sample Plans land on Sat 7 / Sun 8 November as in the prototype. */
export const NOW = new Date('2026-11-02T19:00:00+01:00');

type Operation =
  | 'listPlans'
  | 'listMyPlans'
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
    suspend: () => void;
    makeStaff: () => void;
    publishTerms: () => void;
  };
  __pcFixtureFailures?: Partial<Record<Operation, number>>;
}

export async function freezeTime(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
}

export async function signInWithEmail(page: Page, next = '/home'): Promise<void> {
  await page.goto(`/sign-up?next=${encodeURIComponent(next)}`);
  await page.getByRole('checkbox', { name: 'I’m 18 or older' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByRole('textbox', { name: '6-digit code' }).fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).not.toHaveURL(/verify/);
  // The first sign-in asks the privacy choices once; "Only needed" is the default answer.
  if (page.url().includes('/privacy-choices')) {
    await page.getByRole('button', { name: 'Only needed' }).click();
    await expect(page).not.toHaveURL(/privacy-choices/);
  }
}

/** The notifications prompt follows the first RSVP; specs that join dismiss it when it shows. */
export async function dismissNotificationPrompt(page: Page): Promise<void> {
  const notNow = page.getByRole('button', { name: 'Not now' });
  await notNow.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined);
  if (await notNow.isVisible()) {
    await notNow.click();
    await expect(notNow).toHaveCount(0);
  }
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freezeTime, signInWithEmail, type FixtureWindow } from './support';

// Automated scan of the web rendering only. Screen-reader behaviour, Dynamic Type
// and Reduce Motion must be checked on devices (docs/09-accessibility.md).
const WCAG = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page, disabled: string[] = []): Promise<void> {
  // Let fade-in transitions finish so colours are measured at full opacity.
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page })
    .withTags(WCAG)
    .disableRules(disabled)
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`,
  );
  expect(summary).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

for (const [name, path, ready] of [
  ['welcome', '/', 'Find your people.'],
  ['goals', '/goals', 'What brings you here?'],
  ['city', '/city', 'Where are you based?'],
  ['home', '/home', 'This week'],
  ['plan', '/plan/cooking-night', 'West African Cooking Night'],
  ['sign up', '/sign-up', 'Create your account'],
  ['full plan', '/plan/ramen-workshop', 'Vegan Ramen Workshop'],
  ['not built', '/inbox', 'Inbox isn’t built yet'],
] as const) {
  test(`${name}: no automatically detectable WCAG violations (incl. 7:1 contrast)`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: ready })).toBeVisible();
    await expectNoViolations(page);
  });
}

test('verify-email, the joined Plan and the sign-up sheet have no detectable violations', async ({
  page,
}) => {
  await page.goto('/plan/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your spot' })).toBeVisible();
  // react-native-web's Modal puts aria-modal on a wrapper without a role (library markup).
  await expectNoViolations(page, ['aria-allowed-attr']);

  await page.goto('/sign-up');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expectNoViolations(page);

  await signInWithEmail(page, '/plan/cooking-night?join=1');
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expectNoViolations(page);
});

test('the waitlist offer screen has no detectable violations', async ({ page }) => {
  await signInWithEmail(page, '/plan/ramen-workshop');
  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.freeSpot('ramen-workshop'),
  );
  await page.goto('/plan/ramen-workshop/waitlist-offer');
  await expect(page.getByRole('heading', { name: 'A spot opened up for you' })).toBeVisible();
  await expectNoViolations(page);
});

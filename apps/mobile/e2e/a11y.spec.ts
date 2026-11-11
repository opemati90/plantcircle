import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

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
  ['goals', '/?step=goals', 'What brings you here?'],
  ['city', '/?step=city', 'Where are you based?'],
  ['home', '/home', 'This week'],
  ['plan', '/plans/cooking-night', 'West African Cooking Night'],
  ['sign up', '/signup', 'Create your account'],
  ['not built', '/explore', 'Explore isn’t built yet'],
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
  await page.goto('/plans/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your spot' })).toBeVisible();
  // react-native-web's Modal puts aria-modal on a wrapper without a role (library markup).
  await expectNoViolations(page, ['aria-allowed-attr']);

  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expectNoViolations(page);

  await signInWithEmail(page, '/plans/cooking-night?join=1');
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expectNoViolations(page);
});

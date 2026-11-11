import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { freezeTime, signInWithEmail } from './support';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`),
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

for (const [name, path, ready] of [
  ['welcome', '/', 'Find your people.'],
  ['goals', '/?step=goals', 'What brings you here?'],
  ['city', '/?step=city', 'Where are you based?'],
  ['home', '/home', 'This week in Berlin'],
  ['plan', '/plans/cooking-night', 'West African Cooking Night'],
  ['sign up', '/signup', 'Create your account'],
  ['not built', '/explore', 'Explore isn’t built yet'],
] as const) {
  test(`${name} has no automatically detectable WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: ready })).toBeVisible();
    await expectNoViolations(page);
  });
}

test('verify-email and the joined Plan have no detectable violations', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expectNoViolations(page);

  await signInWithEmail(page, '/plans/cooking-night?join=1');
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();
  await expectNoViolations(page);
});

test('the sign-up sheet traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/plans/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Save your spot' });
  await expect(sheet).toBeVisible();
  await expectNoViolations(page);
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    // Focus may cycle through the browser's own UI (body), but never the page behind.
    const escaped = await sheet.evaluate(
      (el) => !el.contains(document.activeElement) && document.activeElement !== document.body,
    );
    expect(escaped).toBe(false);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeFocused();
});

test('the whole first-run flow works with the keyboard alone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your people.' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Get started' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'What brings you here?' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cook and learn together' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Cook and learn together' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

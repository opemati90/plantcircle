import { expect, test } from '@playwright/test';

test('the app runs against the real project: no fixture banner, onboarding, city, Explore', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('supabase.co') && r.status() >= 500) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('/');
  await expect(page.getByText('Find your people.')).toBeVisible();
  await expect(page.getByText(/Dev fixtures/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('checkbox', { name: 'Cook and learn together' }).click().catch(async () => {
    await page.getByText('Cook and learn together').click();
  });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Search cities' }).fill('Berlin');
  await page.getByRole('button', { name: /Choose the country/ }).click();
  await page.getByRole('textbox', { name: 'Search countries' }).fill('Germ');
  await page.getByRole('radio', { name: 'Germany' }).click();
  await page.waitForTimeout(800);
  const use = page.getByRole('button', { name: /Use “Berlin” · Germany/ });
  if (await use.count()) await use.click();
  else await page.getByRole('radio', { name: 'Berlin', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // Home on the real backend: this week in Berlin, empty but not an error.
  await expect(page.getByRole('heading', { name: /This week in Berlin/ })).toBeVisible();
  await expect(page.getByText(/Something went wrong|Couldn’t load/)).toHaveCount(0);
  await page.goto('/explore');
  await expect(page.getByRole('tab', { name: 'Plans', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Circles', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Something went wrong|Couldn’t load/)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/staging-explore.png' });
  expect(failures).toEqual([]);
});

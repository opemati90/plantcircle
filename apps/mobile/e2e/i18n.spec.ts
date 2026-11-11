import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test.describe('on a German device', () => {
  test.use({ locale: 'de-DE' });

  test('the journey is in German, with German date formats', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Finde deine Leute.' })).toBeVisible();
    await page.getByRole('button', { name: 'Los geht’s' }).click();
    await expect(page.getByRole('heading', { name: 'Was führt dich her?' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Zusammen kochen und lernen' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Country names are localised too.
    await page.getByRole('radio', { name: /Berlin.*Deutschland/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: 'Diese Woche in Berlin' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Pläne' })).toBeVisible();
    await expect(page.getByText('KOCHKURS · KOSTENLOS', { exact: false })).toBeVisible();
    await expect(page.getByText('Noch 4 Plätze')).toBeVisible();

    await page.getByRole('link', { name: /West African Cooking Night/ }).click();
    await expect(page.getByText('Samstag, 7. November')).toBeVisible();
    // Home stays mounted underneath the Plan in the navigation stack, so take the top-most match.
    await expect(page.getByText('4 dabei', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Noch 4 von 8 Plätzen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dabei sein' })).toBeVisible();
  });
});

test('the language can be changed on the welcome screen and is remembered', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Language: English' }).click();
  await page.getByRole('radio', { name: 'Deutsch' }).click();
  await expect(page.getByRole('heading', { name: 'Finde deine Leute.' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Finde deine Leute.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sprache: Deutsch' })).toBeVisible();
});

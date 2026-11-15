import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  chooseCity,
  dismissNotificationPrompt,
  freezeTime,
  signInWithEmail,
} from '../e2e/support';

/** Raw screens for the store kit; store/compose.mjs frames them. */
const OUT = join(__dirname, 'out', 'raw');
/**
 * The fixture photos are small, unlicensed stand-ins; the store shots use CC0 photos instead
 * (store/photos/CREDITS.md). Only the network answer changes, never the app.
 */
const PHOTOS = join(__dirname, 'photos');
const SWAPS: [RegExp, string][] = [
  [/cooking-together/, 'table.jpg'],
  [/potluck-spread/, 'greens-stew.jpg'],
  [/pantry-jars/, 'chickpea-stew.jpg'],
];
const PHOTO = join(PHOTOS, 'sheet-pan.jpg');
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string) {
  // Let images and entry animations settle.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function joinKitchen(page: Page) {
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Circles', exact: true }).first().click();
  await page.getByRole('link', { name: /Neukölln Plant Kitchen/ }).click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('You’re a member').last()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
  for (const [pattern, file] of SWAPS) {
    await page.route(pattern, (route) =>
      route.fulfill({ path: join(PHOTOS, file), contentType: 'image/jpeg' }),
    );
  }
  // The "Dev fixtures" badge is for developers, not the store.
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement('style');
      style.textContent = '[data-testid="dev-badge"]{display:none!important}';
      document.head.appendChild(style);
    };
    // Init scripts run before the page has a <head>.
    document.addEventListener('DOMContentLoaded', hide);
  });
});

test('store screens', async ({ page }) => {
  test.setTimeout(180_000);
  await signInWithEmail(page, '/home');
  await joinKitchen(page);

  // 2. The Circle's week: the theme and what members cooked for it.
  await page.getByRole('tab', { name: 'Posts' }).click();
  await expect(page.getByText('Efo riro for six, with extra smoked tofu')).toBeVisible();
  await shot(page, 'circle-week');

  // 5. Cooking together in person (joined first, so This week shows it under Your Plans).
  await page.goto('/plan/cooking-night');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await shot(page, 'plan');
  await page
    .getByRole('button', { name: /^(Join|RSVP|I’m going)/ })
    .first()
    .click()
    .catch(() => undefined);
  await dismissNotificationPrompt(page);
  await shot(page, 'plan-joined');

  // 3. Sharing what you cooked, entered for the challenge.
  await page.goto('/home');
  await page.getByRole('button', { name: 'Cook it this week' }).click();
  await expect(page.getByRole('heading', { name: 'Share what you cooked' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a photo' }).click();
  await (await chooser).setFiles(PHOTO);
  await page
    .getByRole('textbox', { name: 'What did you make?' })
    .fill('Leftover veg became a sheet-pan roast with tahini. Gone in ten minutes.');
  await shot(page, 'composer');
  await page.getByRole('button', { name: 'Share with Neukölln Plant Kitchen' }).click();
  await expect(page.getByText('Challenge · Leftovers made new')).toBeVisible();
  await shot(page, 'cook');

  // 1. This week, with the Plan and the post in; then 4, the Circle's posts. In-app navigation
  // from here on (the app's own Back): a reload drops the session's photo and city in the
  // fixture backend.
  for (let i = 0; i < 4 && !new URL(page.url()).pathname.startsWith('/home'); i += 1) {
    await page.getByRole('button', { name: 'Back' }).filter({ visible: true }).last().click();
    await page.waitForTimeout(400);
  }
  // The city is set here, after the last reload (the fixture keeps it for the session only).
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await expect(page.getByRole('heading', { name: 'Leftovers made new' })).toBeVisible();
  await shot(page, 'this-week');
  await page.getByRole('link', { name: 'See all, Cooked in your Circles' }).click();
  await expect(page.getByRole('heading', { name: 'Cooked in your Circles' })).toBeVisible();
  // The second post, so this screen shows a different dish from the composer.
  // Scrolled to Mia's post, so the status bar sits on white above a whole post.
  const label = page.getByText('Mia K.', { exact: true }).first();
  const box = await label.boundingBox();
  await page.mouse.move(215, 600);
  await page.mouse.wheel(0, (box?.y ?? 0) - 74);
  await shot(page, 'feed');

  // Cooking weeks on the profile (spare, for a later set).
  await page.goto('/profile');
  await shot(page, 'profile');

  // 6. The invite link, as a friend sees it.
  await page.goto('/c/neukolln-plant-kitchen');
  await expect(page.getByText('Neukölln Plant Kitchen').first()).toBeVisible();
  await shot(page, 'invite');
});

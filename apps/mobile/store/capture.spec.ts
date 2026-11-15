import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Language } from '@plantcircle/copy';
import { freezeTime } from '../e2e/support';
import { copyOf, DEVICE_LOCALE, SAMPLE, STORE_LANGUAGES } from './locales';

/**
 * Raw screens for the store kit, in every language the app speaks (store/out/raw/{language});
 * store/compose.spec.ts frames them. `STORE_LANGUAGES=de,fr` limits the run.
 *
 * The sample content is swapped for the store: European, plant-based dishes and names that read
 * as a Berlin cook club, written in each language, and CC0 photos (store/photos/CREDITS.md)
 * instead of the unlicensed stand-ins. It goes through the fixture backend's override hook and
 * the network; the app's code and screens are the real ones, in the device's language.
 */
const PHOTOS = join(__dirname, 'photos');
const PHOTO_HOST = 'https://store-photos.plantcircle.test/';
const photo = (file: string) => `${PHOTO_HOST}${file}`;
const PHOTO = join(PHOTOS, 'sheet-pan.jpg');
const CIRCLE = 'Neukölln Plant Kitchen';

const rawLanguages: unknown = process.env.STORE_LANGUAGES;
const LANGUAGES =
  typeof rawLanguages === 'string' && rawLanguages
    ? STORE_LANGUAGES.filter((language) => rawLanguages.split(',').includes(language))
    : STORE_LANGUAGES;

function overridesFor(language: Language) {
  const sample = SAMPLE[language];
  return {
    plans: {
      'cooking-night': {
        title: sample.planTitle,
        areaHint: sample.areaHint,
        imagePath: photo('pasta-making.jpg'),
        imageAlt: 'Hands rolling fresh pasta through a pasta machine',
        imageFocus: '50% center',
        allergens: 'Gluten',
        hostName: 'Sofia R.',
      },
    },
    circles: {
      'neukolln-plant-kitchen': { ownerName: 'Sofia R.', tagline: sample.circleTagline },
    },
    cooks: {
      'cook-mia-efo': {
        caption: sample.miaCaption,
        image: photo('mushroom-pasta.jpg'),
        photoAlt: 'Pasta with mushrooms and parsley in a white bowl',
        recipeId: null,
      },
      'cook-ola-pantry': {
        caption: sample.olaCaption,
        image: photo('lentil-soup.jpg'),
        photoAlt: 'A bowl of lentil and vegetable soup',
      },
    },
  };
}

for (const language of LANGUAGES) {
  test.describe(language, () => {
    test.use({ locale: DEVICE_LOCALE[language] });
    const t = (key: string, vars?: Record<string, string>) => copyOf(language, key, vars);
    const out = join(__dirname, 'out', 'raw', language);

    async function shot(page: Page, name: string) {
      // Let images and entry animations settle.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, `${name}.png`) });
    }

    test.beforeEach(async ({ page }) => {
      mkdirSync(out, { recursive: true });
      await freezeTime(page);
      await page.route(`${PHOTO_HOST}**`, (route) =>
        route.fulfill({
          path: join(PHOTOS, new URL(route.request().url()).pathname.slice(1)),
          contentType: 'image/jpeg',
        }),
      );
      await page.addInitScript((overrides) => {
        (globalThis as { __pcFixtureOverrides?: unknown }).__pcFixtureOverrides = overrides;
      }, overridesFor(language));
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
      // Sign in (the fixture backend's code is 000000); the privacy choices keep the default.
      await page.goto(`/sign-up?next=${encodeURIComponent('/home')}`);
      await page.getByRole('checkbox', { name: t('auth.ageConfirm') }).click();
      await page.getByRole('textbox', { name: t('auth.email') }).fill('lena@example.com');
      await page.getByRole('button', { name: t('auth.continueEmail') }).click();
      await page.getByRole('textbox', { name: t('auth.codeLabel') }).fill('000000');
      await page.getByRole('button', { name: t('auth.verify') }).click();
      await expect(page).not.toHaveURL(/verify/);
      if (page.url().includes('/privacy-choices')) {
        await page.getByRole('button', { name: t('account.onlyNeeded') }).click();
        await expect(page).not.toHaveURL(/privacy-choices/);
      }

      // Join the Circle.
      await page.goto('/explore');
      await page
        .getByRole('tab', { name: t('explore.tabs.circles'), exact: true })
        .first()
        .click();
      await page.getByRole('link', { name: new RegExp(CIRCLE) }).click();
      await page.getByRole('button', { name: t('circles.join'), exact: true }).click();
      await expect(page.getByText(t('circles.member')).last()).toBeVisible();

      // 2. The Circle's week: the theme and what members cooked for it.
      await page.getByRole('tab', { name: t('circles.tabPosts') }).click();
      await expect(page.getByText(SAMPLE[language].miaCaption)).toBeVisible();
      await shot(page, 'circle-week');

      // 5. Cooking together in person (joined first, so This week shows it under Your Plans).
      await page.goto('/plan/cooking-night');
      await page.getByRole('button', { name: t('plan.join'), exact: true }).click();
      const notNow = page.getByRole('button', { name: t('notify.notNow') });
      await notNow.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined);
      if (await notNow.isVisible()) await notNow.click();
      await shot(page, 'plan-joined');

      // 3. Sharing what you cooked, entered for the challenge.
      await page.goto('/home');
      await page.getByRole('button', { name: t('cooks.challengeCook') }).click();
      await expect(page.getByRole('heading', { name: t('cooks.composeTitle') })).toBeVisible();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: t('cooks.choosePhoto') }).click();
      await (await chooser).setFiles(PHOTO);
      await page
        .getByRole('textbox', { name: t('cooks.captionLabel') })
        .fill(SAMPLE[language].myCaption);
      await shot(page, 'composer');
      await page
        .getByRole('button', { name: t('cooks.shareWith', { circle: CIRCLE }) })
        .click();
      const theme = t('cooks.themes.leftovers');
      await expect(page.getByText(t('cooks.challengeTag', { theme }))).toBeVisible();

      // 1. This week, with the Plan and the post in; then 4, the Circle's posts. In-app
      // navigation from here on (the app's own Back): a reload drops the session's photo and
      // city in the fixture backend.
      for (let i = 0; i < 4 && !new URL(page.url()).pathname.startsWith('/home'); i += 1) {
        await page
          .getByRole('button', { name: t('common.back') })
          .filter({ visible: true })
          .last()
          .click();
        await page.waitForTimeout(400);
      }
      // The city is set here, after the last reload (the fixture keeps it for the session only).
      await page.getByRole('button', { name: new RegExp(t('home.changeCity')) }).click();
      await page.getByRole('textbox', { name: t('city.searchLabel') }).fill('Berlin');
      await page.getByRole('radio', { name: 'Berlin', exact: true }).click();
      await expect(page.getByRole('heading', { name: theme })).toBeVisible();
      await shot(page, 'this-week');
      await page
        .getByRole('link', { name: `${t('home.seeAll')}, ${t('cooks.homeTitle')}` })
        .click();
      await expect(page.getByRole('heading', { name: t('cooks.feedTitle') })).toBeVisible();
      // Scrolled to Mia's post, so the status bar sits on white above a whole post with a
      // different dish from the composer.
      const box = await page.getByText('Mia K.', { exact: true }).first().boundingBox();
      await page.mouse.move(215, 600);
      await page.mouse.wheel(0, (box?.y ?? 0) - 74);
      await shot(page, 'feed');

      // 6. The invite link, as a friend sees it.
      await page.goto('/c/neukolln-plant-kitchen');
      await expect(page.getByText(CIRCLE).first()).toBeVisible();
      await shot(page, 'invite');
    });
  });
}

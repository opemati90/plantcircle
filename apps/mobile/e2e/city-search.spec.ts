import { expect, test } from '@playwright/test';
import { chooseCity, freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('the city picker suggests known cities as you type, by city or by country', async ({
  page,
}) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  // Nothing typed: no list, only Anywhere and the hint.
  await expect(page.getByRole('radio', { name: 'Berlin' })).toHaveCount(0);
  await expect(page.getByText('Any city in the world', { exact: false })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Search cities' });
  await search.fill('lis');
  await expect(page.getByRole('radio', { name: 'Lisbon' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Berlin' })).toHaveCount(0);

  await search.fill('germ');
  await expect(page.getByRole('radio', { name: 'Berlin' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Lisbon' })).toHaveCount(0);
  // A new city goes under the device's country (en-GB here), so Berlin can still be used there,
  // and the row says which country it would be filed under; a namesake in that country cannot.
  await search.fill('berlin');
  await expect(
    page.getByRole('button', { name: /Use “berlin” · United Kingdom/ }),
  ).toBeVisible();
  await search.fill('london');
  await expect(page.getByRole('radio', { name: 'London' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Use “london”/ })).toHaveCount(0);
});

test('a city not on the list is added and becomes the home city', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('textbox', { name: 'Search cities' }).fill('Tbilisi');
  await page.getByRole('button', { name: /Use “Tbilisi”/ }).click();
  await expect(page.getByRole('heading', { name: 'This week in Tbilisi' })).toBeVisible();
  // It is now a known city.
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await expect(page.getByRole('heading', { name: 'This week in Berlin' })).toBeVisible();
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Tbilisi');
  await expect(page.getByRole('heading', { name: 'This week in Tbilisi' })).toBeVisible();
});

test('onboarding takes a typed city', async ({ page }) => {
  await page.goto('/city');
  await expect(page.getByRole('heading', { name: 'Where are you based?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Search cities' }).fill('Kigali');
  await page.getByRole('button', { name: /Use “Kigali”/ }).click();
  await expect(page.getByRole('radio', { name: 'Kigali' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'This week in Kigali' })).toBeVisible();
});

test('a new city can be filed under another country than the device’s', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('textbox', { name: 'Search cities' }).fill('Lagos');
  // Lagos, Nigeria is known; the device says United Kingdom, so Lagos could be added there too.
  await expect(page.getByRole('radio', { name: 'Lagos' })).toBeVisible();
  await page.getByRole('button', { name: 'Not United Kingdom? Choose the country' }).click();
  await page.getByRole('textbox', { name: 'Search countries' }).fill('portu');
  await page.getByRole('radio', { name: 'Portugal' }).click();
  // Another country: the time zone is asked too, defaulting to the device's.
  await page.getByRole('button', { name: /^Time zone: / }).click();
  await page.getByRole('textbox', { name: 'Search time zones' }).fill('lisbon');
  await page.getByRole('radio', { name: 'Europe/Lisbon' }).click();
  await expect(
    page.getByRole('button', { name: 'Time zone: Europe/Lisbon · Change' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Use “Lagos” · Portugal/ }).click();
  await expect(page.getByRole('heading', { name: 'This week in Lagos' })).toBeVisible();
  // Two cities called Lagos now, in two countries, both findable.
  await page.getByRole('button', { name: 'Change city' }).click();
  await page.getByRole('textbox', { name: 'Search cities' }).fill('Lagos');
  await expect(page.getByText('PORTUGAL', { exact: true })).toBeVisible();
  await expect(page.getByText('NIGERIA', { exact: true })).toBeVisible();
});

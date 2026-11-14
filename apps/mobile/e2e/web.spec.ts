import { expect, test } from '@playwright/test';
import { freezeTime } from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a shared link reserves a spot with a name, an email and the age confirmation, and can be cancelled', async ({
  page,
}) => {
  await page.goto('/p/cooking-night');
  await expect(page.getByText('AMA O. INVITED YOU')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'West African Cooking Night' })).toBeVisible();
  await expect(page.getByText('4 spots')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reserve my spot' })).toBeDisabled();
  await expect(page.getByText('Confirm you’re 18+ to reserve')).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Sara');
  await page.getByRole('textbox', { name: 'Email' }).fill('sara@example.com');
  await page.getByRole('checkbox', { name: /I’m 18\+ and agree/ }).click();
  await expect(page.getByText('No app needed · address emailed the day before')).toBeVisible();
  await page.getByRole('button', { name: 'Reserve my spot' }).click();

  await expect(page.getByRole('heading', { name: 'You’re on the list, Sara' })).toBeVisible();
  await expect(page.getByText('Confirmation sent to sara@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'App Store' })).toBeVisible();
  await page.getByRole('button', { name: 'Can’t make it? Cancel my spot' }).click();
  await expect(page.getByRole('heading', { name: 'Your spot is released' })).toBeVisible();
});

test('an email that already belongs to a member gets a sign-in link, and a full Plan offers the waitlist', async ({
  page,
}) => {
  await page.goto('/p/cooking-night');
  await page.getByRole('textbox', { name: 'First name' }).fill('Lena');
  await page.getByRole('textbox', { name: 'Email' }).fill('lena@example.com');
  await page.getByRole('checkbox', { name: /I’m 18\+ and agree/ }).click();
  await page.getByRole('button', { name: 'Reserve my spot' }).click();
  await expect(
    page.getByRole('heading', { name: 'You already have a PlantCircle account' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Cancel my spot/ })).toHaveCount(0);

  await page.goto('/p/ramen-workshop');
  await expect(page.getByText('Full · waitlist')).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Sara');
  await page.getByRole('textbox', { name: 'Email' }).fill('sara@example.com');
  await page.getByRole('checkbox', { name: /I’m 18\+ and agree/ }).click();
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('heading', { name: /in line, Sara/ })).toBeVisible();
});

test('a bad email is caught before anything is sent, and Open in app leads to the Plan', async ({
  page,
}) => {
  await page.goto('/p/cooking-night');
  await page.getByRole('textbox', { name: 'First name' }).fill('Sara');
  await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
  await page.getByRole('checkbox', { name: /I’m 18\+ and agree/ }).click();
  await page.getByRole('button', { name: 'Reserve my spot' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
  await page.getByRole('button', { name: 'Open in app' }).click();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
});

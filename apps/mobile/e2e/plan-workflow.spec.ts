import { expect, test, type Page } from '@playwright/test';
import {
  chooseCity,
  dismissNotificationPrompt,
  freezeTime,
  signInWithEmail,
  type FixtureWindow,
} from './support';

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

async function publishPlan(page: Page) {
  await signInWithEmail(page, '/home');
  await page.getByRole('button', { name: 'Change city' }).click();
  await chooseCity(page, 'Berlin');
  await page.getByRole('link', { name: 'Start a Plan' }).click();
  await page.getByRole('radio', { name: 'Cooking night' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Lentil night');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(2).click();
  await page.getByRole('radio', { name: '18:00' }).click();
  await page.getByRole('radio', { name: '120 min' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Area' }).fill('Neukölln');
  await page.getByRole('textbox', { name: 'Exact address' }).fill('Weserstraße 1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('heading', { name: 'Your Plan is live' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage' }).click();
}

test('a host moves their Plan to a new time; guests are asked to re-confirm', async ({
  page,
}) => {
  await publishPlan(page);
  await page.getByRole('button', { name: 'Change time or place' }).click();
  await expect(page.getByRole('heading', { name: 'Change time or place' })).toBeVisible();
  // Nothing changed yet: saving is not offered.
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.getByRole('radio', { name: '19:00' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved. Guests are being asked to re-confirm.')).toBeVisible();
});

test('a host cancels with a message; the Plan says so and nobody can join', async ({
  page,
}) => {
  await publishPlan(page);
  await page.getByRole('button', { name: 'Cancel this Plan' }).click();
  const confirm = page.getByRole('button', { name: 'Cancel Plan' });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Message to your guests' })
    .fill('Oven broke, sorry!');
  await confirm.click();
  await expect(page.getByText('You cancelled this Plan.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change time or place' })).toHaveCount(0);
});

test('a guest sees a changed time and answers it; a cancelled Plan shows the host’s message', async ({
  page,
}) => {
  await signInWithEmail(page, '/plan/cooking-night');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await dismissNotificationPrompt(page);
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();

  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.hostChanges('cooking-night'),
  );
  await page.reload();
  await expect(page.getByText('TIME CHANGED')).toBeVisible();
  await expect(page.getByText('Can you still make it?')).toBeVisible();
  await page.getByRole('button', { name: 'Still going' }).click();
  await expect(page.getByText('Thanks, see you there')).toBeVisible();
  await expect(page.getByRole('button', { name: 'You’re going' })).toBeVisible();

  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.hostCancels(
      'cooking-night',
      'I’m ill, sorry all.',
    ),
  );
  await page.reload();
  await expect(page.getByText('CANCELLED BY HOST')).toBeVisible();
  await expect(page.getByText('I’m ill, sorry all.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Find other Plans' }).click();
  await expect(page).toHaveURL(/explore/);
});

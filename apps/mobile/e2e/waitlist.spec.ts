import { expect, test, type Page } from '@playwright/test';
import { freezeTime, NOW, signInWithEmail, type FixtureWindow } from './support';

const RAMEN = '/plan/ramen-workshop';

/** Another guest cancels: in the fixtures the viewer is next, so they are offered the spot. */
const anotherGuestCancels = (page: Page) =>
  page.evaluate(() => (globalThis as FixtureWindow).__pcFixtures?.freeSpot('ramen-workshop'));

async function joinWaitlist(page: Page): Promise<void> {
  await signInWithEmail(page, RAMEN);
  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freezeTime(page);
});

test('a full Plan explains the waitlist; joining it starts at sign-up for a visitor', async ({
  page,
}) => {
  await page.goto(RAMEN);
  await expect(page.getByText('All 8 spots are taken')).toBeVisible();
  await expect(page.getByText('3 people on the waitlist')).toBeVisible();
  await expect(page.getByText('You’d be 4th in line')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How the waitlist works' })).toBeVisible();

  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await page.getByRole('checkbox', { name: 'I’m 18 or older' }).click();
  await page.getByRole('button', { name: 'Continue with Apple' }).click();

  // The action that triggered sign-up is resumed.
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();
  await expect(page.getByText('You’re 4th in line')).toBeVisible();
  await expect(page.getByText('4 people on the waitlist')).toBeVisible();
});

test('an offered spot shows on Home with a countdown and can be confirmed', async ({
  page,
}) => {
  await joinWaitlist(page);
  await anotherGuestCancels(page);

  await page.goto('/home');
  await page
    .getByRole('link', { name: /Spot offered · confirm by 21:00.*Vegan Ramen Workshop/i })
    .click();

  await expect(page.getByRole('heading', { name: 'A spot opened up for you' })).toBeVisible();
  await expect(page.getByRole('timer', { name: '2:00 left to confirm' })).toBeVisible();
  await expect(
    page.getByText('Confirm by 21:00 today, or it passes to the next person in line.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Confirm my spot' }).click();
  // Confirming lands in My Plans, where the new spot is listed as Going.
  await expect(page).toHaveURL(/\/my-plans$/);
  await expect(page.getByRole('link', { name: /Vegan Ramen Workshop/ })).toContainText('Going');
});

test('the Plan itself shows the offer and leads to confirming it', async ({ page }) => {
  await joinWaitlist(page);
  await anotherGuestCancels(page);
  await page.reload();

  await expect(page.getByText('A spot opened up', { exact: true })).toBeVisible();
  await expect(page.getByText('Confirm by 21:00')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm my spot' }).click();
  await expect(page.getByRole('heading', { name: 'A spot opened up for you' })).toBeVisible();
});

test('“No thanks, pass it on” gives up the spot and the place in line', async ({ page }) => {
  await joinWaitlist(page);
  await anotherGuestCancels(page);
  await page.goto(`${RAMEN}/waitlist-offer`);

  await page.getByRole('button', { name: 'No thanks, pass it on' }).click();
  // The spot goes to the next person in line, so the way back in is the waitlist again.
  await expect(page.getByRole('button', { name: 'Join waitlist' })).toBeVisible();
  await expect(page.getByText('3 people on the waitlist')).toBeVisible();
});

test('confirming after the 2 hours ran out says so and offers a way back in line', async ({
  page,
}) => {
  await joinWaitlist(page);
  await anotherGuestCancels(page);
  await page.goto(`${RAMEN}/waitlist-offer`);
  await expect(page.getByRole('timer')).toBeVisible();

  // Three hours pass while the screen stays open.
  await page.clock.setFixedTime(new Date(NOW.getTime() + 3 * 3_600_000));
  await page.getByRole('button', { name: 'Confirm my spot' }).click();

  await expect(page.getByRole('heading', { name: 'This offer has ended' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to waitlist' }).click();
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();
});

test('leaving the waitlist asks first', async ({ page }) => {
  await joinWaitlist(page);
  await page.getByRole('button', { name: 'On the waitlist ✓' }).click();
  await expect(page.getByRole('heading', { name: 'Leave the waitlist?' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave waitlist' }).click();
  await expect(page.getByRole('button', { name: 'Join waitlist' })).toBeVisible();
  await expect(page.getByText('3 people on the waitlist')).toBeVisible();
});

test('a failed waitlist join is reported and can be retried', async ({ page }) => {
  await signInWithEmail(page, RAMEN);
  await page.evaluate(() =>
    (globalThis as FixtureWindow).__pcFixtures?.failNext('joinWaitlist'),
  );
  await page.getByRole('button', { name: 'Join waitlist' }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t save your RSVP');
  await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('button', { name: 'On the waitlist ✓' })).toBeVisible();
});

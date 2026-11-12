import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-000000000001';
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d';
const E = '00000000-0000-4000-8000-00000000000e';
const PLAN = '10000000-0000-4000-8000-000000000001';
const CITY = '30000000-0000-4000-8000-000000000001';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `40000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

/** A Plan with room for two, starting `hoursAhead` hours from now. */
async function seed(hoursAhead: number): Promise<void> {
  await db.query(
    `insert into public.cities (id, name, country_code, tz)
     values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama O.'],
    [A, 'Anna'],
    [B, 'Ben'],
    [C, 'Cem'],
    [D, 'Dora'],
    [E, 'Eli'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [
      id,
      name,
    ]);
  }
  await db.exec(`
    insert into public.plans
      (id, host_id, title, kind, city_id, area_label, starts_at, ends_at,
       tz, capacity, description)
    values ('${PLAN}', '${HOST}', 'Ramen', 'cooking_night', '${CITY}', 'Friedrichshain',
      now() + interval '${hoursAhead} hours', now() + interval '${hoursAhead + 2} hours',
      'Europe/Berlin', 2, 'x');
    insert into public.plan_private (plan_id, address, reveal_at)
    values ('${PLAN}', 'Ramen Street 1', now() + interval '${hoursAhead - 1} hours');
  `);
}

type Result = { status: string; position?: number };
const call = (fn: string, user: string, key = newKey()) =>
  asUser(db, user, () =>
    db.query<{ result: Result }>(`select public.${fn}($1, $2) as result`, [PLAN, key]),
  ).then((r) => r.rows[0]?.result);

// rsvp_join takes a free spot or gets the member in line, so one call serves both.
const join = (user: string) => call('rsvp_join', user);
const waitlist = (user: string) => call('rsvp_join', user);
const confirm = (user: string, key = newKey()) =>
  asUser(db, user, () =>
    db.query<{ result: Result }>('select public.waitlist_respond($1, true, $2) as result', [
      PLAN,
      key,
    ]),
  ).then((r) => r.rows[0]?.result);
const cancel = (user: string) => call('rsvp_cancel', user);

async function statuses(): Promise<Record<string, string>> {
  const rows = await db.query<{ display_name: string; status: string }>(
    `select p.display_name, r.state as status from public.rsvps r
     join public.profiles p on p.id = r.user_id where r.plan_id = $1`,
    [PLAN],
  );
  return Object.fromEntries(rows.rows.map((r) => [r.display_name, r.status]));
}

/** Moves every outstanding offer's expiry into the past, as if 2 hours had gone by. */
const letOffersLapse = () =>
  db.exec(`update public.rsvps set offer_expires_at = now() - interval '1 minute'
           where state = 'offered'`);

async function fillPlan(): Promise<void> {
  await join(A);
  await join(B);
}

beforeEach(async () => {
  db = await createDatabase();
});

describe('waitlist, more than 6 hours before the start', () => {
  beforeEach(async () => {
    await seed(72);
    await fillPlan();
  });

  it('puts people in line in the order they joined and reports their position', async () => {
    expect(await join(C)).toEqual({ status: 'waitlisted', position: 1 });
    expect(await waitlist(C)).toEqual({ status: 'waitlisted', position: 1 });
    expect(await waitlist(D)).toEqual({ status: 'waitlisted', position: 2 });
    // Asking again does not move you to the back or create a second entry.
    expect(await waitlist(C)).toEqual({ status: 'waitlisted', position: 1 });
  });

  it('offers a freed spot to the first person only, for 2 hours', async () => {
    await waitlist(C);
    await waitlist(D);
    await cancel(A);
    expect(await statuses()).toMatchObject({ Cem: 'offered', Dora: 'waitlisted' });

    const offer = await db.query<{ minutes: number }>(
      `select round(extract(epoch from offer_expires_at - now()) / 60)::int as minutes
       from public.rsvps where user_id = $1`,
      [C],
    );
    expect(offer.rows[0]?.minutes).toBe(120);
  });

  it('holds the offered spot: nobody else can take it, not even a new visitor', async () => {
    await waitlist(C);
    await cancel(A);
    expect(await join(E)).toEqual({ status: 'waitlisted', position: 2 });
    expect(await waitlist(E)).toEqual({ status: 'waitlisted', position: 2 });
  });

  it('confirms an offer into a spot', async () => {
    await waitlist(C);
    await cancel(A);
    expect(await confirm(C)).toEqual({ status: 'going' });
    expect(await statuses()).toMatchObject({ Ben: 'going', Cem: 'going' });
  });

  it('passes the spot on when the offer is declined', async () => {
    await waitlist(C);
    await waitlist(D);
    await cancel(A);
    await cancel(C);
    expect(await statuses()).toMatchObject({ Cem: 'cancelled', Dora: 'offered' });
  });

  it('lets someone whose offer expired get back in line, at the back', async () => {
    await waitlist(C);
    await waitlist(D);
    await cancel(A);
    await letOffersLapse();
    await confirm(C);
    await waitlist(E);
    expect(await waitlist(C)).toEqual({ status: 'waitlisted', position: 3 });
  });

  it('expires an offer after 2 hours and passes it on; the late confirm is told so', async () => {
    await waitlist(C);
    await waitlist(D);
    await cancel(A);
    await letOffersLapse();

    expect(await confirm(C)).toEqual({ status: 'expired' });
    expect(await statuses()).toMatchObject({ Cem: 'cancelled', Dora: 'offered' });
    expect(await confirm(D)).toEqual({ status: 'going' });
  });

  it('the scheduled job expires overdue offers without anyone opening the app', async () => {
    await waitlist(C);
    await waitlist(D);
    await cancel(A);
    await letOffersLapse();

    const processed = await db.query<{ n: number }>(
      'select public.expire_waitlist_offers() as n',
    );
    expect(processed.rows[0]?.n).toBe(1);
    expect(await statuses()).toMatchObject({ Cem: 'cancelled', Dora: 'offered' });
    await expect(
      asUser(db, C, () => db.query('select public.expire_waitlist_offers()')),
    ).rejects.toThrow(/permission denied/);
  });

  it('never lets confirmed guests exceed capacity, whatever the order of events', async () => {
    await waitlist(C);
    await waitlist(D);
    await waitlist(E);
    await cancel(A);
    await cancel(B);
    // Two spots freed → two exclusive offers, the third person keeps waiting.
    expect(await statuses()).toMatchObject({
      Cem: 'offered',
      Dora: 'offered',
      Eli: 'waitlisted',
    });
    await confirm(C);
    await confirm(D);
    expect(await confirm(E)).toEqual({ status: 'waitlisted' });
    const going = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rsvps where plan_id = $1 and state = 'going'`,
      [PLAN],
    );
    expect(going.rows[0]?.n).toBe(2);
  });

  it('is idempotent: a retried confirm returns the first answer', async () => {
    await waitlist(C);
    await cancel(A);
    const key = newKey();
    expect(await confirm(C, key)).toEqual({ status: 'going' });
    expect(await confirm(C, key)).toEqual({ status: 'going' });
  });

  it('rejects confirming without being in line, and the host joining their own line', async () => {
    await expect(confirm(E)).rejects.toThrow(/no_offer/);
    await expect(waitlist(HOST)).rejects.toThrow(/host_cannot_join/);
  });

  it('shows members only their own entry, with position; the public sees only counts', async () => {
    await waitlist(C);
    await waitlist(D);
    const mine = await asUser(db, D, () =>
      db.query<{ status: string; waitlist_position: number }>(
        'select status, waitlist_position from public.my_rsvps',
      ),
    );
    expect(mine.rows).toEqual([{ status: 'waitlisted', waitlist_position: 2 }]);

    await asUser(db, null, async () => {
      const availability = await db.query(
        'select waitlist_count, has_open_spot from public.plan_cards',
      );
      expect(availability.rows).toEqual([{ waitlist_count: 2, has_open_spot: false }]);
      await expect(db.query('select * from public.my_rsvps')).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe('waitlist, inside the last 6 hours', () => {
  beforeEach(async () => {
    await seed(4);
    await fillPlan();
    await waitlist(C);
    await waitlist(D);
  });

  it('offers a freed spot to everyone in line at once', async () => {
    await cancel(A);
    expect(await statuses()).toMatchObject({ Cem: 'offered', Dora: 'offered' });
  });

  it('first to confirm wins; the other is told and goes back in line', async () => {
    await cancel(A);
    expect(await confirm(D)).toEqual({ status: 'going' });
    expect(await confirm(C)).toEqual({ status: 'waitlisted' });
    expect(await statuses()).toMatchObject({ Dora: 'going', Cem: 'waitlisted' });
  });

  it('never offers past the start time', async () => {
    await cancel(A);
    const late = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rsvps r join public.plans p on p.id = r.plan_id
       where r.state = 'offered' and r.offer_expires_at > p.starts_at`,
    );
    expect(late.rows[0]?.n).toBe(0);
  });
});

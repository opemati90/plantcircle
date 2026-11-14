import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000d1';
const GUEST = '00000000-0000-4000-8000-0000000000d2';
const OTHER = '00000000-0000-4000-8000-0000000000d3';
const WAITER = '00000000-0000-4000-8000-0000000000d4';
const CITY = '30000000-0000-4000-8000-0000000000d1';
const PLAN = '10000000-0000-4000-8000-0000000000d1';
const SLOT = 'f0000000-0000-4000-8000-0000000000d1';

let db: PGlite;
let n = 0;
const key = () => `7e000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
const DAY = 86_400_000;
const start = new Date(Date.now() + 2 * DAY);
const end = new Date(start.getTime() + 3 * 3_600_000);

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama'],
    [GUEST, 'Ben'],
    [OTHER, 'Cem'],
    [WAITER, 'Dee'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, is_verified_host) values ($1, $2, $3, true)',
      [id, name, CITY],
    );
  }
  await db.query(
    `insert into public.plans (id, host_id, title, kind, city_id, area_label, starts_at, ends_at, tz, capacity, description, status, allergens)
     values ($1, $2, 'Soup night', 'cooking_night', $3, 'Neukölln', $4, $5, 'Europe/Berlin', 2, 'x', 'published', 'none')`,
    [PLAN, HOST, CITY, start.toISOString(), end.toISOString()],
  );
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now() - interval '1 hour')`,
    [PLAN],
  );
  await db.query(
    `insert into public.contribution_slots (id, plan_id, label, needed) values ($1, $2, 'Bread', 2)`,
    [SLOT, PLAN],
  );
});

const join = (user: string) =>
  asUser(db, user, () => db.query('select public.rsvp_join($1, $2)', [PLAN, key()]));
const update = (
  user: string,
  patch: Partial<{
    title: string;
    starts: Date;
    ends: Date;
    capacity: number;
    area: string;
    address: string;
  }> = {},
) =>
  asUser(db, user, () =>
    db.query<{ r: { status: string } }>(
      'select public.plan_update($1, $2, $3, $4, $5, $6, $7, $8, $9) as r',
      [
        PLAN,
        patch.title ?? 'Soup night',
        'x',
        (patch.starts ?? start).toISOString(),
        (patch.ends ?? end).toISOString(),
        patch.capacity ?? 2,
        patch.area ?? 'Neukölln',
        patch.address ?? 'Weserstraße 1',
        key(),
      ],
    ),
  ).then((x) => x.rows[0]?.r);
const plan = () =>
  db
    .query<{ status: string; capacity: number; cancelled_reason: string | null }>(
      'select status, capacity, cancelled_reason from public.plans where id = $1',
      [PLAN],
    )
    .then((r) => r.rows[0]);
const rsvps = () =>
  db
    .query<{ user_id: string; state: string; needs_reconfirm: boolean }>(
      'select user_id, state, needs_reconfirm from public.rsvps where plan_id = $1 order by user_id',
      [PLAN],
    )
    .then((r) => r.rows);
const inbox = (user: string) =>
  asUser(db, user, () =>
    db.query<{ type: string; payload: Record<string, unknown> }>(
      'select type, payload from public.notifications order by created_at',
    ),
  ).then((r) => r.rows);

describe('plan_update', () => {
  it('a title or capacity change keeps the Plan published and asks nobody', async () => {
    await join(GUEST);
    expect(await update(HOST, { title: 'Soup night, round two', capacity: 4 })).toEqual({
      status: 'published',
    });
    expect(await plan()).toMatchObject({ status: 'published', capacity: 4 });
    expect((await rsvps()).map((r) => r.needs_reconfirm)).toEqual([false]);
    expect((await inbox(GUEST)).filter((x) => x.type === 'plan_changed')).toEqual([]);
  });

  it('a new time marks the Plan changed, asks going guests to re-confirm, and tells them', async () => {
    await join(GUEST);
    await join(OTHER);
    await join(WAITER); // full: in line
    const later = new Date(start.getTime() + DAY);
    expect(
      await update(HOST, { starts: later, ends: new Date(later.getTime() + 3 * 3_600_000) }),
    ).toEqual({ status: 'changed' });
    expect(await plan()).toMatchObject({ status: 'changed' });
    const rows = await rsvps();
    expect(rows.find((r) => r.user_id === GUEST)).toMatchObject({
      state: 'going',
      needs_reconfirm: true,
    });
    expect(rows.find((r) => r.user_id === WAITER)).toMatchObject({
      state: 'waitlisted',
      needs_reconfirm: false,
    });
    const note = (await inbox(GUEST)).find((x) => x.type === 'plan_changed');
    expect(note?.payload).toEqual(expect.objectContaining({ plan: 'Soup night' }));
    expect(typeof note?.payload['time']).toBe('string');

    // One guest re-confirms: still changed. The other cancels: nobody is left to answer.
    await asUser(db, GUEST, () =>
      db.query('select public.rsvp_reconfirm($1, $2)', [PLAN, key()]),
    );
    expect(await plan()).toMatchObject({ status: 'changed' });
    await asUser(db, OTHER, () => db.query('select public.rsvp_cancel($1, $2)', [PLAN, key()]));
    expect(await plan()).toMatchObject({ status: 'published' });
    // The freed spot went to the person in line, as always.
    expect((await rsvps()).find((r) => r.user_id === WAITER)?.state).toBe('offered');
  });

  it('a changed Plan returns to published after 48 hours', async () => {
    await join(GUEST);
    const later = new Date(start.getTime() + DAY);
    await update(HOST, { starts: later, ends: new Date(later.getTime() + 3 * 3_600_000) });
    await db.query(
      `update public.plans set changed_at = now() - interval '49 hours' where id = $1`,
      [PLAN],
    );
    const due = await db.query<{ n: number }>('select public.plans_changed_due() as n');
    expect(due.rows[0]?.n).toBe(1);
    expect(await plan()).toMatchObject({ status: 'published' });
    expect((await rsvps()).map((r) => r.needs_reconfirm)).toEqual([false]);
  });

  it('refuses a stranger, a past or cancelled Plan, and a capacity below the people going', async () => {
    await update(HOST, { capacity: 3 });
    await join(GUEST);
    await join(OTHER);
    await join(WAITER);
    await expect(update(GUEST, { capacity: 3 })).rejects.toThrow(/not_host/);
    await expect(update(HOST, { capacity: 2 })).rejects.toThrow(/capacity_below_going/);
    await expect(update(HOST, { title: 'ab' })).rejects.toThrow(/invalid_plan/);
    await asUser(db, HOST, () =>
      db.query('select public.plan_cancel($1, $2, $3)', [PLAN, 'Oven broke', key()]),
    );
    await expect(update(HOST)).rejects.toThrow(/plan_not_live/);
  });
});

describe('plan_cancel', () => {
  it('releases spots, places in line and bring claims, keeps the record, and tells everyone with the reason', async () => {
    await join(GUEST);
    await join(OTHER);
    await join(WAITER);
    await asUser(db, GUEST, () => db.query('select public.slot_claim($1, $2)', [SLOT, key()]));
    const cancelKey = key();
    const r = await asUser(db, HOST, () =>
      db.query<{ r: { status: string } }>('select public.plan_cancel($1, $2, $3) as r', [
        PLAN,
        '  Oven broke, sorry!  ',
        cancelKey,
      ]),
    );
    expect(r.rows[0]?.r).toEqual({ status: 'cancelled' });
    expect(await plan()).toMatchObject({
      status: 'cancelled',
      cancelled_reason: 'Oven broke, sorry!',
    });
    expect((await rsvps()).map((x) => x.state)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ]);
    const claims = await db.query(
      'select 1 from public.contribution_claims where slot_id = $1',
      [SLOT],
    );
    expect(claims.rows).toHaveLength(0);
    for (const user of [GUEST, OTHER, WAITER]) {
      const note = (await inbox(user)).find((x) => x.type === 'plan_cancelled');
      expect(note?.payload).toEqual(
        expect.objectContaining({
          plan: 'Soup night',
          host: 'Ama',
          reason: 'Oven broke, sorry!',
        }),
      );
    }
    // The card still exists for anyone who had the link, with its reason.
    const card = await asUser(db, null, () =>
      db.query<{ status: string; cancelled_reason: string }>(
        'select status, cancelled_reason from public.plan_cards where id = $1',
        [PLAN],
      ),
    );
    expect(card.rows[0]).toEqual({
      status: 'cancelled',
      cancelled_reason: 'Oven broke, sorry!',
    });
    // Nobody can join a cancelled Plan; a retry with the same key replays, a new call is refused.
    await expect(join(WAITER)).rejects.toThrow();
    const again = await asUser(db, HOST, () =>
      db.query<{ r: { status: string } }>('select public.plan_cancel($1, $2, $3) as r', [
        PLAN,
        '  Oven broke, sorry!  ',
        cancelKey,
      ]),
    );
    expect(again.rows[0]?.r).toEqual({ status: 'cancelled' });
    await expect(
      asUser(db, HOST, () =>
        db.query('select public.plan_cancel($1, $2, $3)', [PLAN, 'Different reason', key()]),
      ),
    ).rejects.toThrow(/plan_not_live/);
  });

  it('needs a reason, and only the host can do it', async () => {
    await expect(
      asUser(db, GUEST, () =>
        db.query('select public.plan_cancel($1, $2, $3)', [PLAN, 'Nope', key()]),
      ),
    ).rejects.toThrow(/not_host/);
    await expect(
      asUser(db, HOST, () =>
        db.query('select public.plan_cancel($1, $2, $3)', [PLAN, '  ', key()]),
      ),
    ).rejects.toThrow(/invalid_plan/);
  });
});

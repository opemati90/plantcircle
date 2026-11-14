import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ANA = '00000000-0000-4000-8000-0000000000f1';
const BEN = '00000000-0000-4000-8000-0000000000f2';
const OLU = '00000000-0000-4000-8000-0000000000f3';
const CITY = '30000000-0000-4000-8000-0000000000f0';
const KITCHEN = '50000000-0000-4000-8000-0000000000f0';

let db: PGlite;
let plan = '';
let keyCounter = 0;
const key = () => `6a000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [ANA, 'Ana'],
    [BEN, 'Ben'],
    [OLU, 'Olu'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, people_visible) values ($1, $2, $3, true)',
      [id, name, CITY],
    );
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, ANA],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [KITCHEN, ANA, BEN],
  );
  const starts = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const ends = new Date(Date.now() + 8 * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'potluck', 'in_person', 'Potluck', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 1, 'none', 'published') returning id`,
    [OLU, CITY, starts, ends],
  );
  plan = rows[0]?.id ?? '';
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now())`,
    [plan],
  );
});

const settings = (who: string) =>
  asUser(db, who, () =>
    db.query<{ result: Record<string, unknown> }>('select public.settings_get() as result'),
  ).then((r) => r.rows[0]?.result);
const update = (who: string, patch: Record<string, unknown>) =>
  asUser(db, who, () =>
    db.query<{ result: Record<string, unknown> }>(
      'select public.settings_update($1) as result',
      [JSON.stringify(patch)],
    ),
  ).then((r) => r.rows[0]?.result);

describe('settings and consent', () => {
  it('starts with consent off and records every consent change as an event', async () => {
    const first = await settings(ANA);
    expect(first).toEqual(
      expect.objectContaining({
        analytics_consent: false,
        personalisation_consent: false,
        consent_decided_at: null,
        notif_reminders: true,
        quiet_hours: true,
        quiet_start: 22,
        quiet_end: 8,
        lock_screen_text: false,
      }),
    );
    const saved = await update(ANA, {
      analytics_consent: true,
      personalisation_consent: false,
    });
    expect(saved?.analytics_consent).toBe(true);
    expect(saved?.consent_decided_at).not.toBeNull();
    await update(ANA, { analytics_consent: false });
    await update(ANA, { notif_direct: false, quiet_start: 23 });
    const events = await db.query<{ kind: string; value: boolean }>(
      'select kind, value from public.consent_events where user_id = $1 order by id',
      [ANA],
    );
    expect(events.rows).toEqual([
      { kind: 'analytics', value: true },
      { kind: 'personalisation', value: false },
      { kind: 'analytics', value: false },
    ]);
    expect(await settings(ANA)).toEqual(
      expect.objectContaining({
        notif_direct: false,
        quiet_start: 23,
        analytics_consent: false,
      }),
    );
    await expect(update(ANA, { diet: 'vegan' })).rejects.toThrow(/invalid_settings/);
    await expect(update(ANA, { analytics_consent: 'yes' })).rejects.toThrow(/invalid_settings/);
    await expect(update(ANA, { quiet_start: '12' })).rejects.toThrow(/invalid_settings/);
    await expect(update(ANA, { quiet_start: 12.5 })).rejects.toThrow(/invalid_settings/);
    await expect(update(ANA, { quiet_start: 25 })).rejects.toThrow();
    await expect(
      asUser(db, ANA, () => db.query('select * from public.user_settings')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, null, () => db.query('select public.settings_get()')),
    ).rejects.toThrow();
  });
});

describe('a copy of your data', () => {
  it('records one open request at a time and shows it in the settings', async () => {
    const first = await asUser(db, ANA, () =>
      db.query<{ result: { requested_at: string } }>(
        'select public.data_export_request($1) as result',
        [key()],
      ),
    ).then((r) => r.rows[0]?.result);
    const again = await asUser(db, ANA, () =>
      db.query<{ result: { requested_at: string } }>(
        'select public.data_export_request($1) as result',
        [key()],
      ),
    ).then((r) => r.rows[0]?.result);
    expect(again?.requested_at).toBe(first?.requested_at);
    const open = await db.query(
      'select id from public.data_requests where user_id = $1 and kind = $2',
      [ANA, 'export'],
    );
    expect(open.rows).toHaveLength(1);
    expect((await settings(ANA))?.export_requested_at).not.toBeNull();
  });
});

describe('deleting the account', () => {
  it('anonymises at once, releases the spot to the waitlist, cancels hosted Plans, leaves Circles, and refuses to come back', async () => {
    // Ana holds the only spot; Ben waits. Ana also hosts a Plan tomorrow.
    await asUser(db, ANA, () => db.query('select public.rsvp_join($1, $2)', [plan, key()]));
    const waiting = await asUser(db, BEN, () =>
      db.query<{ result: { status: string } }>('select public.rsvp_join($1, $2) as result', [
        plan,
        key(),
      ]),
    ).then((r) => r.rows[0]?.result);
    expect(waiting?.status).toBe('waitlisted');
    const hostedId = await db
      .query<{ id: string }>(
        `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
       values ($1, 'cooking_night', 'in_person', 'Soup', '', $2, 'Neukölln', now() + interval '1 day', now() + interval '1 day 2 hours', 'Europe/Berlin', 6, 'none', 'published') returning id`,
        [ANA, CITY],
      )
      .then((r) => r.rows[0]?.id ?? '');
    const hosted = hostedId;
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.query(
      `insert into public.rsvps (plan_id, user_id, state, checked_in_at) values ($1, $2, 'going', null), ($1, $3, 'checked_in', now())`,
      [hosted, OLU, BEN],
    );
    await db.query(
      `insert into public.conversations (kind, user_low, user_high) values ('direct', $1, $2)`,
      [ANA < BEN ? ANA : BEN, ANA < BEN ? BEN : ANA],
    );

    const k = key();
    await asUser(db, ANA, () => db.query('select public.account_delete($1)', [k]));
    await asUser(db, ANA, () => db.query('select public.account_delete($1)', [k]));

    const profile = await db.query<{
      display_name: string;
      status: string;
      city_id: string | null;
      people_visible: boolean;
    }>(
      'select display_name, status, city_id, people_visible from public.profiles where id = $1',
      [ANA],
    );
    expect(profile.rows[0]).toEqual({
      display_name: 'Deleted member',
      status: 'deleted',
      city_id: null,
      people_visible: false,
    });
    const ben = await db.query<{ state: string }>(
      'select state from public.rsvps where plan_id = $1 and user_id = $2',
      [plan, BEN],
    );
    expect(['going', 'offered']).toContain(ben.rows[0]?.state);
    const soup = await db.query<{ status: string }>(
      'select status from public.plans where id = $1',
      [hosted],
    );
    expect(soup.rows[0]?.status).toBe('cancelled');
    const guests = await db.query<{ state: string }>(
      'select state from public.rsvps where plan_id = $1',
      [hosted],
    );
    expect(guests.rows.every((g) => g.state === 'cancelled')).toBe(true);
    const members = await db.query('select 1 from public.circle_members where user_id = $1', [
      ANA,
    ]);
    expect(members.rows).toHaveLength(0);
    const circle = await db.query<{ status: string }>(
      'select status from public.circles where id = $1',
      [KITCHEN],
    );
    expect(circle.rows[0]?.status).toBe('archived');
    const purge = await db.query<{ kind: string; purge_after: string | null }>(
      'select kind, purge_after from public.data_requests where user_id = $1',
      [ANA],
    );
    expect(purge.rows[0]?.kind).toBe('delete');
    expect(purge.rows[0]?.purge_after).not.toBeNull();
    // Gone from People for everyone; nothing new can be written from the stub.
    const people = await asUser(db, BEN, () =>
      db.query<{ user_id: string }>('select user_id from public.people_in_my_circles()'),
    );
    expect(people.rows.map((r) => r.user_id)).not.toContain(ANA);
    await expect(
      asUser(db, ANA, () => db.query('select public.rsvp_join($1, $2)', [plan, key()])),
    ).rejects.toThrow(/account_deleted|plan_full/);
    await expect(
      asUser(db, ANA, () =>
        db.query(`update public.profiles set display_name = 'Ana' where id = $1`, [ANA]),
      ),
    ).rejects.toThrow(/account_deleted/);
    await expect(
      asUser(db, ANA, () =>
        db.query('select public.settings_update($1)', ['{"notif_direct": false}']),
      ),
    ).rejects.toThrow(/account_deleted/);
    await expect(
      asUser(db, ANA, () => db.query('select public.data_export_request($1)', [key()])),
    ).rejects.toThrow(/account_deleted/);
    await expect(
      asUser(db, ANA, () =>
        db.query(
          `insert into public.policy_acceptances (user_id, policy, version) values ($1, 'terms', '2026-11')`,
          [ANA],
        ),
      ),
    ).rejects.toThrow(/account_deleted/);
    // Nobody reaches the stub by direct message either.
    await expect(
      asUser(db, BEN, () =>
        db.query('select public.conversation_open($1, $2)', ['direct', ANA]),
      ),
    ).rejects.toThrow(/not_member/);
  });
});

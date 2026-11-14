import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000c1';
const GUEST = '00000000-0000-4000-8000-0000000000c2';
const GUEST2 = '00000000-0000-4000-8000-0000000000c3';
const CITY = '30000000-0000-4000-8000-0000000000c0';

let db: PGlite;
let plan = '';
let keyCounter = 0;
const key = () => `6c000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [HOST, GUEST, GUEST2]);
  await db.query(
    'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
    [HOST, 'Ama', CITY],
  );
  const starts = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const ends = new Date(Date.now() + 2 * 86_400_000 + 3 * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'cooking_night', 'in_person', 'West African Cooking Night', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 1, 'none', 'published') returning id`,
    [HOST, CITY, starts, ends],
  );
  plan = rows[0]?.id ?? '';
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now() + interval '1 day')`,
    [plan],
  );
});

describe('a guest from a shared link', () => {
  it('becomes a member with a profile, takes the spot or a place in line, and can cancel by token', async () => {
    const joined = await db
      .query<{ r: { status: string; cancel_token: string } }>(
        'select public.guest_rsvp_join($1, $2, $3, $4, $5) as r',
        [GUEST, plan, '  Sara ', 'Sara@Example.com', key()],
      )
      .then((x) => x.rows[0]?.r);
    const profile = await db.query<{ display_name: string; city_id: string }>(
      'select display_name, city_id from public.profiles where id = $1',
      [GUEST],
    );
    expect(profile.rows[0]).toEqual({ display_name: 'Sara', city_id: CITY });
    const accepted = await db.query<{ n: number }>(
      'select count(*)::int as n from public.policy_acceptances where user_id = $1',
      [GUEST],
    );
    expect(accepted.rows[0]?.n).toBe(3);

    expect(joined?.status).toBe('going');
    expect(joined?.cancel_token).toMatch(/^[0-9a-f-]{36}$/);
    // The host sees one more guest; the app's counts include them.
    const card = await asUser(db, null, () =>
      db.query<{ going_count: number; has_open_spot: boolean }>(
        'select going_count, has_open_spot from public.plan_cards where id = $1',
        [plan],
      ),
    );
    expect(card.rows[0]).toEqual({ going_count: 1, has_open_spot: false });
    // A second guest waits in line.
    const second = await db
      .query<{ r: { status: string } }>(
        'select public.guest_rsvp_join($1, $2, $3, $4, $5) as r',
        [GUEST2, plan, 'Jonas', 'jonas@example.com', key()],
      )
      .then((x) => x.rows[0]?.r);
    expect(second?.status).toBe('waitlisted');
    // The state by token, and a cancel that frees the spot for the next in line.
    const state = await db
      .query<{ s: { status: string; email: string } }>(
        'select public.guest_rsvp_state($1) as s',
        [joined?.cancel_token],
      )
      .then((x) => x.rows[0]?.s);
    expect(state).toEqual(
      expect.objectContaining({ status: 'going', email: 'sara@example.com' }),
    );
    await db.query('select public.guest_rsvp_cancel($1, $2)', [joined?.cancel_token, key()]);
    const after = await db.query<{ user_id: string; state: string }>(
      'select user_id, state from public.rsvps where plan_id = $1 order by user_id',
      [plan],
    );
    expect(after.rows).toEqual([
      { user_id: GUEST, state: 'cancelled' },
      { user_id: GUEST2, state: 'offered' },
    ]);
    await expect(
      db.query('select public.guest_rsvp_cancel($1, $2)', [
        '00000000-0000-4000-8000-0000000000ff',
        key(),
      ]),
    ).rejects.toThrow(/token_not_found/);
  });

  it('rate-limits attempts per scope and keeps everything away from app roles', async () => {
    for (let i = 0; i < 10; i += 1)
      await db.query('select public.web_rsvp_rate_check($1)', ['email:sara@example.com']);
    await expect(
      db.query('select public.web_rsvp_rate_check($1)', ['email:sara@example.com']),
    ).rejects.toThrow(/rate_limited/);
    await db.query('select public.web_rsvp_rate_check($1)', ['ip:203.0.113.9']);
    await expect(
      asUser(db, null, () =>
        db.query('select public.guest_rsvp_join($1, $2, $3, $4, $5)', [
          GUEST,
          plan,
          'X',
          'x@example.com',
          key(),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    // A failed join leaves no profile and no acceptances behind.
    await db.query(`update public.plans set status = 'cancelled' where id = $1`, [plan]);
    await expect(
      db.query('select public.guest_rsvp_join($1, $2, $3, $4, $5)', [
        GUEST2,
        plan,
        'Jonas',
        'jonas@example.com',
        key(),
      ]),
    ).rejects.toThrow(/plan_not_found/);
    const stub = await db.query('select 1 from public.profiles where id = $1', [GUEST2]);
    expect(stub.rows).toHaveLength(0);
    // Tokens go thirty days after the Plan.
    await db.query(
      `update public.plans set status = 'published', ends_at = now() - interval '31 days', starts_at = now() - interval '32 days' where id = $1`,
      [plan],
    );
    expect(
      (await db.query<{ n: number }>('select public.web_rsvp_cleanup() as n')).rows[0]?.n,
    ).toBe(0);
    await expect(
      asUser(db, HOST, () => db.query('select * from public.guest_rsvp_tokens')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, HOST, () =>
        db.query('select public.guest_rsvp_state($1)', [
          '00000000-0000-4000-8000-0000000000ff',
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

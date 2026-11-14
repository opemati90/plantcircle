import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000c1';
const GUEST = '00000000-0000-4000-8000-0000000000c2';
const WAITER = '00000000-0000-4000-8000-0000000000c3';
const STAFF = '00000000-0000-4000-8000-0000000000c4';
const CITY = '30000000-0000-4000-8000-0000000000c9';
const PLAN = '10000000-0000-4000-8000-0000000000c1';
const CIRCLE = '50000000-0000-4000-8000-0000000000c1';

let db: PGlite;
let n = 0;
const key = () => `6f000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name, role] of [
    [HOST, 'Ama', 'member'],
    [GUEST, 'Ben', 'member'],
    [WAITER, 'Cem', 'member'],
    [STAFF, 'Dana', 'staff'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, role, is_verified_host) values ($1, $2, $3, $4, true)',
      [id, name, CITY, role],
    );
  }
  await db.query(
    `insert into public.plans (id, host_id, title, kind, city_id, area_label, starts_at, ends_at, tz, capacity, description, status)
     values ($1, $2, 'Soup night', 'cooking_night', $3, 'Neukölln', now() + interval '2 days', now() + interval '2 days 3 hours', 'Europe/Berlin', 1, 'x', 'published')`,
    [PLAN, HOST, CITY],
  );
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now() - interval '1 hour')`,
    [PLAN],
  );
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'request', $3)`,
    [CIRCLE, CITY, HOST],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner')`,
    [CIRCLE, HOST],
  );
});

const rsvp = (user: string, fn = 'rsvp_join') =>
  asUser(db, user, () =>
    db.query<{ r: { status: string } }>(`select public.${fn}($1, $2) as r`, [PLAN, key()]),
  ).then((x) => x.rows[0]?.r);
const planStatus = () =>
  db
    .query<{ status: string; hold_reason: string | null }>(
      'select status, hold_reason from public.plans where id = $1',
      [PLAN],
    )
    .then((r) => r.rows[0]);
const inbox = (user: string) =>
  asUser(db, user, () =>
    db.query<{ type: string; payload: Record<string, unknown> }>(
      'select type, payload from public.notifications order by created_at',
    ),
  ).then((r) => r.rows);

describe('T-08: a suspended host', () => {
  it('puts their upcoming Plans on hold, pauses joins, withholds the address, tells guests when they hear, and resumes', async () => {
    await rsvp(GUEST);
    const report = await asUser(db, GUEST, () =>
      db.query<{ r: { case_ref: string } }>(
        "select public.report_create('person', $1, 'harassment', 'Kept messaging after I said no.', true, $2) as r",
        [HOST, key()],
      ),
    ).then((x) => x.rows[0]?.r);
    const reportId = (
      await asUser(db, STAFF, () =>
        db.query<{ id: string }>('select id from public.staff_queue() where case_ref = $1', [
          report?.case_ref,
        ]),
      )
    ).rows[0]?.id;
    await asUser(db, STAFF, () =>
      db.query('select public.staff_decide($1, $2, $3, $4, $5, $6)', [
        reportId,
        'suspend',
        'Repeated messages after a member declined contact',
        'Community Rules §3',
        new Date(Date.now() + 86_400_000).toISOString(),
        key(),
      ]),
    );
    expect(await planStatus()).toEqual({ status: 'on_hold', hold_reason: 'host_suspended' });
    // Joining is paused; the address is withheld even though reveal time has passed.
    await expect(rsvp(WAITER)).rejects.toThrow(/plan_not_found/);
    const sees = await asUser(db, GUEST, () =>
      db.query<{ ok: boolean }>('select public.can_see_address($1) as ok', [PLAN]),
    );
    expect(sees.rows[0]?.ok).toBe(false);
    // The guest heard, with the time they will hear more (the end of the suspension).
    const hold = (await inbox(GUEST)).find((x) => x.type === 'plan_on_hold');
    expect(hold?.payload).toEqual(expect.objectContaining({ plan: 'Soup night' }));
    expect(typeof hold?.payload['time']).toBe('string');
    // The suspension is reversed on appeal: the Plan resumes.
    const action = (
      await db.query<{ id: string }>('select id from public.moderation_actions limit 1')
    ).rows[0]?.id;
    await asUser(db, HOST, () =>
      db.query('select public.appeal_create($1, $2, $3)', [
        action,
        'I stopped at once.',
        key(),
      ]),
    );
    const appeal = (await db.query<{ id: string }>('select id from public.appeals limit 1'))
      .rows[0]?.id;
    await db.query(`update public.profiles set role = 'staff' where id = $1`, [WAITER]);
    await asUser(db, WAITER, () =>
      db.query('select public.staff_appeal_decide($1, false, $2, $3)', [
        appeal,
        'Looked again.',
        key(),
      ]),
    );
    expect(await planStatus()).toEqual({ status: 'published', hold_reason: null });
  });
});

describe('T-17: an offer that ran out', () => {
  it('tells the member, frees the spot for the next in line, and refuses a late confirmation', async () => {
    await rsvp(GUEST);
    expect((await rsvp(WAITER))?.status).toBe('waitlisted');
    await rsvp(GUEST, 'rsvp_cancel');
    expect(
      (
        await db.query<{ state: string }>('select state from public.rsvps where user_id = $1', [
          WAITER,
        ])
      ).rows[0]?.state,
    ).toBe('offered');
    await db.query(
      `update public.rsvps set offer_expires_at = now() - interval '1 minute' where user_id = $1`,
      [WAITER],
    );
    // Even once the Plan has started, the stale offer cannot be confirmed.
    await db.query(
      `update public.plans set starts_at = now() - interval '1 minute' where id = $1`,
      [PLAN],
    );
    const late = await asUser(db, WAITER, () =>
      db.query<{ r: { status: string } }>('select public.waitlist_respond($1, true, $2) as r', [
        PLAN,
        key(),
      ]),
    ).then((x) => x.rows[0]?.r);
    expect(late?.status).toBe('expired');
    expect((await inbox(WAITER)).map((x) => x.type)).toContain('waitlist_expired');
    const pushed = await db.query<{ type: string; push: boolean; email: boolean }>(
      'select type, push, email from public.push_queue where user_id = $1 order by created_at',
      [WAITER],
    );
    expect(pushed.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'waitlist_offer', push: true, email: false }),
        expect.objectContaining({ type: 'waitlist_offer', push: false, email: true }),
        expect.objectContaining({ type: 'waitlist_expired', push: true }),
      ]),
    );
    // Only device rows are claimed by the dispatcher.
    const claimed = await db.query<{ email: boolean }>(
      'select email from public.push_queue_claim(50)',
    );
    expect(claimed.rows.every((r) => !r.email)).toBe(true);
  });
});

describe('completion and feedback', () => {
  it('completes a Plan two hours after it ends, marks no-shows, and takes feedback once', async () => {
    await rsvp(GUEST);
    await db.query(
      `update public.plans set starts_at = now() - interval '6 hours', ends_at = now() - interval '3 hours' where id = $1`,
      [PLAN],
    );
    expect(
      (await db.query<{ n: number }>('select public.plans_complete_due() as n')).rows[0]?.n,
    ).toBe(1);
    expect((await planStatus())?.status).toBe('completed');
    expect(
      (
        await db.query<{ state: string }>('select state from public.rsvps where user_id = $1', [
          GUEST,
        ])
      ).rows[0]?.state,
    ).toBe('no_show');
    // Feedback needs a check-in; given once, a second attempt is refused.
    await db.query(
      `update public.rsvps set state = 'checked_in', checked_in_at = now() where user_id = $1`,
      [GUEST],
    );
    await asUser(db, GUEST, () =>
      db.query('select public.plan_feedback_submit($1, 5, null, $2)', [PLAN, key()]),
    );
    await expect(
      asUser(db, GUEST, () =>
        db.query('select public.plan_feedback_submit($1, 3, null, $2)', [PLAN, key()]),
      ),
    ).rejects.toThrow(/feedback_exists/);
  });
});

describe('Circles', () => {
  it('lets a member leave (not the last owner), waits 30 days after a decline, and audits decisions', async () => {
    await expect(
      asUser(db, HOST, () => db.query('select public.circle_leave($1, $2)', [CIRCLE, key()])),
    ).rejects.toThrow(/last_owner/);
    await asUser(db, GUEST, () =>
      db.query('select public.circle_join($1, $2, $3)', [CIRCLE, 'Hi', key()]),
    );
    const request = (await db.query<{ id: string }>('select id from public.circle_requests'))
      .rows[0]?.id;
    await asUser(db, HOST, () =>
      db.query('select public.circle_request_respond($1, false, $2)', [request, key()]),
    );
    await expect(
      asUser(db, GUEST, () =>
        db.query('select public.circle_join($1, $2, $3)', [CIRCLE, 'Again', key()]),
      ),
    ).rejects.toThrow(/request_cooldown/);
    await db.query(
      `update public.circle_requests set decided_at = now() - interval '31 days' where id = $1`,
      [request],
    );
    await asUser(db, GUEST, () =>
      db.query('select public.circle_join($1, $2, $3)', [CIRCLE, 'Again', key()]),
    );
    const second = (
      await db.query<{ id: string }>(
        "select id from public.circle_requests where status = 'pending'",
      )
    ).rows[0]?.id;
    await asUser(db, HOST, () =>
      db.query('select public.circle_request_respond($1, true, $2)', [second, key()]),
    );
    const audit = await db.query<{ action: string }>(
      "select action from public.audit_events where target_type = 'circle' order by created_at",
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'circle.request_declined',
      'circle.request_approved',
    ]);
    const left = await asUser(db, GUEST, () =>
      db.query<{ r: { status: string } }>('select public.circle_leave($1, $2) as r', [
        CIRCLE,
        key(),
      ]),
    );
    expect(left.rows[0]?.r.status).toBe('none');
    expect(
      (await db.query('select 1 from public.circle_members where user_id = $1', [GUEST])).rows,
    ).toHaveLength(0);
  });
});

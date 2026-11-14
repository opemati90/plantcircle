import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000f1';
const MIA = '00000000-0000-4000-8000-0000000000f2';
const JONAS = '00000000-0000-4000-8000-0000000000f3';
const LATE = '00000000-0000-4000-8000-0000000000f4';
const CITY = '30000000-0000-4000-8000-0000000000c5';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `64000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama'],
    [MIA, 'Mia'],
    [JONAS, 'Jonas'],
    [LATE, 'Lena'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
      [id, name, CITY],
    );
  }
});

/** A Plan that starts `startsInHours` from now (negative: it started already) and runs 3 hours. */
async function plan(startsInHours: number, status = 'published'): Promise<string> {
  const starts = new Date(Date.now() + startsInHours * 3_600_000).toISOString();
  const ends = new Date(Date.now() + (startsInHours + 3) * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label,
       starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'cooking_night', 'in_person', 'Lentil night', '', $2, 'Neukölln',
       $3, $4, 'Europe/Berlin', 8, 'none', $5)
     returning id`,
    [HOST, CITY, starts, ends, status],
  );
  const id = rows[0]?.id ?? '';
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now())`,
    [id],
  );
  return id;
}

async function rsvp(planId: string, user: string, state: string): Promise<void> {
  const checkedIn = state === 'checked_in';
  await db.query(
    `insert into public.rsvps (plan_id, user_id, state, checked_in_at, checked_in_by)
     values ($1, $2, $3::public.rsvp_state, $4::timestamptz, $5::uuid)`,
    [planId, user, state, checkedIn ? new Date().toISOString() : null, checkedIn ? HOST : null],
  );
}

const checkIn = (actor: string, planId: string, guest: string, checkedIn = true) =>
  asUser(db, actor, () =>
    db.query<{ result: { state: string } }>(
      'select public.host_check_in($1, $2, $3, $4) as result',
      [planId, guest, checkedIn, newKey()],
    ),
  ).then((r) => r.rows[0]?.result.state);

const stateOf = async (planId: string, guest: string) =>
  (
    await db.query<{ state: string }>(
      'select state from public.rsvps where plan_id = $1 and user_id = $2',
      [planId, guest],
    )
  ).rows[0]?.state;

describe('checking guests in', () => {
  it('lets only the host check a guest in', async () => {
    const id = await plan(0.5);
    await rsvp(id, MIA, 'going');
    await expect(checkIn(JONAS, id, MIA)).rejects.toThrow(/not_host/);
    expect(await stateOf(id, MIA)).toBe('going');
  });

  it('checks a guest in, records it in the audit trail, and undoes it on request', async () => {
    const id = await plan(0.5);
    await rsvp(id, MIA, 'going');
    expect(await checkIn(HOST, id, MIA)).toBe('checked_in');
    expect(await stateOf(id, MIA)).toBe('checked_in');
    expect(await checkIn(HOST, id, MIA, false)).toBe('going');
    const audit = await db.query<{ action: string }>(
      'select action from public.audit_events where plan_id = $1 order by created_at',
      [id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['host.check_in', 'host.undo_check_in']);
  });

  it('opens two hours before the start, and closes two hours after the end', async () => {
    const early = await plan(3);
    await rsvp(early, MIA, 'going');
    await expect(checkIn(HOST, early, MIA)).rejects.toThrow(/checkin_closed/);

    const ended = await plan(-6);
    await rsvp(ended, MIA, 'going');
    await expect(checkIn(HOST, ended, MIA)).rejects.toThrow(/checkin_closed/);
  });

  it('refuses a guest who is not going, such as someone on the waitlist', async () => {
    const id = await plan(0.5);
    await rsvp(id, MIA, 'waitlisted');
    await expect(checkIn(HOST, id, MIA)).rejects.toThrow(/guest_not_found/);
  });

  it('answers a retry with the same key with the same result', async () => {
    const id = await plan(0.5);
    await rsvp(id, MIA, 'going');
    const key = newKey();
    const first = await asUser(db, HOST, () =>
      db.query<{ result: { state: string } }>(
        'select public.host_check_in($1, $2, true, $3) as result',
        [id, MIA, key],
      ),
    );
    const again = await asUser(db, HOST, () =>
      db.query<{ result: { state: string } }>(
        'select public.host_check_in($1, $2, true, $3) as result',
        [id, MIA, key],
      ),
    );
    expect(again.rows[0]?.result).toEqual(first.rows[0]?.result);
  });
});

describe('ending a Plan', () => {
  it('refuses to end a Plan before it starts', async () => {
    const id = await plan(2);
    await expect(
      asUser(db, HOST, () => db.query('select public.host_end_plan($1, $2)', [id, newKey()])),
    ).rejects.toThrow(/plan_not_started/);
  });

  it('ends a started Plan: going guests become no-shows, people in line are cancelled', async () => {
    const id = await plan(-1);
    await rsvp(id, MIA, 'going');
    await rsvp(id, JONAS, 'checked_in');
    await rsvp(id, LATE, 'waitlisted');
    await asUser(db, HOST, () =>
      db.query('select public.host_end_plan($1, $2)', [id, newKey()]),
    );
    expect(await stateOf(id, MIA)).toBe('no_show');
    expect(await stateOf(id, JONAS)).toBe('checked_in');
    expect(await stateOf(id, LATE)).toBe('cancelled');
    const status = await db.query<{ status: string }>(
      'select status from public.plans where id = $1',
      [id],
    );
    expect(status.rows[0]?.status).toBe('completed');
  });

  it('records each guest whose state the end changes, for the audit trail', async () => {
    const id = await plan(-1);
    await rsvp(id, MIA, 'going');
    await rsvp(id, LATE, 'waitlisted');
    await asUser(db, HOST, () =>
      db.query('select public.host_end_plan($1, $2)', [id, newKey()]),
    );
    const audit = await db.query<{ action: string; subject_id: string | null }>(
      'select action, subject_id from public.audit_events where plan_id = $1 order by created_at, action',
      [id],
    );
    expect(audit.rows.map((r) => r.action).sort()).toEqual([
      'host.end_cancel_waiting',
      'host.end_plan',
      'host.mark_no_show',
    ]);
    expect(audit.rows.find((r) => r.action === 'host.mark_no_show')?.subject_id).toBe(MIA);
  });

  it('lets only the host end the Plan', async () => {
    const id = await plan(-1);
    await expect(
      asUser(db, MIA, () => db.query('select public.host_end_plan($1, $2)', [id, newKey()])),
    ).rejects.toThrow(/not_host/);
  });
});

describe('what the host sees', () => {
  it('shows the guest list and counts to the host only', async () => {
    const id = await plan(0.5);
    await rsvp(id, MIA, 'going');
    await expect(
      asUser(db, JONAS, () => db.query('select * from public.host_guest_list($1)', [id])),
    ).rejects.toThrow(/not_host/);
    const list = await asUser(db, HOST, () =>
      db.query<{ display_name: string }>(
        'select display_name from public.host_guest_list($1)',
        [id],
      ),
    );
    expect(list.rows.map((r) => r.display_name)).toEqual(['Mia']);
  });
});

describe('feedback', () => {
  it('lets a checked-in guest leave feedback only once the Plan has ended', async () => {
    const live = await plan(-1);
    await rsvp(live, MIA, 'checked_in');
    await expect(
      asUser(db, MIA, () =>
        db.query('select public.plan_feedback_submit($1, 5, null, $2)', [live, newKey()]),
      ),
    ).rejects.toThrow(/feedback_not_open/);

    const done = await plan(-5);
    await rsvp(done, MIA, 'checked_in');
    await asUser(db, MIA, () =>
      db.query('select public.plan_feedback_submit($1, 4, ' + "'Lovely soup.'" + ', $2)', [
        done,
        newKey(),
      ]),
    );
    const mine = await asUser(db, MIA, () =>
      db.query<{ result: { eligible: boolean; rating: number; comment: string } }>(
        'select public.plan_feedback_mine($1) as result',
        [done],
      ),
    );
    expect(mine.rows[0]?.result).toEqual({
      eligible: true,
      rating: 4,
      comment: 'Lovely soup.',
    });
  });

  it('refuses a guest who did not come, and ratings outside 1 to 5', async () => {
    const done = await plan(-5);
    await rsvp(done, JONAS, 'no_show');
    await expect(
      asUser(db, JONAS, () =>
        db.query('select public.plan_feedback_submit($1, 5, null, $2)', [done, newKey()]),
      ),
    ).rejects.toThrow(/feedback_not_open/);
    await rsvp(done, MIA, 'checked_in');
    await expect(
      asUser(db, MIA, () =>
        db.query('select public.plan_feedback_submit($1, 6, null, $2)', [done, newKey()]),
      ),
    ).rejects.toThrow(/invalid_feedback/);
  });

  it('shows the host the count and the average from three ratings, and never the comments', async () => {
    const done = await plan(-5);
    await rsvp(done, MIA, 'checked_in');
    await rsvp(done, JONAS, 'checked_in');
    await rsvp(done, LATE, 'checked_in');
    await asUser(db, MIA, () =>
      db.query('select public.plan_feedback_submit($1, 5, null, $2)', [done, newKey()]),
    );
    await asUser(db, JONAS, () =>
      db.query('select public.plan_feedback_submit($1, 4, null, $2)', [done, newKey()]),
    );
    const early = await asUser(db, HOST, () =>
      db.query<{ result: { average_rating: number | null } }>(
        'select public.host_plan_summary($1) as result',
        [done],
      ),
    );
    expect(early.rows[0]?.result.average_rating).toBeNull();
    await asUser(db, LATE, () =>
      db.query('select public.plan_feedback_submit($1, 3, null, $2)', [done, newKey()]),
    );
    const summary = await asUser(db, HOST, () =>
      db.query<{
        result: { feedback_count: number; average_rating: number; checked_in: number };
      }>('select public.host_plan_summary($1) as result', [done]),
    );
    expect(summary.rows[0]?.result).toMatchObject({
      feedback_count: 3,
      average_rating: 4,
      checked_in: 3,
    });
  });
});

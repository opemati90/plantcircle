import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ANA = '00000000-0000-4000-8000-0000000000e1';
const BEN = '00000000-0000-4000-8000-0000000000e2';
const OLU = '00000000-0000-4000-8000-0000000000e3';
const DANA = '00000000-0000-4000-8000-0000000000e4'; // staff
const SAM = '00000000-0000-4000-8000-0000000000e5'; // staff
const CITY = '30000000-0000-4000-8000-0000000000e0';
const KITCHEN = '50000000-0000-4000-8000-0000000000e0';

let db: PGlite;
let plan = '';
let keyCounter = 0;
const key = () => `69000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

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
    [DANA, 'Dana'],
    [SAM, 'Sam'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, people_visible, is_verified_host) values ($1, $2, $3, true, true)',
      [id, name, CITY],
    );
  }
  await db.query(`update public.profiles set role = 'staff' where id in ($1, $2)`, [DANA, SAM]);
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, ANA],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')`,
    [KITCHEN, ANA, BEN, OLU, DANA],
  );
  const starts = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const ends = new Date(Date.now() + 8 * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'potluck', 'in_person', 'Potluck', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 8, 'none', 'published') returning id`,
    [ANA, CITY, starts, ends],
  );
  plan = rows[0]?.id ?? '';
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now())`,
    [plan],
  );
});

const block = (who: string, whom: string) =>
  asUser(db, who, () => db.query('select public.block_user($1, $2)', [whom, key()]));
const people = (who: string) =>
  asUser(db, who, () =>
    db.query<{ user_id: string }>('select user_id from public.people_in_my_circles()'),
  ).then((r) => r.rows.map((x) => x.user_id));
const request = (from: string, to: string) =>
  asUser(db, from, () =>
    db.query<{ result: { status: string } }>('select public.dm_request($1, $2, $3) as result', [
      to,
      'Hi there',
      key(),
    ]),
  ).then((r) => r.rows[0]?.result);
const join = (who: string): Promise<{ status: string } | undefined> =>
  asUser(db, who, () =>
    db.query<{ result: { status: string } }>('select public.rsvp_join($1, $2) as result', [
      plan,
      key(),
    ]),
  ).then((r) => r.rows[0]?.result);
const report = (
  who: string,
  type: string,
  id: string,
  category = 'harassment',
  details = 'Kept messaging after I said no.',
  confirmed = true,
) =>
  asUser(db, who, () =>
    db.query<{ result: { case_ref: string; severity: string } }>(
      'select public.report_create($1, $2, $3, $4, $5, $6) as result',
      [type, id, category, details, confirmed, key()],
    ),
  ).then((r) => r.rows[0]?.result);
const queue = (who: string) =>
  asUser(db, who, () =>
    db.query<{ id: string; case_ref: string; severity: string; status: string }>(
      'select id, case_ref, severity, status from public.staff_queue()',
    ),
  ).then((r) => r.rows);
const decide = (who: string, reportId: string, action: string, until: string | null = null) =>
  asUser(db, who, () =>
    db.query<{ result: { action_id: string; status: string } }>(
      'select public.staff_decide($1, $2, $3, $4, $5, $6) as result',
      [
        reportId,
        action,
        'Repeated messages after a member declined contact',
        'Community Rules §3',
        until,
        key(),
      ],
    ),
  ).then((r) => r.rows[0]?.result);

describe('blocking', () => {
  it('hides both people from each other, ends pending contact, and refuses new contact silently', async () => {
    await request(BEN, ANA);
    expect(await people(ANA)).toContain(BEN);
    // Ben was going to Ana's Plan before the block.
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.query(
      `insert into public.rsvps (plan_id, user_id, state) values ($1, $2, 'going')`,
      [plan, BEN],
    );
    await block(ANA, BEN);
    expect(await people(ANA)).not.toContain(BEN);
    expect(await people(BEN)).not.toContain(ANA);
    const pending = await asUser(db, ANA, () =>
      db.query('select id from public.message_request_cards'),
    );
    expect(pending.rows).toHaveLength(0);
    // Ben still reads "pending": a block is never disclosed. Ana (the blocker) is told.
    expect((await request(BEN, ANA))?.status).toBe('pending');
    await expect(request(ANA, BEN)).rejects.toThrow(/blocked/);
    // Even with an older conversation, a request from the blocked side reads as pending.
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.query(
      `insert into public.conversations (kind, user_low, user_high) values ('direct', $1, $2) on conflict do nothing`,
      [ANA < BEN ? ANA : BEN, ANA < BEN ? BEN : ANA],
    );
    expect((await request(BEN, ANA))?.status).toBe('pending');
    await expect(
      asUser(db, BEN, () =>
        db.query('select public.conversation_open($1, $2)', ['direct', ANA]),
      ),
    ).rejects.toThrow(/not_member/);
    // Ben is not told either when posting in Ana's Plan chat: it answers as if he were not a member.
    const chat = await asUser(db, BEN, () =>
      db.query<{ id: string }>('select public.conversation_open($1, $2) as id', ['plan', plan]),
    ).then((r) => r.rows[0]?.id ?? '');
    await expect(
      asUser(db, BEN, () =>
        db.query('select public.message_post($1, $2, $3)', [chat, 'hi', key()]),
      ),
    ).rejects.toThrow(/not_member/);
    // Nor when he tries to join again after cancelling: the Plan answers as if it were not there.
    await asUser(db, BEN, () =>
      db.query('select public.rsvp_cancel($1, $2)', [plan, key()]),
    ).catch(() => undefined);
    await expect(join(BEN)).rejects.toThrow(/plan_not_found|blocked/);
    expect((await join(OLU))?.status).toBe('going');
    const mine = await asUser(db, ANA, () =>
      db.query<{ display_name: string }>('select display_name from public.my_blocks()'),
    );
    expect(mine.rows).toEqual([{ display_name: 'Ben' }]);
    await asUser(db, ANA, () => db.query('select public.unblock_user($1)', [BEN]));
    expect(await people(ANA)).toContain(BEN);
  });
  it('is idempotent and refuses self and strangers', async () => {
    const k = key();
    await asUser(db, ANA, () => db.query('select public.block_user($1, $2)', [BEN, k]));
    await asUser(db, ANA, () => db.query('select public.block_user($1, $2)', [BEN, k]));
    await expect(block(ANA, ANA)).rejects.toThrow(/person_not_found/);
    await expect(
      asUser(db, null, () => db.query('select public.block_user($1, $2)', [BEN, key()])),
    ).rejects.toThrow();
  });
});

describe('reporting', () => {
  it('gives a case reference, triages by category, and keeps the reporter to their own cases', async () => {
    const r = await report(BEN, 'person', ANA, 'threats');
    expect(r?.case_ref).toMatch(/^PC-\d+$/);
    expect(r?.severity).toBe('urgent');
    expect((await report(BEN, 'plan', plan, 'other', 'Wrong address'))?.severity).toBe(
      'routine',
    );
    await expect(report(BEN, 'person', ANA, 'harassment', 'x', false)).rejects.toThrow(
      /invalid_report/,
    );
    await expect(report(BEN, 'person', BEN)).rejects.toThrow(/target_not_found/);
    await expect(report(BEN, 'plan', '00000000-0000-4000-8000-00000000ffff')).rejects.toThrow(
      /target_not_found/,
    );
    const mine = await asUser(db, BEN, () =>
      db.query<{ status: string }>('select status from public.my_reports()'),
    );
    expect(mine.rows).toHaveLength(2);
    const others = await asUser(db, OLU, () => db.query('select * from public.my_reports()'));
    expect(others.rows).toHaveLength(0);
    await expect(
      asUser(db, BEN, () => db.query('select * from public.reports')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('staff decisions and suspension', () => {
  it('lets only staff see the queue and decide; suspension pauses writing, reading stays open', async () => {
    const r = await report(BEN, 'person', ANA, 'harassment');
    await expect(queue(BEN)).rejects.toThrow(/not_staff/);
    const open = await queue(DANA);
    expect(open.map((x) => x.case_ref)).toContain(r?.case_ref);
    const id = open.find((x) => x.case_ref === r?.case_ref)?.id ?? '';
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await expect(decide(BEN, id, 'suspend', until)).rejects.toThrow(/not_staff/);
    await expect(decide(DANA, id, 'suspend', null)).rejects.toThrow(/invalid_decision/);
    const d = await decide(DANA, id, 'suspend', until);
    expect(d?.status).toBe('actioned');
    await expect(decide(DANA, id, 'warn')).rejects.toThrow(/report_closed/);

    // Ana is paused: no posting, no joining, no messaging, no profile edits; she still reads and can block.
    await expect(
      asUser(db, ANA, () =>
        db.query(`update public.profiles set display_name = 'Anna' where id = $1`, [ANA]),
      ),
    ).rejects.toThrow(/suspended/);
    await block(ANA, OLU);
    expect(await people(ANA)).not.toContain(OLU);
    await expect(
      asUser(db, ANA, () =>
        db.query('select public.dm_request($1, $2, $3)', [OLU, 'hi', key()]),
      ),
    ).rejects.toThrow(/suspended/);
    await expect(
      asUser(db, ANA, () =>
        db.query(
          `select public.plan_create('potluck', 'in_person', 'Soup night', '', $1::timestamptz, $2::timestamptz, 6, array['none'], 'Neukölln', 'Weserstraße 1', false, null, $3)`,
          [
            new Date(Date.now() + 2 * 86_400_000).toISOString(),
            new Date(Date.now() + 2 * 86_400_000 + 7_200_000).toISOString(),
            key(),
          ],
        ),
      ),
    ).rejects.toThrow(/suspended/);
    const cards = await asUser(db, ANA, () => db.query('select id from public.plan_cards'));
    expect(cards.rows.length).toBeGreaterThan(0);

    const notice = await asUser(db, ANA, () =>
      db.query<{
        result: { action: string; reason: string; rule: string; appeal_status: string | null };
      }>('select public.my_suspension() as result'),
    );
    expect(notice.rows[0]?.result).toEqual(
      expect.objectContaining({
        action: 'suspend',
        rule: 'Community Rules §3',
        appeal_status: null,
      }),
    );
    const none = await asUser(db, BEN, () =>
      db.query<{ result: null }>('select public.my_suspension() as result'),
    );
    expect(none.rows[0]?.result).toBeNull();

    const audit = await asUser(db, DANA, () =>
      db.query<{ action: string; reason: string }>(
        'select action, reason from public.staff_audit(10)',
      ),
    );
    expect(audit.rows[0]).toEqual({
      action: 'staff.suspend',
      reason: 'Repeated messages after a member declined contact',
    });
  });

  it('never lets staff decide about themselves, freezes messages, and keeps a later ban when an older suspension is reversed', async () => {
    const about = await report(BEN, 'person', DANA, 'harassment');
    const selfId = (await queue(SAM)).find((x) => x.case_ref === about?.case_ref)?.id ?? '';
    await expect(decide(DANA, selfId, 'no_action')).rejects.toThrow(/invalid_decision/);
    // Freeze: Dana can still read and join, but not post.
    expect(
      (
        await decide(
          SAM,
          selfId,
          'freeze_messages',
          new Date(Date.now() + 86_400_000).toISOString(),
        )
      )?.status,
    ).toBe('actioned');
    await expect(
      asUser(db, DANA, () =>
        db.query('select public.dm_request($1, $2, $3)', [OLU, 'hi', key()]),
      ),
    ).rejects.toThrow(/messages_frozen/);
    expect((await join(DANA))?.status).toBe('going');

    // Suspension, appeal, then a later ban: reversing the old suspension must not lift the ban.
    const r1 = await report(BEN, 'person', ANA, 'harassment');
    const id1 = (await queue(SAM)).find((x) => x.case_ref === r1?.case_ref)?.id ?? '';
    const d1 = await decide(
      SAM,
      id1,
      'suspend',
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    const a = await asUser(db, ANA, () =>
      db.query<{ result: { id: string } }>(
        'select public.appeal_create($1, $2, $3) as result',
        [d1?.action_id, 'Please look again.', key()],
      ),
    ).then((x) => x.rows[0]?.result);
    const r2 = await report(OLU, 'person', ANA, 'threats');
    const id2 = (await queue(SAM)).find((x) => x.case_ref === r2?.case_ref)?.id ?? '';
    await decide(SAM, id2, 'ban');
    // Neither the original reviewer nor the appellant decides the appeal.
    await expect(
      asUser(db, ANA, () =>
        db.query('select public.staff_appeal_decide($1, $2, $3, $4)', [
          a?.id,
          false,
          'x',
          key(),
        ]),
      ),
    ).rejects.toThrow(/not_staff/);
    await asUser(db, DANA, () =>
      db.query('select public.staff_appeal_decide($1, $2, $3, $4)', [
        a?.id,
        false,
        'Looked again.',
        key(),
      ]),
    );
    const standing = await db.query<{ status: string; suspended_until: string | null }>(
      'select status, suspended_until from public.profiles where id = $1',
      [ANA],
    );
    expect(standing.rows[0]).toEqual({ status: 'suspended', suspended_until: null });
    // A frozen member sees the freeze as their notice.
    const frozenNotice = await asUser(db, DANA, () =>
      db.query<{ result: { action: string } }>('select public.my_suspension() as result'),
    );
    expect(frozenNotice.rows[0]?.result.action).toBe('freeze_messages');
  });

  it('keeps an earlier ban when a later suspension is reversed, and an older freeze when a newer one is', async () => {
    const r1 = await report(BEN, 'person', ANA, 'threats');
    const id1 = (await queue(SAM)).find((x) => x.case_ref === r1?.case_ref)?.id ?? '';
    await decide(SAM, id1, 'ban');
    const r2 = await report(OLU, 'person', ANA, 'harassment');
    const id2 = (await queue(SAM)).find((x) => x.case_ref === r2?.case_ref)?.id ?? '';
    const d2 = await decide(
      SAM,
      id2,
      'suspend',
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    const a = await asUser(db, ANA, () =>
      db.query<{ result: { id: string } }>(
        'select public.appeal_create($1, $2, $3) as result',
        [d2?.action_id, 'Please look again.', key()],
      ),
    ).then((x) => x.rows[0]?.result);
    await asUser(db, DANA, () =>
      db.query('select public.staff_appeal_decide($1, $2, $3, $4)', [
        a?.id,
        false,
        'Looked again.',
        key(),
      ]),
    );
    const standing = await db.query<{ status: string; suspended_until: string | null }>(
      'select status, suspended_until from public.profiles where id = $1',
      [ANA],
    );
    expect(standing.rows[0]).toEqual({ status: 'suspended', suspended_until: null });
  });

  it('only takes reports about things the reporter can see', async () => {
    const stranger = '00000000-0000-4000-8000-0000000000e9';
    await db.query('insert into auth.users (id) values ($1)', [stranger]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [
      stranger,
      'Stranger',
    ]);
    await expect(report(BEN, 'person', stranger)).rejects.toThrow(/target_not_found/);
    expect((await report(BEN, 'person', ANA))?.case_ref).toMatch(/^PC-/);
  });

  it('takes one appeal per decision, decided by a different reviewer; reversing lifts the suspension', async () => {
    const r = await report(BEN, 'person', ANA, 'harassment');
    const id = (await queue(DANA)).find((x) => x.case_ref === r?.case_ref)?.id ?? '';
    const d = await decide(
      DANA,
      id,
      'suspend',
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    const appeal = (who: string, action: string) =>
      asUser(db, who, () =>
        db.query<{ result: { id: string } }>(
          'select public.appeal_create($1, $2, $3) as result',
          [action, 'It was a group order question, not an ad.', key()],
        ),
      ).then((x) => x.rows[0]?.result);
    await expect(appeal(BEN, d?.action_id ?? '')).rejects.toThrow(/action_not_found/);
    const a = await appeal(ANA, d?.action_id ?? '');
    await expect(appeal(ANA, d?.action_id ?? '')).rejects.toThrow(/already_appealed/);
    const waiting = await asUser(db, SAM, () =>
      db.query<{ id: string; original_actor_name: string }>(
        'select id, original_actor_name from public.staff_appeals()',
      ),
    );
    expect(waiting.rows).toEqual([
      expect.objectContaining({ id: a?.id, original_actor_name: 'Dana' }),
    ]);
    const decideAppeal = (who: string, uphold: boolean) =>
      asUser(db, who, () =>
        db.query<{ result: { status: string } }>(
          'select public.staff_appeal_decide($1, $2, $3, $4) as result',
          [a?.id, uphold, 'The Circles asked where to buy.', key()],
        ),
      ).then((x) => x.rows[0]?.result);
    await expect(decideAppeal(DANA, false)).rejects.toThrow(/same_reviewer/);
    expect((await decideAppeal(SAM, false))?.status).toBe('reversed');
    const active = await db.query<{ status: string }>(
      'select status from public.profiles where id = $1',
      [ANA],
    );
    expect(active.rows[0]?.status).toBe('active');
    expect((await request(ANA, OLU))?.status).toBe('pending');
    const c = await asUser(db, DANA, () =>
      db.query<{ result: { status: string; appeal: { status: string } } }>(
        'select public.staff_case($1) as result',
        [id],
      ),
    );
    expect(c.rows[0]?.result.status).toBe('closed');
    expect(c.rows[0]?.result.appeal.status).toBe('reversed');
  });

  it('shows private messages only with a reason and logs every view', async () => {
    const conversation = await asUser(db, ANA, () =>
      db.query<{ id: string }>('select public.conversation_open($1, $2) as id', ['plan', plan]),
    ).then((r) => r.rows[0]?.id ?? '');
    const posted = await asUser(db, ANA, () =>
      db.query<{ result: { id: string } }>('select public.message_post($1, $2, $3) as result', [
        conversation,
        'Bring cash to my account first',
        key(),
      ]),
    ).then((r) => r.rows[0]?.result.id ?? '');
    await join(BEN);
    const r = await report(BEN, 'message', posted, 'scam');
    const id = (await queue(DANA)).find((x) => x.case_ref === r?.case_ref)?.id ?? '';
    await expect(
      asUser(db, DANA, () =>
        db.query('select * from public.staff_view_messages($1, $2)', [id, '  ']),
      ),
    ).rejects.toThrow(/reason_required/);
    const seen = await asUser(db, DANA, () =>
      db.query<{ body: string }>('select body from public.staff_view_messages($1, $2)', [
        id,
        'Scam report PC',
      ]),
    );
    expect(seen.rows.map((m) => m.body)).toContain('Bring cash to my account first');
    const audit = await asUser(db, DANA, () =>
      db.query<{ action: string }>('select action from public.staff_audit(5)'),
    );
    expect(audit.rows[0]?.action).toBe('staff.view_messages');
    await decide(DANA, id, 'remove_content');
    const left = await db.query('select id from public.messages where id = $1', [posted]);
    expect(left.rows).toHaveLength(0);
  });
});

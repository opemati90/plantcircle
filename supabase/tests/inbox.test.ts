import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ANA = '00000000-0000-4000-8000-0000000000e5';
const BEN = '00000000-0000-4000-8000-0000000000e6';
const OLU = '00000000-0000-4000-8000-0000000000e7';
const CITY = '30000000-0000-4000-8000-0000000000ca';
const KITCHEN = '50000000-0000-4000-8000-0000000000ca';

let db: PGlite;
let plan = '';
let n = 0;
const uid = () => `6b000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(`insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`, [CITY]);
  for (const [id, name] of [[ANA, 'Ana'], [BEN, 'Ben'], [OLU, 'Olu']] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)', [id, name, CITY]);
  }
  const starts = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const ends = new Date(Date.now() + 8 * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'potluck', 'in_person', 'Sunday Potluck', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 8, 'none', 'published') returning id`,
    [ANA, CITY, starts, ends],
  );
  plan = rows[0]?.id ?? '';
  await db.query(`insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now())`, [plan]);
  await db.query(`insert into public.rsvps (plan_id, user_id, state) values ($1, $2, 'going')`, [plan, BEN]);
  await db.query(`insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'open', $3)`, [KITCHEN, CITY, ANA]);
  await db.query(`insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`, [KITCHEN, ANA, BEN]);
});

const inbox = (user: string) =>
  asUser(db, user, () =>
    db.query<{ kind: string; title: string; last_body: string | null; unread: number; pinned: boolean }>(
      'select kind, title, last_body, unread, pinned from public.inbox_threads()',
    ),
  ).then((r) => r.rows);
const open = (user: string, kind: string, ref: string) =>
  asUser(db, user, () => db.query<{ id: string }>('select public.conversation_open($1, $2) as id', [kind, ref])).then((r) => r.rows[0]?.id ?? '');
const post = (user: string, conv: string, body: string) =>
  asUser(db, user, () => db.query('select public.message_post($1, $2, $3)', [conv, body, uid()]));

describe('the inbox', () => {
  it('lists the Plans and Circles a member is in, even before anyone has written', async () => {
    const rows = await inbox(BEN);
    expect(rows.map((r) => [r.kind, r.title, r.last_body])).toEqual(
      expect.arrayContaining([['plan', 'Sunday Potluck', null], ['circle', 'Kitchen', null]]),
    );
    expect(await inbox(OLU)).toEqual([]);
  });

  it('shows the last message and counts unread ones from other people, until the chat is read', async () => {
    const conv = await open(ANA, 'plan', plan);
    await post(ANA, conv, 'Bring a chair');
    await post(ANA, conv, 'And a bowl');
    const [row] = (await inbox(BEN)).filter((r) => r.kind === 'plan');
    expect(row).toMatchObject({ last_body: 'And a bowl', unread: 2 });
    // The sender's own messages are not unread for them.
    expect((await inbox(ANA)).find((r) => r.kind === 'plan')?.unread).toBe(0);
    await asUser(db, BEN, () => db.query('select public.conversation_mark_read($1, now())', [conv]));
    expect((await inbox(BEN)).find((r) => r.kind === 'plan')?.unread).toBe(0);
    await post(ANA, conv, 'See you');
    expect((await inbox(BEN)).find((r) => r.kind === 'plan')?.unread).toBe(1);
  });

  it('never marks read past what was seen, and never moves the marker backwards', async () => {
    const conv = await open(ANA, 'plan', plan);
    await post(ANA, conv, 'first');
    const seen = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await post(ANA, conv, 'second, unseen');
    await asUser(db, BEN, () => db.query('select public.conversation_mark_read($1, $2)', [conv, seen]));
    expect((await inbox(BEN)).find((r) => r.kind === 'plan')?.unread).toBe(1);
    // An older marker from a stale screen cannot undo a newer one.
    await asUser(db, BEN, () => db.query('select public.conversation_mark_read($1, now())', [conv]));
    await asUser(db, BEN, () => db.query('select public.conversation_mark_read($1, $2)', [conv, seen]));
    expect((await inbox(BEN)).find((r) => r.kind === 'plan')?.unread).toBe(0);
  });

  it('puts pinned threads first', async () => {
    const conv = await open(BEN, 'circle', KITCHEN);
    await asUser(db, BEN, () => db.query('select public.conversation_pin($1, true)', [conv]));
    const rows = await inbox(BEN);
    expect(rows[0]).toMatchObject({ kind: 'circle', pinned: true });
  });

  it('drops a cancelled Plan and refuses mark-read from a non-member', async () => {
    const conv = await open(ANA, 'plan', plan);
    await db.query(`update public.plans set status = 'cancelled' where id = $1`, [plan]);
    expect((await inbox(BEN)).some((r) => r.kind === 'plan')).toBe(false);
    await expect(
      asUser(db, OLU, () => db.query('select public.conversation_mark_read($1, now())', [conv])),
    ).rejects.toThrow(/not_member/);
  });
});

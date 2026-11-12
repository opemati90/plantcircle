import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000c1';
const MIA = '00000000-0000-4000-8000-0000000000c2';
const RANDOM = '00000000-0000-4000-8000-0000000000c3';
const CIRCLE_MEMBER = '00000000-0000-4000-8000-0000000000c4';
const CITY = '30000000-0000-4000-8000-0000000000c8';
const KITCHEN = '50000000-0000-4000-8000-0000000000c8';

let db: PGlite;
let plan = '';
let keyCounter = 0;
const newClientId = () => `67000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama'],
    [MIA, 'Mia'],
    [RANDOM, 'Olu'],
    [CIRCLE_MEMBER, 'Lena'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)', [id, name, CITY]);
  }
  const starts = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const ends = new Date(Date.now() + 8 * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label,
       starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'potluck', 'in_person', 'Potluck', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 8, 'none', 'published')
     returning id`,
    [HOST, CITY, starts, ends],
  );
  plan = rows[0]?.id ?? '';
  await db.query(`insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now())`, [plan]);
  await db.query(`insert into public.rsvps (plan_id, user_id, state) values ($1, $2, 'going')`, [plan, MIA]);
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Neukölln Plant Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, HOST],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [KITCHEN, HOST, CIRCLE_MEMBER],
  );
});

const open = (user: string, kind: string, ref: string) =>
  asUser(db, user, () =>
    db.query<{ id: string }>('select public.conversation_open($1, $2) as id', [kind, ref]),
  ).then((r) => r.rows[0]?.id ?? '');

const post = (user: string, conversation: string, body: string, clientId = newClientId()) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>('select public.message_post($1, $2, $3) as result', [
      conversation,
      body,
      clientId,
    ]),
  );

const readable = (user: string) =>
  asUser(db, user, () =>
    db.query<{ sender_name: string; body: string }>(
      'select sender_name, body from public.message_cards order by created_at',
    ),
  ).then((r) => r.rows);

describe('a Plan chat', () => {
  it('lets the host and people going post and read, and shows names with the messages', async () => {
    const conversation = await open(HOST, 'plan', plan);
    await post(HOST, conversation, '  Bring a spoon  ');
    await post(MIA, conversation, 'On my way');
    expect(await readable(MIA)).toEqual([
      { sender_name: 'Ama', body: 'Bring a spoon' },
      { sender_name: 'Mia', body: 'On my way' },
    ]);
  });

  it('refuses people who are not in the Plan', async () => {
    await expect(open(RANDOM, 'plan', plan)).rejects.toThrow(/not_member/);
    const conversation = await open(HOST, 'plan', plan);
    await expect(post(RANDOM, conversation, 'hello')).rejects.toThrow(/not_member/);
    expect(await readable(RANDOM)).toEqual([]);
  });

  it('closes for everyone once the Plan is cancelled', async () => {
    const conversation = await open(HOST, 'plan', plan);
    await post(HOST, conversation, 'Still on');
    await db.query(`update public.plans set status = 'cancelled' where id = $1`, [plan]);
    expect(await readable(MIA)).toEqual([]);
    await expect(post(MIA, conversation, 'Hello?')).rejects.toThrow(/not_member/);
  });
});

describe('a Circle chat', () => {
  it('lets members post and read, and keeps out people outside the Circle', async () => {
    const conversation = await open(CIRCLE_MEMBER, 'circle', KITCHEN);
    await post(CIRCLE_MEMBER, conversation, 'Sunday soup?');
    await post(HOST, conversation, 'Yes');
    expect((await readable(HOST)).map((m) => m.body)).toEqual(['Sunday soup?', 'Yes']);
    await expect(open(RANDOM, 'circle', KITCHEN)).rejects.toThrow(/not_member/);
  });
});

describe('sending', () => {
  it('ignores a retry with the same client id, so a message is never posted twice', async () => {
    const conversation = await open(MIA, 'plan', plan);
    const clientId = newClientId();
    const first = await post(MIA, conversation, 'Running late', clientId);
    const again = await post(MIA, conversation, 'Running late', clientId);
    expect(again.rows[0]?.result.id).toBe(first.rows[0]?.result.id);
    expect((await readable(MIA)).length).toBe(1);
  });

  it('keeps the limit when one sender sends many messages at once', async () => {
    const conversation = await open(MIA, 'plan', plan);
    const sends = Array.from({ length: 25 }, (_, i) => post(MIA, conversation, `burst ${i}`).then(
      () => 'ok',
      (e: unknown) => (e instanceof Error && /rate_limited/.test(e.message) ? 'limited' : 'other'),
    ));
    const outcomes = await Promise.all(sends);
    expect(outcomes.filter((o) => o === 'ok').length).toBe(20);
    expect(outcomes.filter((o) => o === 'other').length).toBe(0);
  });

  it('refuses empty and too long messages, after trimming', async () => {
    const conversation = await open(MIA, 'plan', plan);
    await expect(post(MIA, conversation, '   ')).rejects.toThrow(/invalid_message/);
    await expect(post(MIA, conversation, 'x'.repeat(1001))).rejects.toThrow(/invalid_message/);
    await expect(post(MIA, conversation, 'x'.repeat(1000))).resolves.toBeDefined();
  });

  it('allows twenty messages in a minute, then slows that sender down only', async () => {
    const conversation = await open(MIA, 'plan', plan);
    for (let i = 0; i < 20; i += 1) {
      await post(MIA, conversation, `message ${i}`);
    }
    await expect(post(MIA, conversation, 'one more')).rejects.toThrow(/rate_limited/);
    await expect(post(HOST, conversation, 'fine')).resolves.toBeDefined();
  });
});

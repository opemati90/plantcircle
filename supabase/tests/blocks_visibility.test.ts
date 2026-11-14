import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000d7';
const OTHER = '00000000-0000-4000-8000-0000000000d8';
const THIRD = '00000000-0000-4000-8000-0000000000d9';
const CITY = '30000000-0000-4000-8000-0000000000d7';
const PLAN = '10000000-0000-4000-8000-0000000000d7';
const CIRCLE = '50000000-0000-4000-8000-0000000000d7';
let db: PGlite;
let n = 0;
const key = () => `70000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama'],
    [OTHER, 'Ben'],
    [THIRD, 'Cem'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, is_verified_host, people_visible) values ($1, $2, $3, true, true)',
      [id, name, CITY],
    );
  }
  await db.query(
    `insert into public.plans (id, host_id, title, kind, city_id, area_label, starts_at, ends_at, tz, capacity, description, status)
     values ($1, $2, 'Soup night', 'cooking_night', $3, 'Neukölln', now() + interval '2 days', now() + interval '2 days 3 hours', 'Europe/Berlin', 8, 'x', 'published')`,
    [PLAN, HOST, CITY],
  );
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'W 1', now() + interval '1 day')`,
    [PLAN],
  );
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'open', $3)`,
    [CIRCLE, CITY, HOST],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [CIRCLE, HOST, OTHER, THIRD],
  );
  await asUser(db, HOST, () =>
    db.query(
      `select public.recipe_create($1, 'Efo Riro', 'Nigerian', 4, 45, null, $2, true, $3, $4, $5)`,
      [
        CIRCLE,
        ['none'],
        JSON.stringify([{ name: 'Tofu', qty: 200, unit: 'g' }]),
        JSON.stringify(['Fry.']),
        key(),
      ],
    ),
  );
});

const count = (user: string | null, sql: string) =>
  asUser(db, user, () => db.query<{ n: number }>(sql)).then((r) => r.rows[0]?.n ?? -1);

describe('T-07: a block hides content both ways', () => {
  it('removes the other side’s Plans, recipes and chat messages from what each sees, and nobody else', async () => {
    const chat = await asUser(db, HOST, () =>
      db.query<{ id: string }>("select public.conversation_open('circle', $1) as id", [CIRCLE]),
    ).then((r) => r.rows[0]?.id ?? '');
    await asUser(db, HOST, () =>
      db.query('select public.message_post($1, $2, $3)', [chat, 'Hello all', key()]),
    );
    await asUser(db, THIRD, () =>
      db.query('select public.message_post($1, $2, $3)', [chat, 'Hi!', key()]),
    );

    expect(await count(OTHER, 'select count(*)::int as n from public.plan_cards')).toBe(1);
    expect(await count(OTHER, 'select count(*)::int as n from public.recipe_cards')).toBe(1);
    expect(await count(OTHER, 'select count(*)::int as n from public.message_cards')).toBe(2);

    await asUser(db, OTHER, () => db.query('select public.block_user($1, $2)', [HOST, key()]));

    // Ben no longer sees Ama's Plan, recipe or messages; Ama no longer sees Ben's.
    expect(await count(OTHER, 'select count(*)::int as n from public.plan_cards')).toBe(0);
    expect(await count(OTHER, 'select count(*)::int as n from public.recipe_cards')).toBe(0);
    expect(
      await count(
        OTHER,
        'select count(*)::int as n from public.message_cards where sender_id = $1'.replace(
          '$1',
          `'${HOST}'`,
        ),
      ),
    ).toBe(0);
    expect(await count(OTHER, 'select count(*)::int as n from public.message_cards')).toBe(1);
    await asUser(db, OTHER, () =>
      db.query('select public.message_post($1, $2, $3)', [chat, 'Anyone?', key()]),
    );
    expect(
      await count(
        HOST,
        `select count(*)::int as n from public.message_cards where sender_id = '${OTHER}'`,
      ),
    ).toBe(0);
    // A third member and a signed-out reader are unaffected.
    expect(await count(THIRD, 'select count(*)::int as n from public.message_cards')).toBe(3);
    expect(await count(THIRD, 'select count(*)::int as n from public.plan_cards')).toBe(1);
    expect(await count(null, 'select count(*)::int as n from public.plan_cards')).toBe(1);
  });
});

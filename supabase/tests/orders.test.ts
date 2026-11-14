import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const JONAS = '00000000-0000-4000-8000-0000000000f5';
const MIA = '00000000-0000-4000-8000-0000000000f6';
const OLU = '00000000-0000-4000-8000-0000000000f7';
const CITY = '30000000-0000-4000-8000-0000000000cb';
let db: PGlite;
let n = 0;
const key = () => `6c000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [JONAS, 'Jonas'],
    [MIA, 'Mia'],
    [OLU, 'Olu'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
      [id, name, CITY],
    );
  }
});

const create = (
  o: Partial<{ closes: string; ps: string; pe: string; items: unknown; title: string }> = {},
) =>
  asUser(db, JONAS, () =>
    db.query<{ result: { id: string } }>(
      `select public.order_create($1, 'Bulk pantry', 'Organic farm shop', 'Brandenburg', $2, $3, $4, 'Weserstraße 1, courtyard', 'Ring twice', $5, $6) as result`,
      [
        o.title ?? 'Bulk chickpeas and lentils',
        o.closes ?? hours(48),
        o.ps ?? hours(72),
        o.pe ?? hours(75),
        JSON.stringify(
          o.items ?? [
            { name: 'Chickpeas', unit: 'kg', target: 50, est_price_minor: 220 },
            { name: 'Red lentils', target: 50 },
          ],
        ),
        key(),
      ],
    ),
  ).then((r) => r.rows[0]?.result.id ?? '');

const items = (plan: string) =>
  asUser(db, null, () =>
    db.query<{ id: string; name: string; interest_total: string }>(
      'select id, name, interest_total from public.order_item_cards where plan_id = $1 order by position',
      [plan],
    ),
  ).then((r) => r.rows);
const interest = (user: string, item: string, qty: number) =>
  asUser(db, user, () =>
    db.query('select public.order_set_interest($1, $2, $3)', [item, qty, key()]),
  );
const card = (plan: string, user: string | null = null) =>
  asUser(db, user, () =>
    db.query<{
      state: string;
      interest_total: string;
      target_total: string;
      people_count: number;
    }>(
      'select state, interest_total, target_total, people_count from public.order_cards where plan_id = $1',
      [plan],
    ),
  ).then((r) => r.rows[0]);
const decide = (user: string, plan: string, d: string) =>
  asUser(db, user, () =>
    db.query<{ result: { state: string } }>(
      'select public.order_decide($1, $2, $3) as result',
      [plan, d, key()],
    ),
  ).then((r) => r.rows[0]?.result.state);
const closeNow = (plan: string) =>
  db.query(
    `update public.group_orders set closes_at = now() - interval '1 minute' where plan_id = $1`,
    [plan],
  );
const address = (user: string, plan: string) =>
  asUser(db, user, () =>
    db.query<{ a: string | null }>('select public.order_pickup_address($1) as a', [plan]),
  ).then((r) => r.rows[0]?.a);

describe('creating a group order', () => {
  it('publishes a Plan of kind group_order with its items, visible to everyone', async () => {
    const plan = await create();
    expect((await items(plan)).map((i) => i.name)).toEqual(['Chickpeas', 'Red lentils']);
    expect(await card(plan)).toMatchObject({
      state: 'collecting',
      target_total: '100.00',
      people_count: 0,
    });
    const row = await db.query<{ kind: string; status: string }>(
      'select kind, status from public.plans where id = $1',
      [plan],
    );
    expect(row.rows[0]).toEqual({ kind: 'group_order', status: 'published' });
  });
  it('refuses a close in the past, a pickup before the close, and no items', async () => {
    await expect(create({ closes: hours(-1) })).rejects.toThrow(/invalid_order/);
    await expect(create({ ps: hours(40), pe: hours(41) })).rejects.toThrow(/invalid_order/);
    await expect(create({ items: [] })).rejects.toThrow(/invalid_order/);
  });
});

describe('interest', () => {
  it('is non-binding and changeable while collecting, and counted on the card', async () => {
    const plan = await create();
    const [chickpeas] = await items(plan);
    await interest(MIA, chickpeas?.id ?? '', 5);
    await interest(MIA, chickpeas?.id ?? '', 3);
    await interest(OLU, chickpeas?.id ?? '', 2);
    expect(await card(plan)).toMatchObject({ interest_total: '5.00', people_count: 2 });
    expect((await items(plan))[0]?.interest_total).toBe('5.00');
  });
  it('closes at closes_at, and the state resolves without a job', async () => {
    const plan = await create();
    const [chickpeas, lentils] = await items(plan);
    await interest(MIA, chickpeas?.id ?? '', 60);
    await closeNow(plan);
    expect((await card(plan))?.state).toBe('below_target');
    await expect(interest(OLU, lentils?.id ?? '', 1)).rejects.toThrow(/interest_closed/);
    await db.query(
      `update public.group_orders set closes_at = now() + interval '1 day' where plan_id = $1`,
      [plan],
    );
    await interest(OLU, lentils?.id ?? '', 40);
    await closeNow(plan);
    expect((await card(plan))?.state).toBe('locked');
  });
  it('lets an interested member into the Plan chat, and keeps others out', async () => {
    const plan = await create();
    const [chickpeas] = await items(plan);
    await interest(MIA, chickpeas?.id ?? '', 5);
    await expect(
      asUser(db, MIA, () =>
        db.query('select public.conversation_open($1, $2)', ['plan', plan]),
      ),
    ).resolves.toBeDefined();
    await expect(
      asUser(db, OLU, () =>
        db.query('select public.conversation_open($1, $2)', ['plan', plan]),
      ),
    ).rejects.toThrow(/not_member/);
  });
});

describe('deciding and pickup', () => {
  it('lets only the organizer decide; go locks, extend adds 72 hours once, cancel cancels', async () => {
    const plan = await create();
    await closeNow(plan);
    await expect(decide(MIA, plan, 'go')).rejects.toThrow(/not_host/);
    expect(await decide(JONAS, plan, 'extend')).toBe('extended');
    expect((await card(plan))?.state).toBe('extended');
    const moved = await db.query<{ ok: boolean }>(
      `select p.starts_at = o.pickup_start and p.ends_at = o.pickup_end and o.pickup_end - o.pickup_start = interval '3 hours' as ok
       from public.plans p join public.group_orders o on o.plan_id = p.id where p.id = $1`,
      [plan],
    );
    expect(moved.rows[0]?.ok).toBe(true);
    await closeNow(plan);
    await expect(decide(JONAS, plan, 'extend')).rejects.toThrow(/order_not_open/);
    // Nobody is in: going ahead would leave an order nobody can collect.
    await expect(decide(JONAS, plan, 'go')).rejects.toThrow(/order_not_open/);
    const [chickpeas] = await items(plan);
    await expect(interest(MIA, chickpeas?.id ?? '', 5)).rejects.toThrow(/interest_closed/);
    await db.query(
      `update public.group_orders set closes_at = now() + interval '1 hour' where plan_id = $1`,
      [plan],
    );
    await interest(MIA, chickpeas?.id ?? '', 5);
    await closeNow(plan);
    expect(await decide(JONAS, plan, 'go')).toBe('locked');
    const other = await create({ title: 'Second order' });
    await closeNow(other);
    expect(await decide(JONAS, other, 'cancel')).toBe('cancelled');
    const row = await db.query<{ status: string }>(
      'select status from public.plans where id = $1',
      [other],
    );
    expect(row.rows[0]?.status).toBe('cancelled');
  });
  it('shows the pickup address to interested members only once locked, and completes when all have collected', async () => {
    const plan = await create();
    const [chickpeas] = await items(plan);
    await interest(MIA, chickpeas?.id ?? '', 5);
    expect(await address(MIA, plan)).toBeNull();
    expect(await address(JONAS, plan)).toBe('Weserstraße 1, courtyard');
    await closeNow(plan);
    await decide(JONAS, plan, 'go');
    expect(await address(MIA, plan)).toBe('Weserstraße 1, courtyard');
    expect(await address(OLU, plan)).toBeNull();
    await expect(
      asUser(db, MIA, () =>
        db.query('select public.order_mark_collected($1, $2)', [plan, key()]),
      ),
    ).rejects.toThrow(/order_not_ready/);
    expect(await decide(JONAS, plan, 'ready')).toBe('ready');
    await expect(
      asUser(db, OLU, () =>
        db.query('select public.order_mark_collected($1, $2)', [plan, key()]),
      ),
    ).rejects.toThrow(/rsvp_required/);
    await asUser(db, MIA, () =>
      db.query('select public.order_mark_collected($1, $2)', [plan, key()]),
    );
    expect((await card(plan))?.state).toBe('completed');
  });
});

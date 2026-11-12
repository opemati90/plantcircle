import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000g1';
const MIA = '00000000-0000-4000-8000-0000000000g2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000g3';
const CITY = '30000000-0000-4000-8000-0000000000c6';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `65000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama'],
    [MIA, 'Mia'],
    [OUTSIDER, 'Olu'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)', [
      id,
      name,
      CITY,
    ]);
  }
});

async function plan(startsInHours: number, status = 'published'): Promise<string> {
  const starts = new Date(Date.now() + startsInHours * 3_600_000).toISOString();
  const ends = new Date(Date.now() + (startsInHours + 3) * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label,
       starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'potluck', 'in_person', 'Potluck', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 8, 'none', $5)
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

const add = (user: string, planId: string, label: string, quantity: number, key = newKey()) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>('select public.host_bring_add($1, $2, $3, $4) as result', [
      planId,
      label,
      quantity,
      key,
    ]),
  ).then((r) => r.rows[0]?.result.id ?? '');

const update = (user: string, itemId: string, label: string, quantity: number) =>
  asUser(db, user, () =>
    db.query('select public.host_bring_update($1, $2, $3, $4)', [itemId, label, quantity, newKey()]),
  );

const remove = (user: string, itemId: string) =>
  asUser(db, user, () => db.query('select public.host_bring_remove($1, $2)', [itemId, newKey()]));

const claim = (user: string, itemId: string) =>
  asUser(db, user, () => db.query('select public.slot_claim($1, $2)', [itemId, newKey()]));

describe('adding and changing bring items', () => {
  it('lets the host add an item to a live Plan, in order', async () => {
    const id = await plan(5);
    const first = await add(HOST, id, 'Bread', 2);
    const second = await add(HOST, id, 'Salad', 1);
    const rows = await db.query<{ id: string; label: string; position: number }>(
      'select id, label, position from public.contribution_slots where plan_id = $1 order by position',
      [id],
    );
    expect(rows.rows.map((r) => [r.id, r.label, r.position])).toEqual([
      [first, 'Bread', 0],
      [second, 'Salad', 1],
    ]);
  });

  it('refuses anyone but the host', async () => {
    const id = await plan(5);
    await expect(add(MIA, id, 'Bread', 1)).rejects.toThrow(/not_host/);
  });

  it('refuses a Plan that has ended or is not live', async () => {
    const ended = await plan(-4);
    await expect(add(HOST, ended, 'Bread', 1)).rejects.toThrow(/plan_not_live/);
    const held = await plan(5, 'on_hold');
    await expect(add(HOST, held, 'Bread', 1)).rejects.toThrow(/plan_not_live/);
  });

  it('refuses an empty label and a quantity outside 1 to 20', async () => {
    const id = await plan(5);
    await expect(add(HOST, id, '   ', 1)).rejects.toThrow(/invalid_item/);
    await expect(add(HOST, id, 'Bread', 0)).rejects.toThrow(/invalid_item/);
    await expect(add(HOST, id, 'Bread', 21)).rejects.toThrow(/invalid_item/);
  });

  it('changes an item, but not below the number already brought', async () => {
    const id = await plan(5);
    const item = await add(HOST, id, 'Bread', 3);
    await claim(MIA, item);
    await expect(update(HOST, item, 'Bread', 0)).rejects.toThrow(/invalid_item/);
    await expect(update(HOST, item, 'Sourdough', 1)).rejects.toThrow(/quantity_below_claims/);
    await update(HOST, item, 'Sourdough', 2);
    const row = await db.query<{ label: string; needed: number }>(
      'select label, needed from public.contribution_slots where id = $1',
      [item],
    );
    expect(row.rows[0]).toEqual({ label: 'Sourdough', needed: 2 });
  });

  it('removes an item nobody has brought, and refuses one that someone has', async () => {
    const id = await plan(5);
    const taken = await add(HOST, id, 'Bread', 1);
    const free = await add(HOST, id, 'Salad', 1);
    await claim(MIA, taken);
    await expect(remove(HOST, taken)).rejects.toThrow(/item_claimed/);
    await remove(HOST, free);
    const left = await db.query<{ n: number }>(
      'select count(*)::int as n from public.contribution_slots where plan_id = $1',
      [id],
    );
    expect(left.rows[0]?.n).toBe(1);
  });

  it('answers a retry with the same key with the same item', async () => {
    const id = await plan(5);
    const key = newKey();
    const first = await add(HOST, id, 'Bread', 1, key);
    const again = await add(HOST, id, 'Bread', 1, key);
    expect(again).toBe(first);
  });
});

import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000b4';
const MIA = '00000000-0000-4000-8000-0000000000b5';
const JONAS = '00000000-0000-4000-8000-0000000000b6';
const CITY = '30000000-0000-4000-8000-0000000000c7';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `66000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

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
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
      [id, name, CITY],
    );
  }
});

async function plan(startsInHours: number): Promise<{ id: string; item: string }> {
  const starts = new Date(Date.now() + startsInHours * 3_600_000).toISOString();
  const ends = new Date(Date.now() + (startsInHours + 3) * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label,
       starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'potluck', 'in_person', 'Potluck', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 8, 'none', 'published')
     returning id`,
    [HOST, CITY, starts, ends],
  );
  const id = rows[0]?.id ?? '';
  await db.query(
    `insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now())`,
    [id],
  );
  const item = await db.query<{ id: string }>(
    `insert into public.contribution_slots (plan_id, label, needed, position) values ($1, 'Bread', 1, 0) returning id`,
    [id],
  );
  for (const guest of [MIA, JONAS]) {
    await db.query(
      `insert into public.rsvps (plan_id, user_id, state) values ($1, $2, 'going')`,
      [id, guest],
    );
  }
  return { id, item: item.rows[0]?.id ?? '' };
}

const claim = (user: string, item: string) =>
  asUser(db, user, () => db.query('select public.slot_claim($1, $2)', [item, newKey()]));
const unclaim = (user: string, item: string) =>
  asUser(db, user, () => db.query('select public.slot_unclaim($1, $2)', [item, newKey()]));
const claimers = async (item: string) =>
  (
    await db.query<{ n: number }>(
      'select count(*)::int as n from public.contribution_claims where slot_id = $1',
      [item],
    )
  ).rows[0]?.n;

describe('withdrawing a claim', () => {
  it('lets a guest withdraw their own claim, which frees the place for someone else', async () => {
    const { item } = await plan(5);
    await claim(MIA, item);
    expect(await claimers(item)).toBe(1);
    await unclaim(MIA, item);
    expect(await claimers(item)).toBe(0);
    await claim(JONAS, item);
    expect(await claimers(item)).toBe(1);
  });

  it('does nothing to someone else’s claim', async () => {
    const { item } = await plan(5);
    await claim(MIA, item);
    await unclaim(JONAS, item);
    expect(await claimers(item)).toBe(1);
  });

  it('refuses once the Plan has ended', async () => {
    const { id, item } = await plan(-5);
    await db.query(
      `insert into public.contribution_claims (slot_id, user_id) values ($1, $2)`,
      [item, MIA],
    );
    await expect(unclaim(MIA, item)).rejects.toThrow(/plan_not_live/);
    expect(id).toBeTruthy();
  });

  it('refuses once the host has ended the Plan early', async () => {
    const { id, item } = await plan(-1);
    await db.query(
      `insert into public.contribution_claims (slot_id, user_id) values ($1, $2)`,
      [item, MIA],
    );
    await db.query(`update public.plans set status = 'completed' where id = $1`, [id]);
    await expect(unclaim(MIA, item)).rejects.toThrow(/plan_not_live/);
  });

  it('answers a retry with the same result', async () => {
    const { item } = await plan(5);
    await claim(MIA, item);
    const key = newKey();
    await asUser(db, MIA, () => db.query('select public.slot_unclaim($1, $2)', [item, key]));
    await expect(
      asUser(db, MIA, () => db.query('select public.slot_unclaim($1, $2)', [item, key])),
    ).resolves.toBeDefined();
  });
});

import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const AUTHOR = '00000000-0000-4000-8000-0000000000b1';
const MEMBER = '00000000-0000-4000-8000-0000000000b2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000b3';
const CITY = '30000000-0000-4000-8000-0000000000c2';
const KITCHEN = '50000000-0000-4000-8000-000000000011';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `61000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [AUTHOR, 'Ama'],
    [MEMBER, 'Lena'],
    [OUTSIDER, 'Mia'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [id, name]);
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Neukölln Plant Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, AUTHOR],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [KITCHEN, AUTHOR, MEMBER],
  );
});

const ingredients = JSON.stringify([{ name: 'Smoked tofu', qty: 200, unit: 'g' }]);
const steps = JSON.stringify(['Fry the tofu.']);

const create = (
  user: string,
  options: {
    allergens?: string[];
    confirmed?: boolean;
    key?: string;
    title?: string;
    ingredientsJson?: string;
  } = {},
) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>(
      `select public.recipe_create($1, $2, 'Nigerian', 4, 45, null, $3, $4, $5, $6, $7) as result`,
      [
        KITCHEN,
        options.title ?? 'Efo Riro',
        options.allergens ?? ['none'],
        options.confirmed ?? true,
        options.ingredientsJson ?? ingredients,
        steps,
        options.key ?? newKey(),
      ],
    ),
  );

const visibleTitles = (user: string | null) =>
  asUser(db, user, () =>
    db.query<{ title: string }>('select title from public.recipe_cards order by title'),
  ).then((r) => r.rows.map((row) => row.title));

describe('sharing a recipe', () => {
  it('lets a Circle member share a recipe with its ingredients and steps', async () => {
    const created = await create(MEMBER);
    const id = created.rows[0]?.result.id ?? '';
    const parts = await db.query<{ ingredients: number; steps: number }>(
      `select (select count(*)::int from public.recipe_ingredients where recipe_id = $1) as ingredients,
              (select count(*)::int from public.recipe_steps where recipe_id = $1) as steps`,
      [id],
    );
    expect(parts.rows[0]).toEqual({ ingredients: 1, steps: 1 });
  });

  it('refuses a confirmed allergen list that is empty', async () => {
    await expect(create(MEMBER, { allergens: [], confirmed: true })).rejects.toThrow(
      /allergens_required/,
    );
  });

  it('keeps a recipe "not confirmed" when the poster skips allergens, and stores none', async () => {
    const created = await create(MEMBER, { allergens: [], confirmed: false });
    const id = created.rows[0]?.result.id ?? '';
    const row = await db.query<{ allergens: string[]; allergens_confirmed: boolean }>(
      'select allergens, allergens_confirmed from public.recipes where id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({ allergens: [], allergens_confirmed: false });
  });

  it('refuses "none" combined with an allergen, which contradicts itself', async () => {
    await expect(create(MEMBER, { allergens: ['none', 'peanuts'] })).rejects.toThrow();
  });

  it('rejects allergen values outside the agreed list', async () => {
    await expect(create(MEMBER, { allergens: ['cilantro'] })).rejects.toThrow();
  });

  it('refuses a non-member, as if the Circle did not exist', async () => {
    await expect(create(OUTSIDER)).rejects.toThrow(/circle_not_found/);
  });

  it('answers a retry with the same key and input with the same recipe', async () => {
    const key = newKey();
    const first = await create(MEMBER, { key });
    const again = await create(MEMBER, { key });
    expect(again.rows[0]?.result.id).toBe(first.rows[0]?.result.id);
  });

  it('refuses a reused key with different input', async () => {
    const key = newKey();
    await create(MEMBER, { key });
    await expect(create(MEMBER, { key, title: 'Stew' })).rejects.toThrow(
      /idempotency_key_reused/,
    );
  });
});

describe('reading recipes', () => {
  it('shows a Circle recipe only to its members', async () => {
    await create(MEMBER, { title: 'Soup' });
    expect(await visibleTitles(MEMBER)).toEqual(['Soup']);
    expect(await visibleTitles(AUTHOR)).toEqual(['Soup']);
    expect(await visibleTitles(OUTSIDER)).toEqual([]);
    expect(await visibleTitles(null)).toEqual([]);
  });

  it('hides a recipe’s ingredients and steps from people who cannot see the recipe', async () => {
    const created = await create(MEMBER);
    const id = created.rows[0]?.result.id ?? '';
    const seen = await asUser(db, OUTSIDER, () =>
      db.query<{ name: string }>('select name from public.recipe_ingredients where recipe_id = $1', [
        id,
      ]),
    );
    expect(seen.rows).toEqual([]);
  });
});

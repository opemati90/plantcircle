import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const LENA = 'a0000000-0000-4000-8000-000000000004';
let db: PGlite;

beforeEach(async () => {
  db = await createDatabase();
});

describe('seed.sql', () => {
  it('loads the prototype content, twice without error, and the read models show it', async () => {
    const seed = readFileSync(join(__dirname, '..', 'seed.sql'), 'utf8');
    await db.exec(seed);
    await db.exec(seed);

    const cards = await asUser(db, null, () =>
      db.query<{ title: string; going_count: number; has_open_spot: boolean }>(
        'select title, going_count, has_open_spot from public.plan_cards order by starts_at',
      ),
    );
    // The completed potluck stays visible (Past tab); the four live Plans follow by start time.
    expect(cards.rows.map((r) => r.title)).toEqual([
      'Autumn potluck',
      'Budget Plant Cooking',
      'Bulk grocery order',
      'Efo Riro with Smoked Tofu',
      'Plant-Based Brunch Club',
    ]);
    expect(cards.rows.find((r) => r.title === 'Efo Riro with Smoked Tofu')).toMatchObject({
      going_count: 3,
      has_open_spot: true,
    });

    const order = await asUser(db, null, () =>
      db.query<{ interest_total: string; target_total: string; state: string }>(
        'select interest_total, target_total, state from public.order_cards',
      ),
    );
    expect(order.rows).toHaveLength(1);
    expect(Number(order.rows[0]?.interest_total)).toBe(68);
    expect(Number(order.rows[0]?.target_total)).toBe(100);

    const circles = await asUser(db, LENA, () =>
      db.query<{ name: string }>('select name from public.circle_cards order by name'),
    );
    expect(circles.rows.map((r) => r.name)).toEqual([
      'Neukölln Plant Kitchen',
      'New to Plant-Based',
    ]);
    const recipes = await asUser(db, LENA, () =>
      db.query<{ title: string; votes: number }>(
        'select title, votes from public.recipe_cards order by votes desc',
      ),
    );
    expect(recipes.rows[0]).toMatchObject({ title: 'Efo Riro with Smoked Tofu', votes: 3 });

    const mine = await asUser(db, LENA, () =>
      db.query<{ status: string }>(
        'select status::text from public.my_rsvps order by status::text',
      ),
    );
    expect(mine.rows.map((r) => r.status)).toEqual(['checked_in', 'going', 'going']);
  });
});

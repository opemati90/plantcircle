import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const AUTHOR = '00000000-0000-4000-8000-0000000000d1';
const MEMBER = '00000000-0000-4000-8000-0000000000d2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000d3';
const CITY = '30000000-0000-4000-8000-0000000000cd';
const KITCHEN = '50000000-0000-4000-8000-0000000000d0';
const fan = (n: number) => `00000000-0000-4000-8000-0000000000${(0xa0 + n).toString(16)}`;

let db: PGlite;
let n = 0;
const key = () => `6d000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

type Level = {
  level: number;
  recipes: number;
  hosted: number;
  followers: number;
  upvotes: number;
  max_capacity: number;
  in_person: boolean;
  group_orders: boolean;
  next: { level: number; recipes: number; followers: number } | null;
};
const level = (user: string) =>
  asUser(db, user, () => db.query<{ l: Level }>('select public.host_level() as l')).then(
    (r) => r.rows[0]?.l,
  );
const recipe = (user: string, title: string) =>
  asUser(db, user, () =>
    db.query(
      `select public.recipe_create($1, $2, 'Nigerian', 4, 45, null, $3, true, $4, $5, $6)`,
      [
        KITCHEN,
        title,
        ['none'],
        JSON.stringify([{ name: 'Tofu', qty: 200, unit: 'g' }]),
        JSON.stringify(['Fry.']),
        key(),
      ],
    ),
  );
const plan = (user: string, format: string, capacity: number) =>
  asUser(db, user, () =>
    db.query<{ r: { id: string } }>(
      `select public.plan_create('cooking_night', $1, 'Lentil night', '', $2, $3, $4, array['none'], 'Neukölln', 'Weserstraße 1', true, $5, $6) as r`,
      [
        format,
        hours(48),
        hours(50),
        capacity,
        format === 'online' ? 'https://meet.example.com/x' : null,
        key(),
      ],
    ),
  );
const order = (user: string) =>
  asUser(db, user, () =>
    db.query(
      `select public.order_create('Bulk chickpeas', 'Bulk pantry', 'Farm shop', 'Brandenburg', $1, $2, $3, 'Weserstraße 1', 'Ring twice', $4, $5)`,
      [
        hours(48),
        hours(72),
        hours(75),
        JSON.stringify([{ name: 'Chickpeas', unit: 'kg', target: 50 }]),
        key(),
      ],
    ),
  );

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  const people: [string, string][] = [
    [AUTHOR, 'Ama'],
    [MEMBER, 'Lena'],
    [OUTSIDER, 'Mia'],
    ...Array.from({ length: 10 }, (_, i): [string, string] => [fan(i), `Fan ${String(i)}`]),
  ];
  for (const [id, name] of people) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    // Accounts older than a week count as contributors (host_level); the author is new.
    await db.query(
      `insert into public.profiles (id, display_name, city_id, created_at) values ($1, $2, $3, now() - interval '8 days')`,
      [id, name, CITY],
    );
  }
  await db.query('update public.profiles set created_at = now() where id = $1', [AUTHOR]);
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Neukölln Plant Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, AUTHOR],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [KITCHEN, AUTHOR, MEMBER],
  );
});

describe('hosting is earned', () => {
  it('starts at level 0: no Plans or orders until a recipe is shared; one recipe opens small online Plans', async () => {
    expect(await level(AUTHOR)).toEqual(
      expect.objectContaining({
        level: 0,
        max_capacity: 0,
        in_person: false,
        next: expect.objectContaining({ level: 1, recipes: 1 }),
      }),
    );
    await expect(plan(AUTHOR, 'online', 4)).rejects.toThrow(/host_level_required/);
    await expect(order(AUTHOR)).rejects.toThrow(/host_level_required/);

    await recipe(AUTHOR, 'Efo Riro');
    expect(await level(AUTHOR)).toEqual(
      expect.objectContaining({ level: 1, recipes: 1, max_capacity: 6, in_person: false }),
    );
    await expect(plan(AUTHOR, 'in_person', 4)).rejects.toThrow(/host_level_in_person/);
    await expect(plan(AUTHOR, 'online', 7)).rejects.toThrow(/host_level_capacity/);
    await expect(order(AUTHOR)).rejects.toThrow(/host_level_required/);
    const made = await plan(AUTHOR, 'online', 6);
    expect(made.rows[0]?.r.id).toMatch(/^[0-9a-f-]{36}$/);
    const card = await asUser(db, null, () =>
      db.query<{ host_featured: boolean }>(
        'select host_featured from public.plan_cards where id = $1',
        [made.rows[0]?.r.id],
      ),
    );
    expect(card.rows[0]?.host_featured).toBe(false);
  });

  it('reaches level 2 with three recipes, a hosted Plan that got feedback and ten followers', async () => {
    for (const t of ['A', 'B', 'C']) await recipe(AUTHOR, `Recipe ${t}`);
    const hosted = await plan(AUTHOR, 'online', 6);
    const planId = hosted.rows[0]?.r.id ?? '';
    for (let i = 0; i < 10; i += 1) {
      const r = await asUser(db, fan(i), () =>
        db.query<{ f: { following: boolean } }>('select public.follow_set($1, true) as f', [
          AUTHOR,
        ]),
      );
      expect(r.rows[0]?.f.following).toBe(true);
    }
    // Still level 1: the Plan has not happened yet.
    expect((await level(AUTHOR))?.level).toBe(1);
    expect((await level(AUTHOR))?.followers).toBe(10);
    await db.query(
      `update public.plans set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = $1`,
      [planId],
    );
    await db.query(
      `insert into public.rsvps (plan_id, user_id, state) values ($1, $2, 'going')`,
      [planId, MEMBER],
    );
    await db.query(
      `insert into public.plan_feedback (plan_id, user_id, rating) values ($1, $2, 5)`,
      [planId, MEMBER],
    );
    expect(await level(AUTHOR)).toEqual(
      expect.objectContaining({
        level: 2,
        hosted: 1,
        max_capacity: 12,
        in_person: true,
        group_orders: true,
        next: expect.objectContaining({ level: 3, followers: 100 }),
      }),
    );
    const inPerson = await plan(AUTHOR, 'in_person', 12);
    expect(inPerson.rows[0]?.r.id).toBeTruthy();
    await expect(plan(AUTHOR, 'in_person', 13)).rejects.toThrow(/host_level_capacity/);
    await order(AUTHOR);
    // Unfollowing drops the count; the level follows the counts.
    await asUser(db, fan(0), () => db.query('select public.follow_set($1, false)', [AUTHOR]));
    expect((await level(AUTHOR))?.level).toBe(1);
    // A staff-verified host is level 3 whatever the counts.
    await db.query('update public.profiles set is_verified_host = true where id = $1', [
      AUTHOR,
    ]);
    expect(await level(AUTHOR)).toEqual(
      expect.objectContaining({ level: 3, max_capacity: 30, next: null }),
    );
    // Featured: the badge Explore shows, on every Plan of a level-3 or verified host.
    const cards = await asUser(db, null, () =>
      db.query<{ host_featured: boolean }>(
        'select host_featured from public.plan_cards where id = $1',
        [planId],
      ),
    );
    expect(cards.rows[0]?.host_featured).toBe(true);
    // The stored flag follows the counts: refreshed on writes and by the cron.
    await db.query('update public.profiles set is_verified_host = false where id = $1', [
      AUTHOR,
    ]);
    expect(
      (
        await db.query<{ f: boolean }>(
          'select featured_host as f from public.profiles where id = $1',
          [AUTHOR],
        )
      ).rows[0]?.f,
    ).toBe(false);
    await db.query('update public.profiles set featured_host = true where id = $1', [AUTHOR]);
    expect(
      (
        await asUser(db, null, () =>
          db.query<{ host_featured: boolean }>(
            'select host_featured from public.plan_cards where id = $1',
            [planId],
          ),
        )
      ).rows[0]?.host_featured,
    ).toBe(true);
    expect(
      (await db.query<{ n: number }>('select public.host_featured_refresh_all() as n')).rows[0]
        ?.n,
    ).toBeGreaterThan(0);
    expect(
      (
        await db.query<{ f: boolean }>(
          'select featured_host as f from public.profiles where id = $1',
          [AUTHOR],
        )
      ).rows[0]?.f,
    ).toBe(false);
    await expect(
      asUser(db, null, () => db.query('select public.host_is_featured($1)', [AUTHOR])),
    ).rejects.toThrow(/permission denied/);
  });

  it('follows need a visible, unblocked other person; a block ends them; standing and tenure count', async () => {
    await expect(
      asUser(db, MEMBER, () => db.query('select public.follow_set($1, true)', [MEMBER])),
    ).rejects.toThrow(/person_not_found/);
    await asUser(db, OUTSIDER, () => db.query('select public.follow_set($1, true)', [AUTHOR]));
    expect((await level(AUTHOR))?.followers).toBe(1);
    await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [
      AUTHOR,
      OUTSIDER,
    ]);
    expect((await level(AUTHOR))?.followers).toBe(0);
    await expect(
      asUser(db, OUTSIDER, () => db.query('select public.follow_set($1, true)', [AUTHOR])),
    ).rejects.toThrow(/person_not_found/);
    // Taking a follow back never needs access to the other person.
    await asUser(db, OUTSIDER, () => db.query('select public.follow_set($1, false)', [AUTHOR]));
    await expect(
      asUser(db, null, () => db.query('select public.follow_set($1, true)', [AUTHOR])),
    ).rejects.toThrow(/permission denied|not_authenticated/);
    // A suspended account cannot follow, and its earlier follows stop counting.
    await asUser(db, fan(9), () => db.query('select public.follow_set($1, true)', [AUTHOR]));
    expect((await level(AUTHOR))?.followers).toBe(1);
    await db.query(`update public.profiles set status = 'suspended' where id = $1`, [fan(9)]);
    await expect(
      asUser(db, fan(9), () => db.query('select public.follow_set($1, true)', [AUTHOR])),
    ).rejects.toThrow(/suspended/);
    expect((await level(AUTHOR))?.followers).toBe(0);
    await asUser(db, MEMBER, () => db.query('select public.follow_set($1, true)', [AUTHOR]));
    expect((await level(AUTHOR))?.followers).toBe(1);
    // A brand-new account that never showed up does not count yet; checking in at a Plan does.
    await db.query('update public.profiles set created_at = now() where id = $1', [MEMBER]);
    expect((await level(AUTHOR))?.followers).toBe(0);
    await recipe(AUTHOR, 'Efo Riro');
    const planId = (await plan(AUTHOR, 'online', 6)).rows[0]?.r.id ?? '';
    await db.query(
      `insert into public.rsvps (plan_id, user_id, state, checked_in_at) values ($1, $2, 'checked_in', now())`,
      [planId, MEMBER],
    );
    expect((await level(AUTHOR))?.followers).toBe(1);
  });

  it('upvotes come from Circle members, once each, never the author, and show on the card', async () => {
    await recipe(AUTHOR, 'Efo Riro');
    const id =
      (await db.query<{ id: string }>('select id from public.recipes')).rows[0]?.id ?? '';
    await expect(
      asUser(db, AUTHOR, () => db.query('select public.recipe_vote_set($1, true)', [id])),
    ).rejects.toThrow(/own_recipe/);
    await expect(
      asUser(db, OUTSIDER, () => db.query('select public.recipe_vote_set($1, true)', [id])),
    ).rejects.toThrow(/not_found/);
    await asUser(db, MEMBER, () => db.query('select public.recipe_vote_set($1, true)', [id]));
    await asUser(db, MEMBER, () => db.query('select public.recipe_vote_set($1, true)', [id]));
    const card = await asUser(db, MEMBER, () =>
      db.query<{ votes: number; voted: boolean; following_author: boolean }>(
        'select votes, voted, following_author from public.recipe_cards where id = $1',
        [id],
      ),
    );
    expect(card.rows[0]).toEqual({ votes: 1, voted: true, following_author: false });
    expect((await level(AUTHOR))?.upvotes).toBe(1);
    await asUser(db, MEMBER, () => db.query('select public.recipe_vote_set($1, false)', [id]));
    expect((await level(AUTHOR))?.upvotes).toBe(0);
    // One voter adds at most five upvotes to an author, however many recipes they vote on.
    for (const t of ['B', 'C', 'D', 'E', 'F', 'G']) await recipe(AUTHOR, `Recipe ${t}`);
    const ids = (await db.query<{ id: string }>('select id from public.recipes')).rows.map(
      (r) => r.id,
    );
    for (const rid of ids) {
      await asUser(db, MEMBER, () =>
        db.query('select public.recipe_vote_set($1, true)', [rid]),
      );
    }
    expect((await level(AUTHOR))?.upvotes).toBe(5);
    // The level is the caller's own: there is no asking about someone else.
    await expect(
      asUser(db, MEMBER, () => db.query('select public.host_level($1)', [AUTHOR])),
    ).rejects.toThrow(/does not exist|permission denied/);
    // Votes and follows are private rows: nobody lists another member's.
    const rows = await asUser(db, OUTSIDER, () =>
      db.query('select * from public.recipe_votes'),
    );
    expect(rows.rows).toHaveLength(0);
  });
});

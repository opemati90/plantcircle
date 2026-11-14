import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000e1';
const GUEST = '00000000-0000-4000-8000-0000000000e2';
const CITY = '30000000-0000-4000-8000-0000000000e1';
let db: PGlite;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama'],
    [GUEST, 'Ben'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, is_verified_host) values ($1, $2, $3, true)',
      [id, name, CITY],
    );
  }
  for (const [title, status] of [
    ['Soup night', 'published'],
    ['Old potluck', 'completed'],
    ['Never published', 'draft'],
  ] as const) {
    await db.query(
      `insert into public.plans (host_id, title, kind, city_id, area_label, starts_at, ends_at, tz, capacity, description, status)
       values ($1, $2, 'cooking_night', $3, 'Neukölln', now() + interval '2 days', now() + interval '2 days 3 hours', 'Europe/Berlin', 8, 'x', $4)`,
      [HOST, title, CITY, status],
    );
  }
});

describe('my_hosted_plans', () => {
  it('lists only the caller’s own live Plans, read-only, and nothing to anyone else', async () => {
    const mine = await asUser(db, HOST, () =>
      db.query<{ status: string }>(
        'select status::text from public.my_hosted_plans order by status::text',
      ),
    );
    expect(mine.rows.map((r) => r.status)).toEqual(['completed', 'published']);
    // Not writable: a host cannot push a Plan's status past the RPCs through the view.
    await expect(
      asUser(db, HOST, () =>
        db.query(
          "update public.my_hosted_plans set status = 'published' where status = 'completed'",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    const theirs = await asUser(db, GUEST, () =>
      db.query('select * from public.my_hosted_plans'),
    );
    expect(theirs.rows).toHaveLength(0);
    await expect(
      asUser(db, null, () => db.query('select * from public.my_hosted_plans')),
    ).rejects.toThrow(/permission denied/);
  });
});

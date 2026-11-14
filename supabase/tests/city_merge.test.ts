import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const STAFF = '00000000-0000-4000-8000-0000000000e9';
const MEMBER = '00000000-0000-4000-8000-0000000000ea';
const KOELN = '30000000-0000-4000-8000-0000000000e1';
const COLOGNE = '30000000-0000-4000-8000-0000000000e2';
let db: PGlite;
let n = 0;
const key = () => `6e000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Köln', 'DE', 'Europe/Berlin'), ($2, 'Cologne', 'DE', 'Europe/Berlin')`,
    [KOELN, COLOGNE],
  );
  for (const [id, name, city, role] of [
    [STAFF, 'Sam', COLOGNE, 'staff'],
    [MEMBER, 'Lena', KOELN, 'member'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, role) values ($1, $2, $3, $4)',
      [id, name, city, role],
    );
  }
  await db.query(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'cooking_night', 'in_person', 'Soup', '', $2, 'Ehrenfeld', now() + interval '2 days', now() + interval '2 days 3 hours', 'Europe/Berlin', 6, 'none', 'published')`,
    [MEMBER, KOELN],
  );
});

describe('merging two spellings of a city', () => {
  it('moves members, Plans and Circles, deletes the duplicate, logs it, and is staff-only', async () => {
    const before = await asUser(db, STAFF, () =>
      db.query<{ name: string; members: number; plans: number }>(
        'select name, members, plans from public.staff_cities()',
      ),
    );
    expect(before.rows).toEqual([
      { name: 'Cologne', members: 1, plans: 0 },
      { name: 'Köln', members: 1, plans: 1 },
    ]);
    await expect(
      asUser(db, MEMBER, () =>
        db.query('select public.staff_city_merge($1, $2, $3, $4)', [
          KOELN,
          COLOGNE,
          'Same city',
          key(),
        ]),
      ),
    ).rejects.toThrow(/not_staff/);
    const k = key();
    const merged = await asUser(db, STAFF, () =>
      db.query<{ r: { members: number; plans: number; circles: number } }>(
        'select public.staff_city_merge($1, $2, $3, $4) as r',
        [KOELN, COLOGNE, 'Same city, two spellings', k],
      ),
    );
    expect(merged.rows[0]?.r).toEqual({ members: 1, plans: 1, circles: 0 });
    // A retry with the same key replays; the duplicate is gone.
    const again = await asUser(db, STAFF, () =>
      db.query<{ r: { members: number } }>(
        'select public.staff_city_merge($1, $2, $3, $4) as r',
        [KOELN, COLOGNE, 'Same city, two spellings', k],
      ),
    );
    expect(again.rows[0]?.r.members).toBe(1);
    const after = await asUser(db, STAFF, () =>
      db.query<{ name: string; members: number; plans: number }>(
        'select name, members, plans from public.staff_cities()',
      ),
    );
    expect(after.rows).toEqual([{ name: 'Cologne', members: 2, plans: 1 }]);
    const audit = await asUser(db, STAFF, () =>
      db.query<{ action: string; target_type: string }>(
        'select action, target_type from public.staff_audit(10)',
      ),
    );
    expect(audit.rows[0]).toEqual({ action: 'staff.city_merge', target_type: 'city' });
    await expect(
      asUser(db, STAFF, () =>
        db.query('select public.staff_city_merge($1, $2, $3, $4)', [
          KOELN,
          COLOGNE,
          'Again',
          key(),
        ]),
      ),
    ).rejects.toThrow(/city_not_found/);
    await expect(
      asUser(db, STAFF, () =>
        db.query('select public.staff_city_merge($1, $1, $2, $3)', [COLOGNE, 'Same', key()]),
      ),
    ).rejects.toThrow(/invalid_input/);
  });
});

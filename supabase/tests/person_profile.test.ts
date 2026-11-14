import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ME = '00000000-0000-4000-8000-0000000000f1';
const MIA = '00000000-0000-4000-8000-0000000000f2';
const HIDDEN = '00000000-0000-4000-8000-0000000000f3';
const STRANGER = '00000000-0000-4000-8000-0000000000f4';
const CITY = '30000000-0000-4000-8000-0000000000f1';
const CIRCLE = '50000000-0000-4000-8000-0000000000f1';
const OTHER_CIRCLE = '50000000-0000-4000-8000-0000000000f2';

let db: PGlite;
let n = 0;
const key = () => `7f000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name, visible] of [
    [ME, 'Lena', true],
    [MIA, 'Mia K.', true],
    [HIDDEN, 'Hal', false],
    [STRANGER, 'Sam', true],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id, people_visible) values ($1, $2, $3, $4)',
      [id, name, CITY, visible],
    );
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'open', $3), ($4, 'Elsewhere', $2, 'open', $5)`,
    [CIRCLE, CITY, ME, OTHER_CIRCLE, STRANGER],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($5, $6, 'owner')`,
    [CIRCLE, ME, MIA, HIDDEN, OTHER_CIRCLE, STRANGER],
  );
  await asUser(db, MIA, () =>
    db.query(
      `select public.recipe_create($1, 'Efo Riro', 'Nigerian', 4, 45, null, $2, true, $3, $4, $5)`,
      [
        CIRCLE,
        ['none'],
        JSON.stringify([{ name: 'Spinach', qty: 500, unit: 'g' }]),
        JSON.stringify(['Cook.']),
        key(),
      ],
    ),
  );
});

const profile = (viewer: string, target: string) =>
  asUser(db, viewer, () =>
    db.query<{ p: Record<string, unknown> }>('select public.person_profile($1) as p', [target]),
  ).then((r) => r.rows[0]?.p);

describe('person_profile', () => {
  it('shows a visible member of a shared Circle what helps decide, and nothing private', async () => {
    const p = await profile(ME, MIA);
    expect(p).toMatchObject({
      display_name: 'Mia K.',
      city: 'Berlin',
      circle_names: ['Kitchen'],
      connection: 'none',
      level: expect.any(Number),
      recipes: 1,
      plans_together: 0,
    });
    expect(Object.keys(p ?? {})).not.toEqual(
      expect.arrayContaining(['goals', 'email', 'diet']),
    );
  });

  it('reflects a connection request they sent', async () => {
    await asUser(db, MIA, () => db.query('select public.person_connect($1, $2)', [ME, key()]));
    expect(await profile(ME, MIA)).toMatchObject({ connection: 'requested_by_them' });
  });

  it('hides a member who is not visible, unless they are asking you for something', async () => {
    await expect(profile(ME, HIDDEN)).rejects.toThrow(/person_not_found/);
    await db.query(
      `insert into public.message_requests (from_id, to_id, first_message) values ($1, $2, 'Hi!')`,
      [HIDDEN, ME],
    );
    expect(await profile(ME, HIDDEN)).toMatchObject({ display_name: 'Hal' });
  });

  it('refuses strangers, yourself, blocked people, and signed-out callers', async () => {
    await expect(profile(ME, STRANGER)).rejects.toThrow(/person_not_found/);
    await expect(profile(ME, ME)).rejects.toThrow(/person_not_found/);
    await asUser(db, MIA, () => db.query('select public.block_user($1, $2)', [ME, key()]));
    await expect(profile(ME, MIA)).rejects.toThrow(/person_not_found/);
    await expect(
      asUser(db, null, () => db.query('select public.person_profile($1)', [MIA])),
    ).rejects.toThrow(/permission denied/);
  });
});

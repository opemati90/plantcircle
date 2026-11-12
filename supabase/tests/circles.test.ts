import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const ASKER = '00000000-0000-4000-8000-0000000000a2';
const OTHER = '00000000-0000-4000-8000-0000000000a3';
const CITY = '30000000-0000-4000-8000-0000000000c1';
const OPEN = '50000000-0000-4000-8000-000000000001';
const REQUEST = '50000000-0000-4000-8000-000000000002';
const SECRET = '50000000-0000-4000-8000-000000000003';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `60000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [OWNER, 'Ama'],
    [ASKER, 'Lena'],
    [OTHER, 'Mia'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [
      id,
      name,
    ]);
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values
       ($1, 'Open kitchen', $4, 'open', $5),
       ($2, 'Ask first', $4, 'request', $5),
       ($3, 'Secret supper', $4, 'invite', $5)`,
    [OPEN, REQUEST, SECRET, CITY, OWNER],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values
       ($1, $3, 'owner'), ($2, $3, 'owner'), ($4, $3, 'owner')`,
    [OPEN, REQUEST, OWNER, SECRET],
  );
});

const join = (user: string, circle: string, answer: string | null = null) =>
  asUser(db, user, () =>
    db.query<{ result: { status: string } }>(
      'select public.circle_join($1, $2, $3) as result',
      [circle, answer, newKey()],
    ),
  ).then((r) => r.rows[0]?.result);

const visibleCircles = (user: string | null) =>
  asUser(db, user, () =>
    db.query<{ name: string }>('select name from public.circle_cards order by name'),
  ).then((r) => r.rows.map((row) => row.name));

describe('circle visibility', () => {
  it('lists open and request Circles to everyone, and hides invite-only ones from outsiders', async () => {
    expect(await visibleCircles(null)).toEqual(['Ask first', 'Open kitchen']);
    expect(await visibleCircles(ASKER)).toEqual(['Ask first', 'Open kitchen']);
  });

  it('shows an invite-only Circle to its members', async () => {
    await db.query(
      `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'member')`,
      [SECRET, ASKER],
    );
    expect(await visibleCircles(ASKER)).toEqual(['Ask first', 'Open kitchen', 'Secret supper']);
  });

  it('does not let anyone read other members, only their own membership', async () => {
    await db.query(
      `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'member')`,
      [OPEN, ASKER],
    );
    const seen = await asUser(db, ASKER, () =>
      db.query<{ user_id: string }>('select user_id from public.circle_members'),
    );
    expect(seen.rows.map((row) => row.user_id)).toEqual([ASKER]);
  });

  it('blocks direct writes to Circles', async () => {
    await expect(
      asUser(db, ASKER, () =>
        db.query(
          `insert into public.circles (name, city_id, created_by) values ('x y', $1, $2)`,
          [CITY, ASKER],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('joining', () => {
  it('admits a member straight into an open Circle', async () => {
    expect(await join(ASKER, OPEN)).toEqual({ status: 'member' });
    const role = await db.query<{ role: string }>(
      'select role from public.circle_members where circle_id = $1 and user_id = $2',
      [OPEN, ASKER],
    );
    expect(role.rows[0]?.role).toBe('member');
  });

  it('records a request, not membership, for a request Circle', async () => {
    expect(await join(ASKER, REQUEST, 'I cook Sundays')).toEqual({ status: 'requested' });
    const member = await db.query(
      'select 1 from public.circle_members where circle_id = $1 and user_id = $2',
      [REQUEST, ASKER],
    );
    expect(member.rows).toHaveLength(0);
  });

  it('refuses to let anyone ask into an invite-only Circle', async () => {
    await expect(join(ASKER, SECRET)).rejects.toThrow(/circle_not_found/);
  });

  it('lets a moderator approve a request, and only a moderator', async () => {
    await join(ASKER, REQUEST, 'hello');
    const req = await db.query<{ id: string }>('select id from public.circle_requests');
    const requestId = req.rows[0]?.id ?? '';
    await expect(
      asUser(db, OTHER, () =>
        db.query('select public.circle_request_respond($1, true, $2)', [requestId, newKey()]),
      ),
    ).rejects.toThrow(/not_moderator/);
    await asUser(db, OWNER, () =>
      db.query('select public.circle_request_respond($1, true, $2)', [requestId, newKey()]),
    );
    const member = await db.query(
      'select role from public.circle_members where circle_id = $1 and user_id = $2',
      [REQUEST, ASKER],
    );
    expect(member.rows[0]).toEqual({ role: 'member' });
  });

  it('declines silently: the asker is not added', async () => {
    await join(ASKER, REQUEST, 'hello');
    const req = await db.query<{ id: string }>('select id from public.circle_requests');
    await asUser(db, OWNER, () =>
      db.query('select public.circle_request_respond($1, false, $2)', [
        req.rows[0]?.id ?? '',
        newKey(),
      ]),
    );
    const member = await db.query(
      'select 1 from public.circle_members where circle_id = $1 and user_id = $2',
      [REQUEST, ASKER],
    );
    expect(member.rows).toHaveLength(0);
  });
});

describe('moderating requests', () => {
  it('lists the pending requests for a moderator only', async () => {
    await join(ASKER, REQUEST, 'I cook Sundays');
    const list = (user: string) =>
      asUser(db, user, () =>
        db.query<{ display_name: string; answer: string }>(
          'select display_name, answer from public.circle_pending_requests($1)',
          [REQUEST],
        ),
      );
    await expect(list(OTHER)).rejects.toThrow(/not_moderator/);
    const rows = await list(OWNER);
    expect(rows.rows).toEqual([{ display_name: 'Lena', answer: 'I cook Sundays' }]);
  });

  it('answers a retried approval with the original result', async () => {
    await join(ASKER, REQUEST, 'hello');
    const req = await db.query<{ id: string }>('select id from public.circle_requests');
    const requestId = req.rows[0]?.id ?? '';
    const key = newKey();
    const first = await asUser(db, OWNER, () =>
      db.query<{ result: { status: string } }>(
        'select public.circle_request_respond($1, true, $2) as result',
        [requestId, key],
      ),
    );
    const retry = await asUser(db, OWNER, () =>
      db.query<{ result: { status: string } }>(
        'select public.circle_request_respond($1, true, $2) as result',
        [requestId, key],
      ),
    );
    expect(first.rows[0]?.result).toEqual({ status: 'approved' });
    expect(retry.rows[0]?.result).toEqual({ status: 'approved' });
  });
});

describe('creating', () => {
  const create = (user: string, name: string, key = newKey()) =>
    asUser(db, user, () =>
      db.query<{ result: { id: string } }>(
        'select public.circle_create($1, null, $2, false, $3, null, $4) as result',
        [name, CITY, 'open', key],
      ),
    );

  it('makes the creator the owner', async () => {
    const created = await create(ASKER, 'Vegan bakers');
    const id = created.rows[0]?.result.id ?? '';
    const role = await db.query<{ role: string }>(
      'select role from public.circle_members where circle_id = $1 and user_id = $2',
      [id, ASKER],
    );
    expect(role.rows[0]?.role).toBe('owner');
  });

  it('answers a retry with the same key and input with the same Circle', async () => {
    const key = newKey();
    const first = await create(ASKER, 'Soup club', key);
    const again = await create(ASKER, 'Soup club', key);
    expect(again.rows[0]?.result.id).toBe(first.rows[0]?.result.id);
  });

  it('refuses a reused key with different input, so an edited Circle is never swapped out', async () => {
    const key = newKey();
    await create(ASKER, 'Soup club', key);
    await expect(create(ASKER, 'Stew club', key)).rejects.toThrow(/idempotency_key_reused/);
  });

  it('limits a member to 3 new Circles a day', async () => {
    await create(ASKER, 'One');
    await create(ASKER, 'Two');
    await create(ASKER, 'Three');
    await expect(create(ASKER, 'Four')).rejects.toThrow(/rate_limited/);
  });
});

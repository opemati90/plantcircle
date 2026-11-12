import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ANA = '00000000-0000-4000-8000-0000000000d1';
const BEN = '00000000-0000-4000-8000-0000000000d2';
const CLARA = '00000000-0000-4000-8000-0000000000d3';
const OUTSIDER = '00000000-0000-4000-8000-0000000000d4';
const CITY = '30000000-0000-4000-8000-0000000000c3';
const KITCHEN = '50000000-0000-4000-8000-000000000021';
const POTLUCK = '50000000-0000-4000-8000-000000000022';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `62000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [ANA, 'Ana'],
    [BEN, 'Ben'],
    [CLARA, 'Clara'],
    [OUTSIDER, 'Olu'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
      [id, name, CITY],
    );
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values
       ($1, 'Neukölln Plant Kitchen', $3, 'open', $4),
       ($2, 'Potluck', $3, 'open', $4)`,
    [KITCHEN, POTLUCK, CITY, ANA],
  );
  // Ana and Ben share the kitchen; Clara is only in the potluck with Ben; Olu is in neither.
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values
       ($1, $2, 'owner'), ($1, $3, 'member'), ($4, $3, 'member'), ($4, $5, 'owner')`,
    [KITCHEN, ANA, BEN, POTLUCK, CLARA],
  );
});

const makeVisible = (user: string) =>
  asUser(db, user, () =>
    db.query('update public.profiles set people_visible = true where id = $1', [user]),
  );

const peopleFor = (user: string) =>
  asUser(db, user, () =>
    db.query<{ display_name: string; circle_names: string[]; connection: string }>(
      'select display_name, circle_names, connection from public.people_in_my_circles() order by display_name',
    ),
  ).then((r) => r.rows);

const connect = (user: string, target: string, key = newKey()) =>
  asUser(db, user, () =>
    db.query<{ result: { status: string } }>('select public.person_connect($1, $2) as result', [
      target,
      key,
    ]),
  ).then((r) => r.rows[0]?.result.status);

describe('who is listed', () => {
  it('lists nobody by default: people are hidden until they choose to be visible', async () => {
    expect(await peopleFor(ANA)).toEqual([]);
  });

  it('lists a visible person to members of a Circle they share, with the Circles in common', async () => {
    await makeVisible(BEN);
    expect(await peopleFor(ANA)).toEqual([
      { display_name: 'Ben', circle_names: ['Neukölln Plant Kitchen'], connection: 'none' },
    ]);
  });

  it('never lists a visible person to someone who shares no Circle with them', async () => {
    await makeVisible(BEN);
    expect(await peopleFor(OUTSIDER)).toEqual([]);
  });

  it('lists the viewer’s own row never, even when visible', async () => {
    await makeVisible(ANA);
    await makeVisible(BEN);
    expect((await peopleFor(ANA)).map((p) => p.display_name)).toEqual(['Ben']);
  });
});

describe('connecting', () => {
  beforeEach(async () => {
    await makeVisible(BEN);
  });

  it('records a request, then shows both sides as connected once the other connects back', async () => {
    // Ben can only see and connect with Ana once she is visible too.
    await makeVisible(ANA);
    expect(await connect(ANA, BEN)).toBe('requested');
    expect((await peopleFor(ANA))[0]?.connection).toBe('requested');
    expect((await peopleFor(BEN)).map((p) => p.display_name)).toEqual(['Ana']);

    expect(await connect(BEN, ANA)).toBe('connected');
    expect((await peopleFor(ANA))[0]?.connection).toBe('connected');
  });

  it('shows the other side’s request to the person who received it', async () => {
    await makeVisible(ANA);
    await connect(BEN, ANA);
    expect((await peopleFor(ANA))[0]?.connection).toBe('requested_by_them');
  });

  it('answers a retry with the same key with the same result', async () => {
    const key = newKey();
    expect(await connect(ANA, BEN, key)).toBe('requested');
    expect(await connect(ANA, BEN, key)).toBe('requested');
  });

  it('refuses a person who is hidden, as if they did not exist', async () => {
    await asUser(db, BEN, () =>
      db.query('update public.profiles set people_visible = false where id = $1', [BEN]),
    );
    await expect(connect(ANA, BEN)).rejects.toThrow(/person_not_found/);
  });

  it('refuses someone who shares no Circle with the connector', async () => {
    await makeVisible(CLARA);
    // Ana and Clara share no Circle (Clara is only in the potluck, which Ana is not in).
    await expect(connect(ANA, CLARA)).rejects.toThrow(/person_not_found/);
  });

  it('refuses a connection through a Circle that has been archived', async () => {
    await db.query(`update public.circles set status = 'archived' where id = $1`, [KITCHEN]);
    await expect(connect(ANA, BEN)).rejects.toThrow(/person_not_found/);
  });

  it('hides a request from its recipient once the sender hides', async () => {
    await makeVisible(ANA);
    await connect(ANA, BEN);
    const seen = (user: string) =>
      asUser(db, user, () =>
        db.query<{ requester_id: string }>('select requester_id from public.connections'),
      ).then((r) => r.rows.length);
    expect(await seen(BEN)).toBe(1);
    await asUser(db, ANA, () =>
      db.query('update public.profiles set people_visible = false where id = $1', [ANA]),
    );
    expect(await seen(BEN)).toBe(0);
    // The sender still sees the request they sent.
    expect(await seen(ANA)).toBe(1);
  });

  it('refuses a connection to oneself', async () => {
    await expect(connect(ANA, ANA)).rejects.toThrow(/person_not_found/);
  });

  it('does not let anyone read connections they are not part of', async () => {
    await connect(ANA, BEN);
    const seen = await asUser(db, OUTSIDER, () =>
      db.query('select requester_id from public.connections'),
    );
    expect(seen.rows).toEqual([]);
  });
});

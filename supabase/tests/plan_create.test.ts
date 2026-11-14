import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000e1';
const NO_CITY = '00000000-0000-4000-8000-0000000000e2';
const CITY = '30000000-0000-4000-8000-0000000000c4';

let db: PGlite;
let keyCounter = 0;
const newKey = () => `63000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

const STARTS = '2030-06-01T17:00:00+02:00';
const ENDS = '2030-06-01T19:00:00+02:00';

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name, city] of [
    [HOST, 'Lena', CITY],
    [NO_CITY, 'Sam', null],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
      [id, name, city],
    );
  }
});

interface Overrides {
  kind?: string;
  format?: string;
  title?: string;
  starts?: string;
  ends?: string;
  capacity?: number;
  allergens?: string[];
  area?: string | null;
  address?: string | null;
  keepPrivate?: boolean;
  link?: string | null;
  key?: string;
}

const create = (user: string, o: Overrides = {}) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>(
      `select public.plan_create($1, $2, $3, 'A shared table.', $4, $5, $6, $7, $8, $9, $10, $11, $12) as result`,
      [
        o.kind ?? 'cooking_night',
        o.format ?? 'in_person',
        o.title ?? 'Lentil night',
        o.starts ?? STARTS,
        o.ends ?? ENDS,
        o.capacity ?? 8,
        o.allergens ?? ['none'],
        o.area === undefined ? 'Neukölln' : o.area,
        o.address === undefined ? 'Weserstraße 1' : o.address,
        o.keepPrivate ?? true,
        o.link ?? null,
        o.key ?? newKey(),
      ],
    ),
  );

describe('creating a Plan', () => {
  it('publishes an in-person Plan in the host’s city time zone and shows it to everyone', async () => {
    const created = await create(HOST);
    const id = created.rows[0]?.result.id ?? '';
    const card = await asUser(db, null, () =>
      db.query<{ status: string; timezone: string; area_name: string; allergens: string }>(
        'select status, timezone, area_name, allergens from public.plan_cards where id = $1',
        [id],
      ),
    );
    expect(card.rows[0]).toEqual({
      status: 'published',
      timezone: 'Europe/Berlin',
      area_name: 'Neukölln',
      allergens: 'none',
    });
  });

  it('keeps the address private until the day before, when the host asks for that', async () => {
    const created = await create(HOST, { keepPrivate: true });
    const id = created.rows[0]?.result.id ?? '';
    const reveal = await db.query<{ gap: string }>(
      `select (reveal_at = (starts_at - interval '1 day'))::text as gap
       from public.plan_private pp join public.plans p on p.id = pp.plan_id where pp.plan_id = $1`,
      [id],
    );
    expect(reveal.rows[0]?.gap).toBe('true');
  });

  it('releases the address to confirmed guests at once when the host does not keep it private', async () => {
    const created = await create(HOST, { keepPrivate: false });
    const id = created.rows[0]?.result.id ?? '';
    const reveal = await db.query<{ early: string }>(
      `select (reveal_at <= now() + interval '1 minute')::text as early from public.plan_private where plan_id = $1`,
      [id],
    );
    expect(reveal.rows[0]?.early).toBe('true');
  });

  it('creates an online Plan with its meeting link and no address', async () => {
    const created = await create(HOST, {
      format: 'online',
      area: null,
      address: null,
      link: 'https://meet.google.com/abc-defg-hij',
    });
    const id = created.rows[0]?.result.id ?? '';
    const row = await db.query<{ address: string | null; url: string }>(
      `select pp.address, l.meeting_url as url
       from public.plan_private pp join public.plan_meeting_links l on l.plan_id = pp.plan_id
       where pp.plan_id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({ address: null, url: 'https://meet.google.com/abc-defg-hij' });
  });

  it('refuses a host with no home city', async () => {
    await expect(
      asUser(db, NO_CITY, () =>
        db.query(
          `select public.plan_create('cooking_night', 'in_person', 'Lentil night', '', $1, $2, 8, '{none}', 'Mitte', 'Street 1', true, null, $3)`,
          [STARTS, ENDS, newKey()],
        ),
      ),
    ).rejects.toThrow(/city_required/);
  });

  it('refuses a Plan with no allergen answer, and "none" beside an allergen', async () => {
    await expect(create(HOST, { allergens: [] })).rejects.toThrow(/allergens_required/);
    await expect(create(HOST, { allergens: ['none', 'peanuts'] })).rejects.toThrow(
      /invalid_plan/,
    );
  });

  it('refuses times, durations, capacities and kinds outside the rules', async () => {
    await expect(
      create(HOST, { starts: '2020-01-01T17:00:00Z', ends: '2020-01-01T19:00:00Z' }),
    ).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { ends: '2030-06-01T17:10:00+02:00' })).rejects.toThrow(
      /invalid_plan/,
    );
    await expect(create(HOST, { capacity: 1 })).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { capacity: 51 })).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { kind: 'workshop' })).rejects.toThrow(/invalid_plan/);
  });

  it('refuses an in-person Plan without an area or address, and an online one without an https link', async () => {
    await expect(create(HOST, { address: null })).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { area: '' })).rejects.toThrow(/invalid_plan/);
    await expect(
      create(HOST, {
        format: 'online',
        area: null,
        address: null,
        link: 'http://insecure.example',
      }),
    ).rejects.toThrow(/invalid_plan/);
  });

  it('refuses blank-looking text, and trims what it keeps', async () => {
    await expect(create(HOST, { title: '   ' })).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { title: '\t\t\t' })).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { area: ' ' })).rejects.toThrow(/invalid_plan/);
    await expect(create(HOST, { address: '  ' })).rejects.toThrow(/invalid_plan/);
    const created = await create(HOST, { title: '  Lentil night  ', area: ' Neukölln ' });
    const id = created.rows[0]?.result.id ?? '';
    const row = await db.query<{ title: string; area_label: string }>(
      'select title, area_label from public.plans where id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({ title: 'Lentil night', area_label: 'Neukölln' });
  });

  it('refuses meeting links without a real host, and overlong ones', async () => {
    const online = { format: 'online', area: null, address: null };
    await expect(create(HOST, { ...online, link: 'https://?' })).rejects.toThrow(
      /invalid_plan/,
    );
    await expect(create(HOST, { ...online, link: 'https://meet' })).rejects.toThrow(
      /invalid_plan/,
    );
    await expect(create(HOST, { ...online, link: 'https://a.b@' })).rejects.toThrow(
      /invalid_plan/,
    );
    await expect(
      create(HOST, { ...online, link: `https://meet.google.com/${'a'.repeat(500)}` }),
    ).rejects.toThrow(/invalid_plan/);
    await expect(
      create(HOST, { ...online, link: 'https://meet.google.com/abc-defg-hij' }),
    ).resolves.toBeDefined();
  });

  it('answers a retry with the same key and input with the same Plan', async () => {
    const key = newKey();
    const first = await create(HOST, { key });
    const again = await create(HOST, { key });
    expect(again.rows[0]?.result.id).toBe(first.rows[0]?.result.id);
  });

  it('refuses a reused key with different input', async () => {
    const key = newKey();
    await create(HOST, { key });
    await expect(create(HOST, { key, title: 'Stew night' })).rejects.toThrow(
      /idempotency_key_reused/,
    );
  });
});

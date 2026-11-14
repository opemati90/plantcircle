import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

let db: PGlite;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (name, country_code, tz) values ('Berlin', 'DE', 'Europe/Berlin')`,
  );
});

type CityRow = { id: string; name: string; country_code: string; tz: string };
const ensure = (name: string, country: string, tz: string) =>
  db
    .query<{ c: CityRow }>('select to_jsonb(public.city_ensure($1, $2, $3)) as c', [
      name,
      country,
      tz,
    ])
    .then((x) => x.rows[0]?.c);

describe('a typed city', () => {
  it('finds a known city case-insensitively and adds an unknown one, before sign-up too', async () => {
    const known = await asUser(db, null, () => ensure(' berlin ', 'de', 'Europe/Berlin'));
    expect(known).toEqual(expect.objectContaining({ name: 'Berlin', country_code: 'DE' }));

    const added = await asUser(db, null, () => ensure('Lagos', 'NG', 'Africa/Lagos'));
    expect(added).toEqual(
      expect.objectContaining({ name: 'Lagos', country_code: 'NG', tz: 'Africa/Lagos' }),
    );
    // The same spelling in a different case is the same row; the first spelling is kept.
    const again = await asUser(db, null, () => ensure('LAGOS', 'NG', 'Africa/Lagos'));
    expect(again?.id).toBe(added?.id);
    expect(again?.name).toBe('Lagos');
    // The same name in another country is another city.
    const other = await asUser(db, null, () => ensure('Lagos', 'PT', 'Europe/Lisbon'));
    expect(other?.id).not.toBe(added?.id);
    const count = await db.query<{ n: number }>('select count(*)::int as n from public.cities');
    expect(count.rows[0]?.n).toBe(3);
  });

  it('limits new cities to five an hour per caller, finding known ones freely', async () => {
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      await asUser(db, null, () => ensure(name, 'DE', 'Europe/Berlin'));
    }
    await expect(asUser(db, null, () => ensure('F', 'DE', 'Europe/Berlin'))).rejects.toThrow(
      /rate_limited/,
    );
    expect((await asUser(db, null, () => ensure('berlin', 'DE', 'Europe/Berlin')))?.name).toBe(
      'Berlin',
    );
  });

  it('refuses an empty name, a bad country code or a time zone Intl would reject', async () => {
    await expect(asUser(db, null, () => ensure('Lagos', 'NG', 'Factory'))).rejects.toThrow(
      /invalid_input/,
    );
    await expect(
      asUser(db, null, () => ensure('Lagos', 'NG', 'posix/Africa/Lagos')),
    ).rejects.toThrow(/invalid_input/);
    expect((await asUser(db, null, () => ensure('Reykjavik', 'IS', 'Etc/UTC')))?.tz).toBe(
      'Etc/UTC',
    );
    await expect(asUser(db, null, () => ensure('  ', 'DE', 'Europe/Berlin'))).rejects.toThrow(
      /invalid_input/,
    );
    await expect(
      asUser(db, null, () => ensure('Lagos', 'Nigeria', 'Africa/Lagos')),
    ).rejects.toThrow(/invalid_input/);
    await expect(asUser(db, null, () => ensure('Lagos', 'NG', 'Mars/Olympus'))).rejects.toThrow(
      /invalid_input/,
    );
  });
});

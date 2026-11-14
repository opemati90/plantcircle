import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-000000000001';
const LENA = '00000000-0000-4000-8000-000000000002';
const MIA = '00000000-0000-4000-8000-000000000003';
const JONAS = '00000000-0000-4000-8000-000000000004';
const PLAN = '10000000-0000-4000-8000-000000000001';
const SOON_PLAN = '10000000-0000-4000-8000-000000000002';
const ITEM = '20000000-0000-4000-8000-000000000001';
const CITY = '30000000-0000-4000-8000-000000000001';

let keyCounter = 0;
/** A fresh idempotency key, as the app generates for each new user action. */
const newKey = () => `40000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

let db: PGlite;

async function seed(): Promise<void> {
  await db.query(
    `insert into public.cities (id, name, country_code, tz)
     values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [HOST, 'Ama O.'],
    [LENA, 'Lena'],
    [MIA, 'Mia S.'],
    [JONAS, 'Jonas'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [
      id,
      name,
    ]);
  }
  const plan = `insert into public.plans
    (id, host_id, title, kind, city_id, area_label, starts_at, ends_at, tz,
     capacity, description)
    values ($1, $2, $3, 'cooking_night', '${CITY}', 'Neukölln', $4, $5, 'Europe/Berlin', $6,
      'x')`;
  await db.query(plan, [PLAN, HOST, 'Cooking Night', 'now', 'tomorrow', 2]);
  await db.query(plan, [SOON_PLAN, HOST, 'Tonight', 'now', 'tomorrow', 8]);
  await db.exec(`
    update public.plans set starts_at = now() + interval '5 days',
      ends_at = now() + interval '5 days 3 hours' where id = '${PLAN}';
    update public.plans set starts_at = now() + interval '2 hours',
      ends_at = now() + interval '5 hours' where id = '${SOON_PLAN}';
    insert into public.plan_private (plan_id, address, reveal_at) values
      ('${PLAN}', 'Secret Street 1', now() + interval '4 days'),
      ('${SOON_PLAN}', 'Secret Street 2', now() - interval '1 hour');
    insert into public.contribution_slots (id, plan_id, label, needed)
      values ('${ITEM}', '${SOON_PLAN}', 'Plantains', 1);
  `);
}

const join = (user: string, plan = PLAN, key = newKey()) =>
  asUser(db, user, () =>
    db.query<{ result: { status: string } }>('select public.rsvp_join($1, $2) as result', [
      plan,
      key,
    ]),
  );
const cancel = (user: string, plan = PLAN, key = newKey()) =>
  asUser(db, user, () => db.query('select public.rsvp_cancel($1, $2)', [plan, key]));

beforeEach(async () => {
  db = await createDatabase();
  await seed();
});

describe('anonymous visitors', () => {
  it('can read public Plan cards but none of the underlying tables', async () => {
    await asUser(db, null, async () => {
      const cards = await db.query<{ id: string }>('select id from public.plan_cards');
      expect(cards.rows).toHaveLength(2);
      for (const table of [
        'plans',
        'profiles',
        'rsvps',
        'plan_private',
        'contribution_claims',
        'policy_acceptances',
        'idempotency_keys',
      ]) {
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      }
    });
  });

  it('cannot join a Plan', async () => {
    await expect(
      asUser(db, null, () => db.query('select public.rsvp_join($1, $2)', [PLAN, newKey()])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('profiles', () => {
  it('are only readable by their owner', async () => {
    const rows = await asUser(db, LENA, () =>
      db.query<{ id: string }>('select id from public.profiles'),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([LENA]);
  });

  it('cannot be created for someone else or self-verified as a host', async () => {
    const other = '00000000-0000-4000-8000-000000000009';
    await db.query('insert into auth.users (id) values ($1)', [other]);
    await expect(
      asUser(db, LENA, () =>
        db.query(`insert into public.profiles (id, display_name) values ($1, 'X')`, [other]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, LENA, () =>
        db.query('update public.profiles set is_verified_host = true where id = $1', [LENA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot be modified by another member (update matches no rows)', async () => {
    await asUser(db, MIA, () =>
      db.query(`update public.profiles set display_name = 'Hacked' where id = $1`, [LENA]),
    );
    const row = await db.query<{ display_name: string }>(
      'select display_name from public.profiles where id = $1',
      [LENA],
    );
    expect(row.rows[0]?.display_name).toBe('Lena');
  });
});

describe('joining a Plan', () => {
  it('confirms a spot, is idempotent, and updates the public count', async () => {
    await join(LENA);
    await join(LENA);
    const card = await db.query<{ going_count: number; attendee_initials: string[] }>(
      'select going_count, attendee_initials from public.plan_cards where id = $1',
      [PLAN],
    );
    expect(card.rows[0]).toEqual({ going_count: 1, attendee_initials: ['L'] });
  });

  it('never exceeds capacity', async () => {
    await join(LENA);
    await join(MIA);
    // A full Plan does not refuse: the newcomer is put in line instead.
    expect((await join(JONAS)).rows[0]?.result).toEqual({ status: 'waitlisted', position: 1 });
    const held = await db.query<{ n: number }>(
      `select count(*)::int as n from public.rsvps where plan_id = $1 and state = 'going'`,
      [PLAN],
    );
    expect(held.rows[0]?.n).toBe(2);
  });

  it('frees the spot on cancel so someone else can take it', async () => {
    await join(LENA);
    await join(MIA);
    await cancel(LENA);
    await expect(join(JONAS)).resolves.toBeDefined();
  });

  it('rejects the host and unknown Plans', async () => {
    await expect(join(HOST)).rejects.toThrow(/host_cannot_join/);
    await expect(join(LENA, '10000000-0000-4000-8000-00000000dead')).rejects.toThrow(
      /plan_not_found/,
    );
  });

  it('does not let members write RSVPs directly or read other members’ RSVPs', async () => {
    await join(MIA);
    await asUser(db, LENA, async () => {
      await expect(
        db.query(
          `insert into public.rsvps (plan_id, user_id, state) values ($1, $2, 'going')`,
          [PLAN, LENA],
        ),
      ).rejects.toThrow(/permission denied/);
      const visible = await db.query('select * from public.rsvps');
      expect(visible.rows).toHaveLength(0);
    });
  });
});

describe('idempotency', () => {
  it('replays the stored response instead of acting twice', async () => {
    const key = newKey();
    const first = await join(LENA, PLAN, key);
    await cancel(LENA);
    // Same key again (a retried request): nothing changes, the first answer comes back.
    const replay = await join(LENA, PLAN, key);
    expect(replay.rows[0]?.result).toEqual(first.rows[0]?.result);
    const card = await db.query<{ going_count: number }>(
      'select going_count from public.plan_cards where id = $1',
      [PLAN],
    );
    expect(card.rows[0]?.going_count).toBe(0);
  });

  it('keeps keys per member, and members cannot read the key table', async () => {
    const key = newKey();
    await join(LENA, PLAN, key);
    await join(MIA, PLAN, key);
    const card = await db.query<{ going_count: number }>(
      'select going_count from public.plan_cards where id = $1',
      [PLAN],
    );
    expect(card.rows[0]?.going_count).toBe(2);
    await expect(
      asUser(db, LENA, () => db.query('select * from public.idempotency_keys')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('policy acceptances', () => {
  const accept = (user: string, target: string) =>
    asUser(db, user, () =>
      db.query(
        `insert into public.policy_acceptances (user_id, policy, version)
         values ($1, 'terms', '2026-11')`,
        [target],
      ),
    );

  it('can only be recorded for yourself, with a server-side timestamp', async () => {
    await accept(LENA, LENA);
    await expect(accept(LENA, MIA)).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, LENA, () =>
        db.query(
          `insert into public.policy_acceptances (user_id, policy, version, accepted_at)
           values ($1, 'privacy', '1', '2020-01-01')`,
          [LENA],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    const mine = await asUser(db, MIA, () =>
      db.query('select * from public.policy_acceptances'),
    );
    expect(mine.rows).toHaveLength(0);
  });
});

describe('cities', () => {
  it('are public data that clients cannot change', async () => {
    await asUser(db, null, async () => {
      const cities = await db.query<{ name: string }>('select name from public.cities');
      expect(cities.rows.map((c) => c.name)).toEqual(['Berlin']);
      await expect(
        db.query(`insert into public.cities (name, country_code, tz) values ('X','XX','UTC')`),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('exact address', () => {
  const address = (user: string, plan: string) =>
    asUser(db, user, () =>
      db.query<{ address: string }>(
        'select address from public.plan_private where plan_id = $1',
        [plan],
      ),
    ).then((r) => r.rows.map((row) => row.address));

  it('is hidden from members who have not joined', async () => {
    expect(await address(LENA, SOON_PLAN)).toEqual([]);
  });

  it('is hidden from confirmed guests until reveal_at', async () => {
    await join(LENA, PLAN);
    expect(await address(LENA, PLAN)).toEqual([]);
  });

  it('is visible to confirmed guests after reveal_at, and hidden again after cancelling', async () => {
    await join(LENA, SOON_PLAN);
    expect(await address(LENA, SOON_PLAN)).toEqual(['Secret Street 2']);
    await cancel(LENA, SOON_PLAN);
    expect(await address(LENA, SOON_PLAN)).toEqual([]);
  });

  it('is always visible to the host', async () => {
    expect(await address(HOST, PLAN)).toEqual(['Secret Street 1']);
  });
});

describe('bring something', () => {
  const claim = (user: string) =>
    asUser(db, user, () => db.query('select public.slot_claim($1, $2)', [ITEM, newKey()]));

  it('requires a confirmed RSVP', async () => {
    await expect(claim(LENA)).rejects.toThrow(/rsvp_required/);
  });

  it('cannot be claimed more times than it is needed, and is released on cancel', async () => {
    await join(LENA, SOON_PLAN);
    await join(MIA, SOON_PLAN);
    await claim(LENA);
    await claim(LENA);
    await expect(claim(MIA)).rejects.toThrow(/item_taken/);

    await cancel(LENA, SOON_PLAN);
    await expect(claim(MIA)).resolves.toBeDefined();
    const card = await db.query<{ claimed_by: string[] }>(
      'select claimed_by from public.contribution_slot_cards where id = $1',
      [ITEM],
    );
    expect(card.rows[0]?.claimed_by).toEqual(['Mia S.']);
  });
});

describe('online Plans', () => {
  const ONLINE = '10000000-0000-4000-8000-0000000000aa';
  const LINK = 'https://meet.google.com/abc-defg-hij';

  // The Plan starts `minutesAhead` minutes from now.
  const startIn = (minutesAhead: number) =>
    db.exec(
      `update public.plans set starts_at = now() + interval '${minutesAhead} minutes',
         ends_at = now() + interval '${minutesAhead + 120} minutes' where id = '${ONLINE}'`,
    );

  beforeEach(async () => {
    await db.query(
      `insert into public.plans
         (id, host_id, title, kind, format, city_id, area_label, starts_at, ends_at, tz,
          capacity, description)
       values ($1, $2, 'Vegan Feijoada', 'online_class', 'online', $3, 'Online',
          now() + interval '5 hours', now() + interval '7 hours', 'Europe/Berlin', 8, 'x')`,
      [ONLINE, HOST, CITY],
    );
    // Online Plans have no address, but keep their private-details row for the reveal time.
    await db.query(
      `insert into public.plan_private (plan_id, reveal_at)
       values ($1, now() + interval '5 hours' - interval '10 minutes')`,
      [ONLINE],
    );
    await db.query(
      'insert into public.plan_meeting_links (plan_id, meeting_url) values ($1, $2)',
      [ONLINE, LINK],
    );
    await join(MIA, ONLINE);
  });

  const link = (user: string) =>
    asUser(db, user, () =>
      db.query<{ meeting_url: string }>(
        'select meeting_url from public.plan_meeting_links where plan_id = $1',
        [ONLINE],
      ),
    ).then((r) => r.rows.map((row) => row.meeting_url));

  it('is hidden from people who are not going, even close to the start', async () => {
    await startIn(5);
    expect(await link(LENA)).toEqual([]);
  });

  it('is hidden from confirmed guests until 15 minutes before the start', async () => {
    await startIn(30);
    expect(await link(MIA)).toEqual([]);
    await startIn(5);
    expect(await link(MIA)).toEqual([LINK]);
  });

  it('is always visible to the host', async () => {
    await startIn(300);
    expect(await link(HOST)).toEqual([LINK]);
  });

  it('never puts the meeting link on public Plan cards', async () => {
    await asUser(db, null, async () => {
      const cols = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_name = 'plan_cards' and column_name = 'meeting_url'`,
      );
      expect(cols.rows).toEqual([]);
      const card = await db.query<{ format: string }>(
        'select format from public.plan_cards where id = $1',
        [ONLINE],
      );
      expect(card.rows[0]?.format).toBe('online');
    });
  });
});

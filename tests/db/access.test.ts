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

let db: PGlite;

async function seed(): Promise<void> {
  for (const [id, name] of [
    [HOST, 'Ama O.'],
    [LENA, 'Lena'],
    [MIA, 'Mia S.'],
    [JONAS, 'Jonas'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      `insert into public.profiles (id, display_name, terms_version) values ($1, $2, '2026-11')`,
      [id, name],
    );
  }
  const plan = `insert into public.plans
    (id, host_id, title, category, city, area_name, starts_at, ends_at, timezone, capacity,
     description)
    values ($1, $2, $3, 'cooking_class', 'Berlin', 'Neukölln', $4, $5, 'Europe/Berlin', $6, 'x')`;
  await db.query(plan, [PLAN, HOST, 'Cooking Night', 'now', 'tomorrow', 2]);
  await db.query(plan, [SOON_PLAN, HOST, 'Tonight', 'now', 'tomorrow', 8]);
  await db.exec(`
    update public.plans set starts_at = now() + interval '5 days',
      ends_at = now() + interval '5 days 3 hours' where id = '${PLAN}';
    update public.plans set starts_at = now() + interval '2 hours',
      ends_at = now() + interval '5 hours' where id = '${SOON_PLAN}';
    insert into public.plan_private (plan_id, address) values
      ('${PLAN}', 'Secret Street 1'), ('${SOON_PLAN}', 'Secret Street 2');
    insert into public.bring_items (id, plan_id, label, quantity)
      values ('${ITEM}', '${SOON_PLAN}', 'Plantains', 1);
  `);
}

const join = (user: string, plan = PLAN) =>
  asUser(db, user, () => db.query('select public.join_plan($1) as status', [plan]));

beforeEach(async () => {
  db = await createDatabase();
  await seed();
});

describe('anonymous visitors', () => {
  it('can read public Plan cards but none of the underlying tables', async () => {
    await asUser(db, null, async () => {
      const cards = await db.query<{ id: string }>('select id from public.plan_cards');
      expect(cards.rows).toHaveLength(2);
      for (const table of ['plans', 'profiles', 'rsvps', 'plan_private', 'bring_claims']) {
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      }
    });
  });

  it('cannot join a Plan', async () => {
    await expect(
      asUser(db, null, () => db.query('select public.join_plan($1)', [PLAN])),
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
        db.query(
          `insert into public.profiles (id, display_name, terms_version) values ($1, 'X', '1')`,
          [other],
        ),
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
    await expect(join(JONAS)).rejects.toThrow(/plan_full/);
  });

  it('frees the spot on cancel so someone else can take it', async () => {
    await join(LENA);
    await join(MIA);
    await asUser(db, LENA, () => db.query('select public.cancel_rsvp($1)', [PLAN]));
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
          `insert into public.rsvps (plan_id, user_id, status) values ($1, $2, 'going')`,
          [PLAN, LENA],
        ),
      ).rejects.toThrow(/permission denied/);
      const visible = await db.query('select * from public.rsvps');
      expect(visible.rows).toHaveLength(0);
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

  it('is hidden from confirmed guests until 24 hours before the start', async () => {
    await join(LENA, PLAN);
    expect(await address(LENA, PLAN)).toEqual([]);
  });

  it('is visible to confirmed guests inside the window, and hidden again after cancelling', async () => {
    await join(LENA, SOON_PLAN);
    expect(await address(LENA, SOON_PLAN)).toEqual(['Secret Street 2']);
    await asUser(db, LENA, () => db.query('select public.cancel_rsvp($1)', [SOON_PLAN]));
    expect(await address(LENA, SOON_PLAN)).toEqual([]);
  });

  it('is always visible to the host', async () => {
    expect(await address(HOST, PLAN)).toEqual(['Secret Street 1']);
  });
});

describe('bring something', () => {
  const claim = (user: string) =>
    asUser(db, user, () => db.query('select public.claim_bring_item($1)', [ITEM]));

  it('requires a confirmed RSVP', async () => {
    await expect(claim(LENA)).rejects.toThrow(/rsvp_required/);
  });

  it('cannot be claimed more times than the quantity, and is released on cancel', async () => {
    await join(LENA, SOON_PLAN);
    await join(MIA, SOON_PLAN);
    await claim(LENA);
    await claim(LENA);
    await expect(claim(MIA)).rejects.toThrow(/item_taken/);

    await asUser(db, LENA, () => db.query('select public.cancel_rsvp($1)', [SOON_PLAN]));
    await expect(claim(MIA)).resolves.toBeDefined();
    const card = await db.query<{ claimed_by: string[] }>(
      'select claimed_by from public.bring_item_cards where id = $1',
      [ITEM],
    );
    expect(card.rows[0]?.claimed_by).toEqual(['Mia S.']);
  });
});

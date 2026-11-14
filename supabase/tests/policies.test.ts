import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ANA = '00000000-0000-4000-8000-0000000000a1';
const CITY = '30000000-0000-4000-8000-0000000000a0';

let db: PGlite;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  await db.query('insert into auth.users (id) values ($1)', [ANA]);
  await db.query(
    'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
    [ANA, 'Ana', CITY],
  );
  await db.query(
    `insert into public.policy_acceptances (user_id, policy, version) values ($1, 'terms', '2026-11'), ($1, 'community_rules', '2026-11'), ($1, 'privacy', '2026-11')`,
    [ANA],
  );
});

const pending = () =>
  asUser(db, ANA, () =>
    db.query<{
      policy: string;
      version: string;
      blocking: boolean;
      accepted_version: string | null;
    }>('select policy, version, blocking, accepted_version from public.policies_pending()'),
  ).then((r) => r.rows);

describe('policy versions', () => {
  it('shows nothing pending on the current versions, then a new version once published, blocking once effective', async () => {
    expect(await pending()).toEqual([]);
    await db.query(
      `insert into public.policy_versions (policy, version, effective_at, published_at, summary) values ('terms', '2026-12', now() + interval '14 days', now(), '[{"title": "Paid workshops", "note": "How booking, refunds and payouts work"}]')`,
    );
    expect(await pending()).toEqual([
      { policy: 'terms', version: '2026-12', blocking: false, accepted_version: '2026-11' },
    ]);
    await db.query(
      `update public.policy_versions set effective_at = now() - interval '1 minute' where version = '2026-12'`,
    );
    expect((await pending())[0]?.blocking).toBe(true);
    // A version published for later stays invisible until then.
    await db.query(
      `insert into public.policy_versions (policy, version, effective_at, published_at) values ('privacy', '2027-01', now() + interval '60 days', now() + interval '30 days')`,
    );
    expect((await pending()).map((p) => p.policy)).toEqual(['terms']);
  });

  it('accepts every pending version at once, and refuses an acceptance of an unknown version', async () => {
    await db.query(
      `insert into public.policy_versions (policy, version, effective_at) values ('terms', '2026-12', now()), ('privacy', '2026-12', now())`,
    );
    const shown = JSON.stringify([
      { policy: 'terms', version: '2026-12' },
      { policy: 'privacy', version: '2026-12' },
    ]);
    const count = await asUser(db, ANA, () =>
      db.query<{ n: number }>('select public.policies_accept($1) as n', [shown]),
    ).then((r) => r.rows[0]?.n);
    expect(count).toBe(2);
    expect(await pending()).toEqual([]);
    const again = await asUser(db, ANA, () =>
      db.query<{ n: number }>('select public.policies_accept($1) as n', [shown]),
    ).then((r) => r.rows[0]?.n);
    expect(again).toBe(0);
    // Only what was shown: a version published after the screen loaded is not accepted by it.
    await db.query(
      `insert into public.policy_versions (policy, version, effective_at) values ('terms', '2027-01', now())`,
    );
    await asUser(db, ANA, () => db.query('select public.policies_accept($1)', [shown]));
    expect((await pending()).map((p) => p.version)).toEqual(['2027-01']);
    await expect(
      asUser(db, ANA, () =>
        db.query('select public.policies_accept($1)', [
          JSON.stringify([{ policy: 'terms', version: '2099-01' }]),
        ]),
      ),
    ).rejects.toThrow(/unknown_policy_version/);
    await expect(
      asUser(db, ANA, () =>
        db.query(
          `insert into public.policy_acceptances (user_id, policy, version) values ($1, 'terms', '2099-01')`,
          [ANA],
        ),
      ),
    ).rejects.toThrow(/unknown_policy_version/);
    await expect(
      asUser(db, null, () => db.query('select public.policies_accept($1)', [shown])),
    ).rejects.toThrow();
    const anon = await asUser(db, null, () =>
      db.query('select policy from public.policy_versions'),
    );
    expect(anon.rows.length).toBeGreaterThan(0);
  });
});

describe('profile stats', () => {
  it('counts whole totals, and refuses unknown goals', async () => {
    const stats = await asUser(db, ANA, () =>
      db.query<{ s: { plans: number; circles: number; connections: number } }>(
        'select public.profile_stats() as s',
      ),
    ).then((r) => r.rows[0]?.s);
    expect(stats).toEqual({ plans: 0, circles: 0, connections: 0 });
    await expect(
      asUser(db, ANA, () =>
        db.query(`update public.profiles set goals = array['cook', 'vegan'] where id = $1`, [
          ANA,
        ]),
      ),
    ).rejects.toThrow(/profiles_goals_known/);
    await asUser(db, ANA, () =>
      db.query(`update public.profiles set goals = array['cook', 'buy'] where id = $1`, [ANA]),
    );
  });
});

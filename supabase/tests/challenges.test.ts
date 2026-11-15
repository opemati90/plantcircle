import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const AMA = '00000000-0000-4000-8000-0000000000d1'; // owner
const LENA = '00000000-0000-4000-8000-0000000000d2'; // member
const MIA = '00000000-0000-4000-8000-0000000000d3'; // outsider
const CITY = '30000000-0000-4000-8000-0000000000d9';
const KITCHEN = '50000000-0000-4000-8000-0000000000d1';

let db: PGlite;
let counter = 0;
const key = () => `63000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Auckland', 'NZ', 'Pacific/Auckland')`,
    [CITY],
  );
  for (const [id, name] of [
    [AMA, 'Ama'],
    [LENA, 'Lena'],
    [MIA, 'Mia'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [
      id,
      name,
    ]);
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Ponsonby Plants', $2, 'open', $3)`,
    [KITCHEN, CITY, AMA],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [KITCHEN, AMA, LENA],
  );
});

const thisWeek = () =>
  db
    .query<{ w: string }>('select public.circle_week_start($1, now())::text as w', [KITCHEN])
    .then((r) => r.rows[0]!.w);

const post = async (user: string, forChallenge: boolean | string, createdAt?: string) => {
  const path = `${user}/a0000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}.jpg`;
  await db.query(
    `insert into public.cook_uploads (photo_path, user_id, width, height, stored_at) values ($1, $2, 1200, 1500, now())`,
    [path, user],
  );
  const week =
    typeof forChallenge === 'string' ? forChallenge : forChallenge ? await thisWeek() : null;
  const id = await asUser(db, user, () =>
    db.query<{ r: { id: string } }>(
      `select public.cook_create($1, null, 'Red lentil dal', $2, null, $3::date, $4) as r`,
      [KITCHEN, path, week, key()],
    ),
  ).then((r) => r.rows[0]!.r.id);
  if (createdAt) {
    await db.query('update public.cooks set created_at = $1 where id = $2', [createdAt, id]);
  }
  return id;
};

const challenge = (user: string) =>
  asUser(db, user, () =>
    db.query<{
      r: {
        week_start: string;
        theme: string | null;
        can_set: boolean;
        entrants: number;
        entries: { id: string }[];
      };
    }>('select public.circle_challenge($1) as r', [KITCHEN]),
  ).then((r) => r.rows[0]!.r);

const setTheme = async (user: string, theme: string | null, week?: string, k = key()) => {
  const w = week ?? (await thisWeek());
  return asUser(db, user, () =>
    db.query('select public.circle_challenge_set($1, $2::date, $3, $4)', [
      KITCHEN,
      w,
      theme,
      k,
    ]),
  );
};

describe('the weekly challenge', () => {
  it('starts the week on Monday in the Circle’s own time zone', async () => {
    const week = await db.query<{ w: string }>(
      `select public.circle_week_start($1, '2026-11-15T12:00:00Z')::text as w`,
      [KITCHEN],
    );
    // Sunday noon UTC is already Monday 16 November 01:00 in Auckland.
    expect(week.rows[0]?.w).toBe('2026-11-16');
  });

  it('has a default (null) theme until an owner sets one; members cannot, outsiders see nothing', async () => {
    expect(await challenge(LENA)).toMatchObject({ theme: null, can_set: false, entrants: 0 });
    expect((await challenge(AMA)).can_set).toBe(true);
    await expect(setTheme(LENA, 'Lentils')).rejects.toThrow(/not_moderator/);
    await expect(challenge(MIA)).rejects.toThrow(/circle_not_found/);
    await setTheme(AMA, '  Lentils ');
    expect((await challenge(LENA)).theme).toBe('Lentils');
    await expect(setTheme(AMA, 'x'.repeat(41))).rejects.toThrow(/invalid_input/);
    await setTheme(AMA, null);
    expect((await challenge(LENA)).theme).toBeNull();
    const audit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_events where action = 'circle.challenge_set'`,
    );
    expect(audit.rows[0]?.n).toBe(2);
  });

  it('counts entries of this week only, and labels them with the week’s theme', async () => {
    await setTheme(AMA, 'Lentils');
    await post(LENA, true);
    await post(LENA, true);
    await post(AMA, false);
    const now = await challenge(AMA);
    expect(now.entrants).toBe(1);
    expect(now.entries).toHaveLength(2);
    const cards = await asUser(db, AMA, () =>
      db.query<{ challenge_theme: string | null; challenge_week: string | null }>(
        'select challenge_theme, challenge_week::text from public.cook_cards order by created_at',
      ),
    );
    expect(cards.rows.filter((c) => c.challenge_theme === 'Lentils')).toHaveLength(2);
    expect(cards.rows.filter((c) => c.challenge_week === null)).toHaveLength(1);
  });
});

const streak = (user: string) =>
  asUser(db, user, () =>
    db.query<{ r: { current: number; best: number; weeks: number } }>(
      'select public.cook_streak() as r',
    ),
  ).then((r) => r.rows[0]!.r);

describe('challenge entries keep their week and theme', () => {
  it('keeps the theme an entry was posted under when the theme changes', async () => {
    await setTheme(AMA, 'Lentils');
    await post(LENA, true);
    await setTheme(AMA, 'Breakfast');
    const cards = await asUser(db, AMA, () =>
      db.query<{ challenge_theme: string }>('select challenge_theme from public.cook_cards'),
    );
    expect(cards.rows[0]?.challenge_theme).toBe('Lentils');
  });

  it('refuses an entry for a week that has ended', async () => {
    await expect(post(LENA, '2026-01-05')).rejects.toThrow(/challenge_ended/);
  });
});

describe('cooking streaks', () => {
  it('counts consecutive weeks ending this week or last, and keeps the best', async () => {
    const weeksAgo = (n: number) => new Date(Date.now() - n * 7 * 86_400_000).toISOString();
    for (const n of [10, 9, 8, 2, 1]) await post(LENA, false, weeksAgo(n));
    expect(await streak(LENA)).toEqual({ current: 2, best: 3, weeks: 5 });
    await post(LENA, false);
    expect(await streak(LENA)).toMatchObject({ current: 3, best: 3, weeks: 6 });
  });

  it('ends the current run after a whole week without a post', async () => {
    await post(LENA, false, new Date(Date.now() - 15 * 86_400_000).toISOString());
    expect((await streak(LENA)).current).toBe(0);
  });

  it('is only ever your own', async () => {
    await post(LENA, false);
    expect((await streak(AMA)).current).toBe(0);
    await expect(
      asUser(db, null, () => db.query('select public.cook_streak()')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('saving a theme and sharing across app versions', () => {
  it('refuses a theme for a week that has ended, and replays a retried save', async () => {
    await expect(setTheme(AMA, 'Lentils', '2026-01-05')).rejects.toThrow(/challenge_ended/);
    const k = key();
    await setTheme(AMA, 'Lentils', undefined, k);
    await setTheme(AMA, 'Lentils', undefined, k);
    const audit = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_events where action = 'circle.challenge_set'`,
    );
    expect(audit.rows[0]?.n).toBe(1);
  });

  it('still accepts the six-argument share from older app builds', async () => {
    const path = `${LENA}/f0000000-0000-4000-8000-000000000001.jpg`;
    await db.query(
      `insert into public.cook_uploads (photo_path, user_id, width, height, stored_at) values ($1, $2, 1200, 1500, now())`,
      [path, LENA],
    );
    const k = key();
    const first = await asUser(db, LENA, () =>
      db.query<{ r: { id: string } }>(
        `select public.cook_create($1, null, 'Dal', $2, null, $3) as r`,
        [KITCHEN, path, k],
      ),
    );
    // The same request through the new signature replays the first answer.
    const again = await asUser(db, LENA, () =>
      db.query<{ r: { id: string } }>(
        `select public.cook_create($1, null, 'Dal', $2, null, null, $3) as r`,
        [KITCHEN, path, k],
      ),
    );
    expect(again.rows[0]?.r.id).toBe(first.rows[0]?.r.id);
  });

  it('returns each entry’s caption and author for its accessible name', async () => {
    await post(LENA, true);
    const entries = (await challenge(AMA)).entries as unknown as {
      caption: string;
      author_name: string;
    }[];
    expect(entries[0]).toMatchObject({ caption: 'Red lentil dal', author_name: 'Lena' });
  });
});

describe('the Monday notice', () => {
  // Monday 3 June 2030, 09:30 in Auckland.
  const monday = '2030-06-02T21:30:00Z';
  const digest = (at: string) =>
    db
      .query<{ n: number }>('select public.weekly_digest_enqueue($1) as n', [at])
      .then((r) => r.rows[0]!.n);

  it('leads with the Circle’s theme for members, even with no Plans; others get nothing', async () => {
    await db.query('update public.profiles set city_id = $1 where id in ($2, $3)', [
      CITY,
      LENA,
      MIA,
    ]);
    expect(await digest(monday)).toBe(1); // Lena: a Circle. Mia: no Circle, no Plans.
    const row = await db.query<{ payload: Record<string, string> }>(
      `select payload from public.notifications where user_id = $1 and type = 'weekly_digest'`,
      [LENA],
    );
    expect(row.rows[0]?.payload).toMatchObject({
      circle: 'Ponsonby Plants',
      circle_id: KITCHEN,
      theme: '',
      theme_key: 'onePot',
    });
    const queued = await db.query<{ title: string; body: string }>(
      `select title, body from public.push_queue where user_id = $1 and type = 'weekly_digest'`,
      [LENA],
    );
    expect(queued.rows[0]).toEqual({
      title: 'This week in Ponsonby Plants',
      body: 'Cook it at home and share a photo with your Circle.',
    });
    expect(await digest('2030-06-02T22:30:00Z')).toBe(0); // same week: sent once
  });

  it('carries a custom theme as written', async () => {
    await db.query('update public.profiles set city_id = $1 where id = $2', [CITY, LENA]);
    await db.query(
      `insert into public.circle_challenges (circle_id, week_start, theme) values ($1, '2030-06-03', 'Lentils')`,
      [KITCHEN],
    );
    await digest(monday);
    const row = await db.query<{ payload: Record<string, string> }>(
      `select payload from public.notifications where user_id = $1 and type = 'weekly_digest'`,
      [LENA],
    );
    expect(row.rows[0]?.payload).toMatchObject({ theme: 'Lentils', theme_key: '' });
  });
});

describe('the invite page', () => {
  it('shows this week’s theme to anyone for a Circle anyone can see, never for invite-only ones', async () => {
    await setTheme(AMA, 'Lentils');
    const seen = await asUser(db, null, () =>
      db.query<{ r: { theme: string; week_start: string } }>(
        'select public.circle_week_public($1) as r',
        [KITCHEN],
      ),
    );
    expect(seen.rows[0]?.r.theme).toBe('Lentils');
    await db.query(`update public.circles set access = 'invite' where id = $1`, [KITCHEN]);
    await expect(
      asUser(db, null, () => db.query('select public.circle_week_public($1)', [KITCHEN])),
    ).rejects.toThrow(/circle_not_found/);
  });
});

describe('the Monday notice respects choices and clocks', () => {
  it('sends nothing, not even the Inbox line, with reminders off', async () => {
    await db.query('update public.profiles set city_id = $1 where id = $2', [CITY, LENA]);
    await db.query(
      `insert into public.user_settings (user_id, notif_reminders) values ($1, false)`,
      [LENA],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select public.weekly_digest_enqueue('2030-06-02T21:30:00Z') as n",
        )
      ).rows[0]?.n,
    ).toBe(0);
  });

  it('waits when the Circle is still on last week where it is, rather than announcing a theme its page does not show yet', async () => {
    // A New York Circle; Lena lives in Auckland. Her Monday 09:30 is Sunday in New York.
    await db.query(
      `insert into public.cities (id, name, country_code, tz) values ('30000000-0000-4000-8000-0000000000e1', 'New York', 'US', 'America/New_York')`,
    );
    await db.query(
      `update public.circles set city_id = '30000000-0000-4000-8000-0000000000e1' where id = $1`,
      [KITCHEN],
    );
    await db.query('update public.profiles set city_id = $1 where id = $2', [CITY, LENA]);
    expect(
      (
        await db.query<{ n: number }>(
          "select public.weekly_digest_enqueue('2030-06-02T21:30:00Z') as n",
        )
      ).rows[0]?.n,
    ).toBe(0);
    // The week mark was not kept, so a later run that week can still send.
    const marks = await db.query('select 1 from public.notification_marks where user_id = $1', [
      LENA,
    ]);
    expect(marks.rows).toEqual([]);
  });
});

describe('analytics deletion requests', () => {
  it('records a member’s request once, refuses visitors and junk, and keeps the table private', async () => {
    const ask = (user: string | null, id: string) =>
      asUser(db, user, () => db.query('select public.analytics_forget($1)', [id]));
    await ask(LENA, 'a1b2c3d4-0000-4000-8000-000000000001');
    await ask(LENA, 'a1b2c3d4-0000-4000-8000-000000000001');
    expect((await db.query('select 1 from public.analytics_deletions')).rows).toHaveLength(1);
    await expect(ask(null, 'a1b2c3d4-0000-4000-8000-000000000002')).rejects.toThrow(
      /permission denied|not_authenticated/,
    );
    await expect(ask(LENA, 'x')).rejects.toThrow(/invalid_input/);
    await expect(
      asUser(db, LENA, () => db.query('select * from public.analytics_deletions')),
    ).rejects.toThrow(/permission denied/);
  });
});

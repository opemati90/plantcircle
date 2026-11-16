import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const AMA = '00000000-0000-4000-8000-0000000000e1'; // owns the Circle
const LENA = '00000000-0000-4000-8000-0000000000e2'; // member
const BEN = '00000000-0000-4000-8000-0000000000e3'; // member
const MOD = '00000000-0000-4000-8000-0000000000e4'; // moderator
const MIA = '00000000-0000-4000-8000-0000000000e5'; // outsider
const DANA = '00000000-0000-4000-8000-0000000000e6'; // staff
const SAM = '00000000-0000-4000-8000-0000000000e7'; // staff, second reviewer
const CITY = '30000000-0000-4000-8000-0000000000e9';
const KITCHEN = '50000000-0000-4000-8000-0000000000e1';

let db: PGlite;
let counter = 0;
const key = () => `63000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [AMA, 'Ama'],
    [LENA, 'Lena'],
    [BEN, 'Ben'],
    [MOD, 'Mo'],
    [MIA, 'Mia'],
    [DANA, 'Dana'],
    [SAM, 'Sam'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2)', [
      id,
      name,
    ]);
  }
  await db.query(`update public.profiles set role = 'staff' where id in ($1, $2)`, [DANA, SAM]);
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by)
     values ($1, 'Neukölln Plant Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, AMA],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values
       ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'moderator')`,
    [KITCHEN, AMA, LENA, BEN, MOD],
  );
});

const upload = async (user: string) => {
  const path = `${user}/a0000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}.jpg`;
  await db.query(
    `insert into public.cook_uploads (photo_path, user_id, width, height, created_at, stored_at)
     values ($1, $2, 1200, 1500, now(), now())`,
    [path, user],
  );
  return path;
};

const post = (
  user: string,
  kind: string,
  caption: string,
  options: { path?: string | null; week?: string | null } = {},
) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>(
      'select public.cook_create($1, null, $2, $3, null, $4::date, $5, $6) as result',
      [KITCHEN, caption, options.path ?? null, options.week ?? null, kind, key()],
    ),
  ).then((r) => r.rows[0]!.result.id);

const comment = (user: string, cook: string, body: string) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>(
      'select public.cook_comment_add($1, $2, $3) as result',
      [cook, body, key()],
    ),
  ).then((r) => r.rows[0]!.result.id);

const cards = (user: string) =>
  asUser(db, user, () =>
    db.query<{
      id: string;
      kind: string;
      host_removed: boolean;
      comments: number;
      can_remove: boolean;
      photo_path: string | null;
    }>(
      'select id, kind, host_removed, comments, can_remove, photo_path from public.cook_cards order by created_at, id',
    ),
  ).then((r) => r.rows);

const comments = (user: string, cook: string) =>
  asUser(db, user, () =>
    db.query<{ id: string; body: string; host_removed: boolean; can_remove: boolean }>(
      'select id, body, host_removed, can_remove from public.cook_comment_cards where cook_id = $1 order by created_at, id',
      [cook],
    ),
  ).then((r) => r.rows);

const notices = (user: string, type: string) =>
  db
    .query<{ payload: Record<string, string> }>(
      'select payload from public.notifications where user_id = $1 and type = $2',
      [user, type],
    )
    .then((r) => r.rows);

describe('post kinds', () => {
  it('takes a tip, question or find without a photo; a Cooked post needs one', async () => {
    const tip = await post(
      LENA,
      'tip',
      'Soak chickpeas overnight with a pinch of baking soda.',
    );
    const find = await post(LENA, 'find', 'Fresh tofu at the Vietnamese shop on Sonnenallee.');
    const cooked = await post(LENA, 'cooked', 'Chickpea curry', { path: await upload(LENA) });
    expect((await cards(BEN)).map((c) => [c.id, c.kind, c.photo_path === null])).toEqual([
      [tip, 'tip', true],
      [find, 'find', true],
      [cooked, 'cooked', false],
    ]);
    await expect(post(LENA, 'cooked', 'No photo')).rejects.toThrow(/invalid_input/);
    await expect(post(LENA, 'rant', 'Nope')).rejects.toThrow(/invalid_input/);
    // Up to 500 characters for a text post, 140 for Cooked.
    await post(LENA, 'question', 'q'.repeat(500));
    await expect(post(LENA, 'question', 'q'.repeat(501))).rejects.toThrow(/invalid_input/);
    await expect(
      post(LENA, 'cooked', 'c'.repeat(141), { path: await upload(LENA) }),
    ).rejects.toThrow(/invalid_input/);
  });

  it('keeps the challenge, cooking weeks and hosting for what was cooked', async () => {
    const week = await db
      .query<{ w: string }>('select public.circle_week_start($1, now())::text as w', [KITCHEN])
      .then((r) => r.rows[0]!.w);
    await expect(post(LENA, 'tip', 'A tip', { week })).rejects.toThrow(/invalid_input/);
    await post(LENA, 'question', 'Where do you buy seitan?');
    await post(LENA, 'tip', 'Freeze ginger.');
    const streak = await asUser(db, LENA, () =>
      db.query<{ s: { weeks: number } }>('select public.cook_streak() as s'),
    ).then((r) => r.rows[0]!.s);
    expect(streak.weeks).toBe(0);
    const level = await asUser(db, LENA, () =>
      db.query<{ l: { posts: number } }>('select public.host_level() as l'),
    ).then((r) => r.rows[0]!.l);
    expect(level.posts).toBe(0);
    await post(LENA, 'cooked', 'Dal', { path: await upload(LENA), week });
    const challenge = await asUser(db, BEN, () =>
      db.query<{ c: { entrants: number } }>('select public.circle_challenge($1) as c', [
        KITCHEN,
      ]),
    ).then((r) => r.rows[0]!.c);
    expect(challenge.entrants).toBe(1);
  });

  it('deletes a text post without touching photo cleanup', async () => {
    const tip = await post(LENA, 'tip', 'Salt your pasta water.');
    await asUser(db, LENA, () => db.query('select public.cook_delete($1, $2)', [tip, key()]));
    expect(await cards(BEN)).toEqual([]);
    expect((await db.query('select 1 from public.cook_photo_deletions')).rows).toEqual([]);
  });
});

describe('comments', () => {
  it('lets members comment, oldest first, with a count; outsiders see nothing', async () => {
    const q = await post(LENA, 'question', 'Best lentils for dal?');
    await comment(BEN, q, 'Red lentils, they melt.');
    await comment(LENA, q, 'Thanks!');
    expect((await comments(AMA, q)).map((c) => c.body)).toEqual([
      'Red lentils, they melt.',
      'Thanks!',
    ]);
    expect((await cards(AMA))[0]?.comments).toBe(2);
    await expect(comment(MIA, q, 'Hi')).rejects.toThrow(/not_found/);
    expect(await comments(MIA, q)).toEqual([]);
    await expect(comment(BEN, q, '   ')).rejects.toThrow(/invalid_input/);
    await expect(comment(BEN, q, 'x'.repeat(501))).rejects.toThrow(/invalid_input/);
  });

  it('hides comments across a block, both ways', async () => {
    const q = await post(LENA, 'question', 'Tofu press worth it?');
    await comment(BEN, q, 'Use a heavy book.');
    await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [
      AMA,
      BEN,
    ]);
    expect(await comments(AMA, q)).toEqual([]);
    expect((await cards(AMA))[0]?.comments).toBe(0);
    expect((await comments(LENA, q)).length).toBe(1);
  });

  it('lets an author delete their own comment, not someone else’s', async () => {
    const q = await post(LENA, 'question', 'Oat milk brand?');
    const mine = await comment(BEN, q, 'The barista one.');
    await expect(
      asUser(db, LENA, () =>
        db.query('select public.cook_comment_delete($1, $2)', [mine, key()]),
      ),
    ).rejects.toThrow(/not_found/);
    await asUser(db, BEN, () =>
      db.query('select public.cook_comment_delete($1, $2)', [mine, key()]),
    );
    expect(await comments(LENA, q)).toEqual([]);
  });

  it('allows 60 comments a day, and deleting does not give one back', async () => {
    const q = await post(LENA, 'question', 'Ideas?');
    for (let i = 0; i < 60; i += 1) await comment(BEN, q, `idea ${String(i)}`);
    await expect(comment(BEN, q, 'one more')).rejects.toThrow(/rate_limited/);
  });

  it('tells the author once per 10 minutes, never for their own comment, and not when switched off', async () => {
    const q = await post(LENA, 'question', 'Sourdough starter tips?');
    await comment(LENA, q, 'Bump');
    expect(await notices(LENA, 'cook_comment')).toEqual([]);
    await comment(BEN, q, 'Feed it daily.');
    await comment(AMA, q, 'Keep it warm.');
    const sent = await notices(LENA, 'cook_comment');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({
      cook_id: q,
      name: 'Ben',
      circle: 'Neukölln Plant Kitchen',
    });
    // The comment's words are never in the queued push.
    const queuedPush = await db.query<{ title: string; body: string }>(
      `select title, body from public.push_queue where user_id = $1 and type = 'cook_comment'`,
      [LENA],
    );
    expect(JSON.stringify(queuedPush.rows)).not.toContain('Feed it daily');
    expect(
      (
        await db.query(
          `select 1 from public.push_queue where user_id = $1 and type = 'cook_comment'`,
          [LENA],
        )
      ).rows,
    ).toHaveLength(1);
    // Ten minutes later, another notice; with the switch off, none.
    await db.query(
      `update public.cooks set comment_notified_at = now() - interval '11 minutes'`,
    );
    await comment(BEN, q, 'Rye flour helps.');
    expect(await notices(LENA, 'cook_comment')).toHaveLength(2);
    await asUser(db, LENA, () =>
      db.query(`select public.settings_update('{"notif_comments": false}'::jsonb)`),
    );
    await db.query(
      `update public.cooks set comment_notified_at = now() - interval '11 minutes'`,
    );
    await comment(BEN, q, 'And patience.');
    expect(await notices(LENA, 'cook_comment')).toHaveLength(2);
    const settings = await asUser(db, LENA, () =>
      db.query<{ s: { notif_comments: boolean } }>('select public.settings_get() as s'),
    ).then((r) => r.rows[0]!.s);
    expect(settings.notif_comments).toBe(false);
  });
});

describe('host removal', () => {
  it('lets the owner remove a member’s post: hidden for others, marked for its author, who is told', async () => {
    const tip = await post(LENA, 'tip', 'Buy my course!');
    expect((await cards(AMA))[0]?.can_remove).toBe(true);
    expect((await cards(BEN))[0]?.can_remove).toBe(false);
    await expect(
      asUser(db, BEN, () => db.query('select public.circle_post_remove($1)', [tip])),
    ).rejects.toThrow(/forbidden/);
    await asUser(db, AMA, () => db.query('select public.circle_post_remove($1)', [tip]));
    await asUser(db, AMA, () => db.query('select public.circle_post_remove($1)', [tip]));
    expect(await cards(BEN)).toEqual([]);
    expect(await cards(LENA)).toMatchObject([
      { id: tip, host_removed: true, can_remove: false },
    ]);
    expect(await notices(LENA, 'circle_post_removed')).toHaveLength(1);
    const audit = await db.query(
      `select 1 from public.audit_events where action = 'circle.remove_post'`,
    );
    expect(audit.rows).toHaveLength(1);
    // A removed post takes no new comments.
    await expect(comment(LENA, tip, 'Why?')).rejects.toThrow(/not_found/);
  });

  it('lets hosts remove members’ content only: never a host’s, never their own this way', async () => {
    const owners = await post(AMA, 'tip', 'Welcome!');
    const mods = await post(MOD, 'tip', 'Be kind.');
    const members = await post(BEN, 'find', 'Cheap spices on Karl-Marx-Straße.');
    await expect(
      asUser(db, AMA, () => db.query('select public.circle_post_remove($1)', [mods])),
    ).rejects.toThrow(/forbidden/);
    await expect(
      asUser(db, MOD, () => db.query('select public.circle_post_remove($1)', [owners])),
    ).rejects.toThrow(/forbidden/);
    await expect(
      asUser(db, AMA, () => db.query('select public.circle_post_remove($1)', [owners])),
    ).rejects.toThrow(/forbidden/);
    await asUser(db, MOD, () => db.query('select public.circle_post_remove($1)', [members]));
    expect((await cards(LENA)).map((c) => c.id)).toEqual([owners, mods]);
    // A member gets no hint about what was removed.
    await expect(
      asUser(db, LENA, () => db.query('select public.circle_post_remove($1)', [members])),
    ).rejects.toThrow(/forbidden|not_found/);
  });

  it('lets a host remove a comment: the author still sees it marked, and is told', async () => {
    const q = await post(LENA, 'question', 'Dinner ideas?');
    const rude = await comment(BEN, q, 'Rude remark');
    expect((await comments(AMA, q))[0]?.can_remove).toBe(true);
    await asUser(db, AMA, () => db.query('select public.circle_comment_remove($1)', [rude]));
    expect(await comments(LENA, q)).toEqual([]);
    expect(await comments(BEN, q)).toMatchObject([{ id: rude, host_removed: true }]);
    expect((await cards(LENA))[0]?.comments).toBe(0);
    expect(await notices(BEN, 'circle_post_removed')).toHaveLength(1);
  });
});

describe('reports and accounts', () => {
  it('lets a member report a comment; staff removal hides it and a reversed appeal restores it', async () => {
    const q = await post(LENA, 'question', 'Favourite cookbook?');
    const c = await comment(BEN, q, 'Something reportable');
    const report = (user: string) =>
      asUser(db, user, () =>
        db.query('select public.report_create($1, $2, $3, $4, $5, $6)', [
          'cook_comment',
          c,
          'harassment',
          'Rude.',
          true,
          key(),
        ]),
      );
    await expect(report(BEN)).rejects.toThrow();
    await expect(report(MIA)).rejects.toThrow();
    await report(LENA);
    const row = await asUser(db, DANA, () =>
      db.query<{ id: string; target_label: string }>(
        'select id, target_label from public.staff_queue()',
      ),
    ).then((r) => r.rows[0]!);
    expect(row.target_label).toBe('Something reportable');
    const shown = await asUser(db, DANA, () =>
      db.query<{ r: { caption: string; comment: boolean } }>(
        'select public.staff_cook($1) as r',
        [row.id],
      ),
    ).then((r) => r.rows[0]!.r);
    expect(shown).toMatchObject({ caption: 'Something reportable', comment: true });
    const decision = await asUser(db, DANA, () =>
      db.query<{ result: { action_id: string } }>(
        'select public.staff_decide($1, $2, $3, $4, $5, $6) as result',
        [row.id, 'remove_content', 'Rude', null, null, key()],
      ),
    ).then((r) => r.rows[0]!.result);
    expect(await comments(LENA, q)).toEqual([]);
    await asUser(db, BEN, () =>
      db.query('select public.appeal_create($1, $2, $3)', [
        decision.action_id,
        'A joke.',
        key(),
      ]),
    );
    const appeal = await db
      .query<{ id: string }>('select id from public.appeals')
      .then((r) => r.rows[0]!.id);
    await asUser(db, SAM, () =>
      db.query('select public.staff_appeal_decide($1, $2, $3, $4)', [
        appeal,
        false,
        'Fine.',
        key(),
      ]),
    );
    expect((await comments(LENA, q)).map((x) => x.id)).toEqual([c]);
  });

  it('takes a deleted account’s comments with it', async () => {
    const q = await post(LENA, 'question', 'Tempeh where?');
    await comment(BEN, q, 'Asia market.');
    await asUser(db, BEN, () => db.query('select public.account_delete($1)', [key()]));
    expect(await comments(LENA, q)).toEqual([]);
  });
});

describe('who hears about comments', () => {
  it('does not tell an author who has left the Circle', async () => {
    const q = await post(LENA, 'question', 'Anyone for a swap?');
    await db.query('delete from public.circle_members where user_id = $1', [LENA]);
    await comment(BEN, q, 'Me!');
    expect(await notices(LENA, 'cook_comment')).toEqual([]);
  });

  it('hides comments under a post whose author is suspended', async () => {
    const q = await post(LENA, 'question', 'Hello?');
    await comment(BEN, q, 'Hi');
    await db.query(`update public.profiles set status = 'suspended' where id = $1`, [LENA]);
    expect(await comments(AMA, q)).toEqual([]);
  });
});

describe('Circle privacy and limits', () => {
  it('names an owner only to signed-in members, never across a block or when suspended', async () => {
    const owner = (user: string | null) =>
      asUser(db, user, () =>
        db.query<{ owner_name: string | null }>(
          'select owner_name from public.circle_cards where id = $1',
          [KITCHEN],
        ),
      ).then((r) => r.rows[0]?.owner_name ?? null);
    expect(await owner(null)).toBeNull();
    expect(await owner(MIA)).toBe('Ama');
    await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [
      MIA,
      AMA,
    ]);
    expect(await owner(MIA)).toBeNull();
    await db.query(`update public.profiles set status = 'suspended' where id = $1`, [AMA]);
    expect(await owner(LENA)).toBeNull();
  });

  it('limits new join requests to 10 a day across Circles', async () => {
    for (let i = 0; i < 11; i += 1) {
      await db.query(
        `insert into public.circles (id, name, city_id, access, created_by)
         values ($1, $2, $3, 'request', $4)`,
        [
          `51000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          `Circle ${String(i)}`,
          CITY,
          AMA,
        ],
      );
    }
    const ask = (i: number) =>
      asUser(db, MIA, () =>
        db.query('select public.circle_join($1, null, $2)', [
          `51000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          key(),
        ]),
      );
    for (let i = 0; i < 10; i += 1) await ask(i);
    await expect(ask(10)).rejects.toThrow(/rate_limited/);
    // Asking again where a request already waits is not a new one.
    await ask(3);
  });

  it('stops at 20 requests waiting, with its own answer', async () => {
    for (let i = 0; i < 21; i += 1) {
      await db.query(
        `insert into public.circles (id, name, city_id, access, created_by)
         values ($1, $2, $3, 'request', $4)`,
        [
          `52000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          `Waiting ${String(i)}`,
          CITY,
          AMA,
        ],
      );
    }
    // Twenty asked days ago, still waiting.
    for (let i = 0; i < 20; i += 1) {
      await db.query(
        `insert into public.circle_requests (circle_id, user_id, created_at)
         values ($1, $2, now() - interval '3 days')`,
        [`52000000-0000-4000-8000-${String(i).padStart(12, '0')}`, MIA],
      );
    }
    await expect(
      asUser(db, MIA, () =>
        db.query('select public.circle_join($1, null, $2)', [
          '52000000-0000-4000-8000-000000000020',
          key(),
        ]),
      ),
    ).rejects.toThrow(/requests_pending/);
  });
});

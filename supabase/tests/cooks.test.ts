import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const AMA = '00000000-0000-4000-8000-0000000000c1'; // author, owns the Circle
const LENA = '00000000-0000-4000-8000-0000000000c2'; // same Circle
const MIA = '00000000-0000-4000-8000-0000000000c3'; // outsider
const DANA = '00000000-0000-4000-8000-0000000000c4'; // staff
const SAM = '00000000-0000-4000-8000-0000000000c5'; // staff, second reviewer
const CITY = '30000000-0000-4000-8000-0000000000c9';
const KITCHEN = '50000000-0000-4000-8000-0000000000c1';
const OTHER_CIRCLE = '50000000-0000-4000-8000-0000000000c2';

let db: PGlite;
let counter = 0;
const key = () => `62000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [AMA, 'Ama'],
    [LENA, 'Lena'],
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
    `insert into public.circles (id, name, city_id, access, created_by) values
       ($1, 'Neukölln Plant Kitchen', $3, 'open', $4), ($2, 'Elsewhere', $3, 'open', $5)`,
    [KITCHEN, OTHER_CIRCLE, CITY, AMA, MIA],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values
       ($1, $3, 'owner'), ($1, $4, 'member'), ($2, $5, 'owner')`,
    [KITCHEN, OTHER_CIRCLE, AMA, LENA, MIA],
  );
});

/** What the cook-upload function records after storing a photo. */
const upload = async (user: string, hoursAgo = 0) => {
  const path = `${user}/a0000000-0000-4000-8000-${String((counter += 1)).padStart(12, '0')}.jpg`;
  await db.query(
    `insert into public.cook_uploads (photo_path, user_id, width, height, created_at, stored_at)
     values ($1, $2, 1200, 1500, now() - make_interval(hours => $3), now())`,
    [path, user, hoursAgo],
  );
  return path;
};

const post = async (
  user: string,
  options: {
    circle?: string;
    caption?: string;
    path?: string;
    recipe?: string | null;
    key?: string;
  } = {},
) => {
  const path = options.path ?? (await upload(user));
  return asUser(db, user, () =>
    db.query<{ result: { id: string } }>(
      'select public.cook_create($1, $2, $3, $4, $5, $6) as result',
      [
        options.circle ?? KITCHEN,
        options.recipe ?? null,
        options.caption ?? 'Smoky jollof with plantain',
        path,
        null,
        options.key ?? key(),
      ],
    ),
  ).then((r) => r.rows[0]!.result.id);
};

const feed = (user: string | null) =>
  asUser(db, user, () =>
    db.query<{
      id: string;
      reactions: number;
      reacted: boolean;
      recipe_title: string | null;
      width: number;
    }>(
      'select id, reactions, reacted, recipe_title, width from public.cook_cards order by created_at desc, id desc',
    ),
  ).then((r) => r.rows);

const mine = (user: string) =>
  asUser(db, user, () => db.query<{ id: string }>('select id from public.my_cooks')).then((r) =>
    r.rows.map((row) => row.id),
  );

const react = (user: string, id: string, on: boolean) =>
  asUser(db, user, () =>
    db.query<{ result: { reacted: boolean; reactions: number } }>(
      'select public.cook_react($1, $2) as result',
      [id, on],
    ),
  ).then((r) => r.rows[0]!.result);

const queued = () =>
  db
    .query<{ photo_path: string }>('select photo_path from public.cook_photo_deletions')
    .then((r) => r.rows.map((row) => row.photo_path));

const recipeIn = (user: string, circle: string) =>
  asUser(db, user, () =>
    db.query<{ result: { id: string } }>(
      `select public.recipe_create($1, 'Efo Riro', null, 4, 45, null, '{}', false,
         '[{"name":"Spinach","qty":200,"unit":"g"}]'::jsonb, '["Cook it."]'::jsonb, $2) as result`,
      [circle, key()],
    ),
  ).then((r) => r.rows[0]!.result.id);

const report = (user: string, id: string) =>
  asUser(db, user, () =>
    db.query('select public.report_create($1, $2, $3, $4, $5, $6)', [
      'cook',
      id,
      'harassment',
      'Not food.',
      true,
      key(),
    ]),
  );

describe('sharing what you cooked', () => {
  it('shows a post to its Circle only, with the upload’s size', async () => {
    const id = await post(AMA);
    expect((await feed(AMA)).map((c) => c.id)).toEqual([id]);
    expect((await feed(LENA))[0]).toMatchObject({ id, width: 1200 });
    expect(await feed(MIA)).toEqual([]);
    await expect(feed(null)).rejects.toThrow(/permission denied/);
  });

  it('refuses a Circle you are not in, someone else’s upload, an unknown or old upload, and a bad caption', async () => {
    await expect(post(MIA, { circle: KITCHEN })).rejects.toThrow(/circle_not_found/);
    await expect(post(AMA, { path: await upload(LENA) })).rejects.toThrow(/invalid_input/);
    await expect(
      post(AMA, { path: `${AMA}/b0000000-0000-4000-8000-000000000001.jpg` }),
    ).rejects.toThrow(/invalid_input/);
    await expect(post(AMA, { path: await upload(AMA, 13) })).rejects.toThrow(/invalid_input/);
    await expect(post(AMA, { caption: '   ' })).rejects.toThrow(/invalid_input/);
    await expect(post(AMA, { caption: 'x'.repeat(141) })).rejects.toThrow(/invalid_input/);
  });

  it('uses an upload once', async () => {
    const path = await upload(AMA);
    await post(AMA, { path });
    await expect(post(AMA, { path })).rejects.toThrow(/invalid_input/);
  });

  it('refuses posting into an archived Circle and hides its posts', async () => {
    await post(LENA);
    await db.query(`update public.circles set status = 'archived' where id = $1`, [KITCHEN]);
    expect(await feed(LENA)).toEqual([]);
    await expect(post(AMA)).rejects.toThrow(/circle_not_found/);
  });

  it('replays a retried share, limits members to 10 a day, and deleting gives none back', async () => {
    const k = key();
    const path = await upload(AMA);
    const first = await post(AMA, { key: k, path });
    expect(await post(AMA, { key: k, path })).toBe(first);
    for (let i = 0; i < 9; i += 1) await post(AMA);
    await asUser(db, AMA, () => db.query('select public.cook_delete($1, $2)', [first, key()]));
    await expect(post(AMA)).rejects.toThrow(/rate_limited/);
  });

  it('keeps the tables out of direct reach', async () => {
    await post(AMA);
    for (const table of ['cooks', 'cook_uploads', 'cook_reactions', 'cook_photo_deletions']) {
      await expect(
        asUser(db, LENA, () => db.query(`select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      asUser(db, AMA, () =>
        db.query(
          `insert into public.cook_uploads (photo_path, user_id, width, height)
           values ($1, $2, 1, 1)`,
          [`${AMA}/c0000000-0000-4000-8000-000000000001.jpg`, AMA],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    for (const call of [
      'select public.cook_photo_deletions_claim(10)',
      `select public.cook_upload_reserve('${AMA}', '${AMA}/d0000000-0000-4000-8000-000000000001.jpg', 1, 1)`,
      `select public.cook_upload_stored('${AMA}/d0000000-0000-4000-8000-000000000001.jpg')`,
    ]) {
      await expect(asUser(db, AMA, () => db.query(call))).rejects.toThrow(/permission denied/);
    }
  });

  it('links a recipe from this Circle, never one from another, and shows its title', async () => {
    const elsewhere = await recipeIn(MIA, OTHER_CIRCLE);
    await expect(post(AMA, { recipe: elsewhere })).rejects.toThrow(/invalid_input/);
    const here = await recipeIn(AMA, KITCHEN);
    await post(AMA, { recipe: here });
    expect((await feed(LENA))[0]?.recipe_title).toBe('Efo Riro');
  });
});

describe('Yum', () => {
  it('counts one per member, never the author, and can be taken back', async () => {
    const id = await post(AMA);
    expect(await react(LENA, id, true)).toEqual({ reacted: true, reactions: 1 });
    expect(await react(LENA, id, true)).toEqual({ reacted: true, reactions: 1 });
    await expect(react(AMA, id, true)).rejects.toThrow(/own_post/);
    await expect(react(MIA, id, true)).rejects.toThrow(/not_found/);
    expect((await feed(LENA))[0]).toMatchObject({ reactions: 1, reacted: true });
    expect(await react(LENA, id, false)).toEqual({ reacted: false, reactions: 0 });
  });
});

describe('safety', () => {
  it('hides posts across a block, both ways', async () => {
    await post(AMA);
    await post(LENA);
    await asUser(db, LENA, () => db.query('select public.block_user($1, $2)', [AMA, key()]));
    expect((await feed(LENA)).length).toBe(1);
    expect((await feed(AMA)).length).toBe(1);
  });

  it('hides a paused member’s posts until they are back', async () => {
    await post(AMA);
    await db.query(
      `update public.profiles set status = 'suspended', suspended_until = now() + interval '1 day' where id = $1`,
      [AMA],
    );
    expect(await feed(LENA)).toEqual([]);
  });

  it('stops showing the Circle to someone who left; their posts stay and they can still delete them', async () => {
    const lenas = await post(LENA);
    await post(AMA);
    await db.query('delete from public.circle_members where user_id = $1', [LENA]);
    expect(await feed(LENA)).toEqual([]);
    expect((await feed(AMA)).map((c) => c.id)).toContain(lenas);
    expect(await mine(LENA)).toEqual([lenas]);
    await asUser(db, LENA, () => db.query('select public.cook_delete($1, $2)', [lenas, key()]));
    expect((await feed(AMA)).map((c) => c.id)).not.toContain(lenas);
  });

  it('lets only the author delete, and queues the photo', async () => {
    const path = await upload(AMA);
    const id = await post(AMA, { path });
    await expect(
      asUser(db, LENA, () => db.query('select public.cook_delete($1, $2)', [id, key()])),
    ).rejects.toThrow(/not_found/);
    await asUser(db, AMA, () => db.query('select public.cook_delete($1, $2)', [id, key()]));
    expect(await feed(LENA)).toEqual([]);
    expect(await queued()).toEqual([path]);
  });

  it('removes posts, reactions and uploads when the account is deleted', async () => {
    const path = await upload(AMA);
    const amas = await post(AMA, { path });
    const unused = await upload(AMA);
    const lenas = await post(LENA);
    await react(AMA, lenas, true);
    await asUser(db, AMA, () => db.query('select public.account_delete($1)', [key()]));
    // Ama owned the Circle, so it is archived too; check the rows themselves.
    const rows = await db.query<{ id: string }>('select id from public.cooks');
    expect(rows.rows.map((r) => r.id)).toEqual([lenas]);
    expect(rows.rows.map((r) => r.id)).not.toContain(amas);
    expect((await db.query('select 1 from public.cook_reactions')).rows).toEqual([]);
    expect((await queued()).sort()).toEqual([path, unused].sort());
  });

  it('lets a member report a post; staff removal hides it, keeps it as evidence, and a reversed appeal restores it', async () => {
    const id = await post(AMA);
    await expect(report(AMA, id)).rejects.toThrow();
    await expect(report(MIA, id)).rejects.toThrow();
    await report(LENA, id);
    const row = await asUser(db, DANA, () =>
      db.query<{ id: string; target_label: string }>(
        'select id, target_label from public.staff_queue()',
      ),
    ).then((r) => r.rows[0]!);
    expect(row.target_label).toBe('Smoky jollof with plantain');
    await expect(
      asUser(db, LENA, () => db.query('select public.staff_cook($1)', [row.id])),
    ).rejects.toThrow(/not_staff/);
    const decision = await asUser(db, DANA, () =>
      db.query<{ result: { action_id: string } }>(
        'select public.staff_decide($1, $2, $3, $4, $5, $6) as result',
        [row.id, 'remove_content', 'Not food', null, null, key()],
      ),
    ).then((r) => r.rows[0]!.result);
    expect(await feed(LENA)).toEqual([]);
    expect(await mine(AMA)).toEqual([]);
    await expect(
      asUser(db, AMA, () => db.query('select public.cook_delete($1, $2)', [id, key()])),
    ).rejects.toThrow(/not_found/);
    expect(await queued()).toEqual([]);
    const shown = await asUser(db, DANA, () =>
      db.query<{ result: { caption: string; removed: boolean } }>(
        'select public.staff_cook($1) as result',
        [row.id],
      ),
    );
    expect(shown.rows[0]?.result).toMatchObject({
      caption: 'Smoky jollof with plantain',
      removed: true,
    });
    const audit = await db.query<{ action: string }>(
      `select action from public.audit_events where action = 'staff.view_cook'`,
    );
    expect(audit.rows.length).toBe(1);

    const appeal = await asUser(db, AMA, () =>
      db.query('select public.appeal_create($1, $2, $3)', [
        decision.action_id,
        'It was my dinner.',
        key(),
      ]),
    ).then(() =>
      db.query<{ id: string }>('select id from public.appeals').then((r) => r.rows[0]!.id),
    );
    await asUser(db, SAM, () =>
      db.query('select public.staff_appeal_decide($1, $2, $3, $4)', [
        appeal,
        false,
        'It is food.',
        key(),
      ]),
    );
    expect((await feed(LENA)).map((c) => c.id)).toEqual([id]);
  });

  it('removes a staff-removed post for good after 90 days', async () => {
    const path = await upload(AMA);
    const id = await post(AMA, { path });
    await db.query(
      `update public.cooks set removed_at = now() - interval '91 days' where id = $1`,
      [id],
    );
    await db.query('select public.cooks_cleanup()');
    expect((await db.query('select 1 from public.cooks')).rows).toEqual([]);
    expect(await queued()).toEqual([path]);
  });

  it('queues unused uploads after a day, and the worker claims each once per lease', async () => {
    const old = await upload(AMA, 25);
    await upload(AMA, 1);
    await db.query('select public.cooks_cleanup()');
    expect(await queued()).toEqual([old]);
    const first = await db.query<{ p: string }>(
      'select public.cook_photo_deletions_claim(10) as p',
    );
    expect(first.rows.map((r) => r.p)).toEqual([old]);
    const again = await db.query('select public.cook_photo_deletions_claim(10)');
    expect(again.rows).toEqual([]);
  });

  it('refuses posting and reacting while paused, but allows deleting', async () => {
    const id = await post(AMA);
    const lenas = await post(LENA);
    await db.query(
      `update public.profiles set status = 'suspended', suspended_until = now() + interval '1 day' where id = $1`,
      [AMA],
    );
    await expect(post(AMA)).rejects.toThrow(/suspended/);
    await expect(react(AMA, lenas, true)).rejects.toThrow(/suspended/);
    await asUser(db, AMA, () => db.query('select public.cook_delete($1, $2)', [id, key()]));
  });
});

const readable = (user: string, paths: string[]) =>
  asUser(db, user, () =>
    db.query<{ p: string }>('select public.cook_photos_readable($1) as p', [paths]),
  ).then((r) => r.rows.map((row) => row.p));

describe('uploads and photo access', () => {
  const reserve = (user: string, n: number) =>
    db.query('select public.cook_upload_reserve($1, $2, 1200, 1500)', [
      user,
      `${user}/e0000000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`,
    ]);

  it('reserves up to 30 uploads a day, only in the member’s folder and while active', async () => {
    for (let i = 1; i <= 30; i += 1) await reserve(AMA, i);
    await expect(reserve(AMA, 31)).rejects.toThrow(/rate_limited/);
    await expect(
      db.query('select public.cook_upload_reserve($1, $2, 1, 1)', [
        LENA,
        `${AMA}/e0000000-0000-4000-8000-000000000099.jpg`,
      ]),
    ).rejects.toThrow(/invalid_input/);
    await db.query(
      `update public.profiles set status = 'suspended', suspended_until = now() + interval '1 day' where id = $1`,
      [LENA],
    );
    await expect(reserve(LENA, 1)).rejects.toThrow(/suspended/);
  });

  it('turns only a stored upload into a post, and deleting posts gives no uploads back', async () => {
    const path = `${AMA}/e0000000-0000-4000-8000-000000000001.jpg`;
    await reserve(AMA, 1);
    await expect(post(AMA, { path })).rejects.toThrow(/invalid_input/);
    await db.query('select public.cook_upload_stored($1)', [path]);
    const id = await post(AMA, { path });
    await asUser(db, AMA, () => db.query('select public.cook_delete($1, $2)', [id, key()]));
    for (let i = 2; i <= 30; i += 1) await reserve(AMA, i);
    await expect(reserve(AMA, 31)).rejects.toThrow(/rate_limited/);
  });

  it('refuses to mark stored an upload that is gone, so the function removes the files', async () => {
    await expect(
      db.query('select public.cook_upload_stored($1)', [
        `${AMA}/e0000000-0000-4000-8000-000000000077.jpg`,
      ]),
    ).rejects.toThrow(/invalid_input/);
  });

  it('queues a reservation that was never stored after a day', async () => {
    await reserve(AMA, 1);
    await db.query(`update public.cook_uploads set created_at = now() - interval '25 hours'`);
    await db.query('select public.cooks_cleanup()');
    expect((await queued()).length).toBe(1);
  });

  it('lets members see photos of posts they can see and their own; staff see all', async () => {
    const path = await upload(LENA);
    await post(LENA, { path });
    const thumb = path.replace('.jpg', '.thumb.jpg');
    expect(await readable(AMA, [path, thumb])).toEqual([path, thumb]);
    expect(await readable(MIA, [path, thumb])).toEqual([]);
    expect(await readable(DANA, [path])).toEqual([path]);
    // Lena leaves the Circle: she can still see her own photo, to manage the post.
    await db.query('delete from public.circle_members where user_id = $1', [LENA]);
    expect(await readable(LENA, [path])).toEqual([path]);
    await expect(readable(MIA, ['x'])).resolves.toEqual([]);
  });

  it('replays a retried delete instead of reporting it missing', async () => {
    const id = await post(AMA);
    const k = key();
    const first = await asUser(db, AMA, () =>
      db.query<{ r: unknown }>('select public.cook_delete($1, $2) as r', [id, k]),
    );
    const again = await asUser(db, AMA, () =>
      db.query<{ r: unknown }>('select public.cook_delete($1, $2) as r', [id, k]),
    );
    expect(again.rows[0]?.r).toEqual(first.rows[0]?.r);
  });

  it('tells an outsider taking back a reaction nothing about the post', async () => {
    const id = await post(AMA);
    await react(LENA, id, true);
    expect(await react(MIA, id, false)).toEqual({ reacted: false, reactions: 0 });
  });

  it('keeps a post hidden while another removal still stands after one appeal is reversed', async () => {
    const id = await post(AMA);
    await db.query(
      `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'member')`,
      [KITCHEN, MIA],
    );
    await report(LENA, id);
    await report(MIA, id);
    const cases = await asUser(db, DANA, () =>
      db.query<{ id: string }>('select id from public.staff_queue() order by created_at'),
    ).then((r) => r.rows.map((row) => row.id));
    expect(cases.length).toBe(2);
    const actions: string[] = [];
    for (const reportId of cases) {
      const r = await asUser(db, DANA, () =>
        db.query<{ result: { action_id: string } }>(
          'select public.staff_decide($1, $2, $3, $4, $5, $6) as result',
          [reportId, 'remove_content', 'Not food', null, null, key()],
        ),
      );
      actions.push(r.rows[0]!.result.action_id);
    }
    await asUser(db, AMA, () =>
      db.query('select public.appeal_create($1, $2, $3)', [
        actions[0],
        'It was dinner.',
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
        'Food.',
        key(),
      ]),
    );
    expect(await feed(LENA)).toEqual([]);
  });
});

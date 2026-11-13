import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const HOST = '00000000-0000-4000-8000-0000000000b1';
const MIA = '00000000-0000-4000-8000-0000000000b2';
const BEN = '00000000-0000-4000-8000-0000000000b3';
const CITY = '30000000-0000-4000-8000-0000000000b0';

let db: PGlite;
let plan = '';
let keyCounter = 0;
const key = () => `6b000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(`insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`, [CITY]);
  for (const [id, name] of [[HOST, 'Ama'], [MIA, 'Mia'], [BEN, 'Ben']] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query('insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)', [id, name, CITY]);
  }
  const starts = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const ends = new Date(Date.now() + 8 * 3_600_000).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into public.plans (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens, status)
     values ($1, 'cooking_night', 'in_person', 'West African Cooking Night', '', $2, 'Neukölln', $3, $4, 'Europe/Berlin', 1, 'none', 'published') returning id`,
    [HOST, CITY, starts, ends],
  );
  plan = rows[0]?.id ?? '';
  await db.query(`insert into public.plan_private (plan_id, address, reveal_at) values ($1, 'Weserstraße 1', now() + interval '2 hours')`, [plan]);
});

const mine = (who: string) =>
  asUser(db, who, () => db.query<{ type: string; payload: Record<string, unknown>; read_at: string | null }>('select type, payload, read_at from public.notifications_list(50)')).then((r) => r.rows);
const queue = () => db.query<{ user_id: string; type: string; body: string; email: boolean; send_after: string }>('select user_id, type, body, email, send_after from public.push_queue order by created_at').then((r) => r.rows);

describe('in-app rows and the push queue', () => {
  it('writes the catalog events: joining, a waitlist offer (urgent, with email), a cancelled Plan', async () => {
    await asUser(db, MIA, () => db.query('select public.rsvp_join($1, $2)', [plan, key()]));
    expect(await mine(MIA)).toEqual([expect.objectContaining({ type: 'rsvp_confirmed', payload: expect.objectContaining({ plan: 'West African Cooking Night' }), read_at: null })]);
    await asUser(db, BEN, () => db.query('select public.rsvp_join($1, $2)', [plan, key()]));
    // Mia leaves; Ben is offered the spot.
    await asUser(db, MIA, () => db.query('select public.rsvp_cancel($1, $2)', [plan, key()]));
    const ben = await mine(BEN);
    expect(ben.map((n) => n.type)).toContain('waitlist_offer');
    const q = await queue();
    expect(q.find((x) => x.user_id === BEN && x.type === 'waitlist_offer')).toEqual(expect.objectContaining({ email: true }));
    // The host cancels: every guest hears, with email; the host does not notify themselves.
    await db.query(`update public.plans set status = 'cancelled' where id = $1`, [plan]);
    const cancelled = (await queue()).filter((x) => x.type === 'plan_cancelled');
    expect(cancelled.map((x) => x.user_id).sort()).toEqual([BEN].sort());
    expect(cancelled[0]?.email).toBe(true);
    // Only their own rows are readable, and reading marks them.
    const benRows = await asUser(db, BEN, () => db.query<{ id: string }>('select id from public.notifications'));
    expect(benRows.rows.length).toBeGreaterThan(0);
    const miaSeesBen = await asUser(db, MIA, () => db.query<{ type: string }>(`select type from public.notifications where type = 'waitlist_offer'`));
    expect(miaSeesBen.rows).toHaveLength(0);
    await asUser(db, BEN, () => db.query('select public.notification_mark_read($1)', [benRows.rows[0]?.id]));
    const unread = await asUser(db, BEN, () => db.query<{ n: number }>('select public.notifications_unread_count() as n'));
    expect(unread.rows[0]?.n).toBe(benRows.rows.length - 1);
  });

  it('respects the member’s choices: reminders off, lock-screen text off, quiet hours delay a push, offers do not wait', async () => {
    // Quiet hours that cover 23 of 24 hours around now, whatever the clock says.
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(new Date()));
    await asUser(db, MIA, () => db.query('select public.settings_update($1)', [JSON.stringify({ notif_reminders: false, quiet_hours: true, quiet_start: (hour + 2) % 24, quiet_end: (hour + 1) % 24 })]));
    await asUser(db, MIA, () => db.query('select public.rsvp_join($1, $2)', [plan, key()]));
    // A reminder due now: Mia turned reminders off, so nothing is queued for her.
    await db.query(`update public.plans set starts_at = now() + interval '2 hours', ends_at = now() + interval '4 hours' where id = $1`, [plan]);
    await db.query('select public.notifications_enqueue_due()');
    expect((await queue()).filter((x) => x.type.startsWith('reminder'))).toHaveLength(0);
    // A message in the Plan chat: pushed as "New message" (lock-screen text off) and delayed to the quiet end.
    const chat = await asUser(db, HOST, () => db.query<{ id: string }>('select public.conversation_open($1, $2) as id', ['plan', plan])).then((r) => r.rows[0]?.id ?? '');
    await asUser(db, HOST, () => db.query('select public.message_post($1, $2, $3)', [chat, 'Bring plantains please', key()]));
    const q = (await queue()).filter((x) => x.type === 'new_message');
    expect(q).toEqual([expect.objectContaining({ user_id: MIA, body: 'New message' })]);
    expect(Date.parse(q[0]?.send_after ?? '')).toBeGreaterThan(Date.now() + 60_000);
    // Her own messages never come back to her; a muted chat stays silent.
    await asUser(db, MIA, () => db.query('select public.conversation_mute($1, $2)', [chat, new Date(Date.now() + 3_600_000).toISOString()]));
    await asUser(db, HOST, () => db.query('select public.message_post($1, $2, $3)', [chat, 'Also lentils', key()]));
    expect((await queue()).filter((x) => x.type === 'new_message')).toHaveLength(1);
  });

  it('enqueues the day-before reminder and the address unlock once each, and registers device tokens per member', async () => {
    await asUser(db, MIA, () => db.query('select public.rsvp_join($1, $2)', [plan, key()]));
    await db.query(`update public.plans set starts_at = now() + interval '24 hours', ends_at = now() + interval '27 hours' where id = $1`, [plan]);
    await db.query(`update public.plan_private set reveal_at = now() - interval '5 minutes' where plan_id = $1`, [plan]);
    expect((await db.query<{ n: number }>('select public.notifications_enqueue_due() as n')).rows[0]?.n).toBe(2);
    expect((await db.query<{ n: number }>('select public.notifications_enqueue_due() as n')).rows[0]?.n).toBe(0);
    const types = (await mine(MIA)).map((x) => x.type).sort();
    expect(types).toEqual(['address_unlocked', 'reminder_day_before', 'rsvp_confirmed']);
    // Rescheduled: a new occurrence gets its own reminder; undoing a check-in does not re-confirm.
    await db.query(`update public.plans set starts_at = now() + interval '24 hours 5 minutes', ends_at = now() + interval '27 hours' where id = $1`, [plan]);
    expect((await db.query<{ n: number }>('select public.notifications_enqueue_due() as n')).rows[0]?.n).toBe(1);
    await db.query(`update public.rsvps set state = 'checked_in', checked_in_at = now() where plan_id = $1 and user_id = $2`, [plan, MIA]);
    await db.query(`update public.rsvps set state = 'going', checked_in_at = null where plan_id = $1 and user_id = $2`, [plan, MIA]);
    expect((await mine(MIA)).filter((x) => x.type === 'rsvp_confirmed')).toHaveLength(1);
    const addressPush = (await queue()).find((x) => x.type === 'address_unlocked');
    expect(addressPush?.body).not.toContain('Weserstraße');

    await asUser(db, MIA, () => db.query('select public.push_token_register($1, $2)', ['ExponentPushToken[abcdefghij]', 'ios']));
    await asUser(db, BEN, () => db.query('select public.push_token_register($1, $2)', ['ExponentPushToken[abcdefghij]', 'ios']));
    const owner = await db.query<{ user_id: string }>('select user_id from public.push_tokens');
    expect(owner.rows).toEqual([{ user_id: BEN }]);
    await expect(asUser(db, MIA, () => db.query('select * from public.push_tokens'))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, MIA, () => db.query('select * from public.push_queue'))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, MIA, () => db.query('select public.notifications_enqueue_due()'))).rejects.toThrow(/permission denied/);
  });
});

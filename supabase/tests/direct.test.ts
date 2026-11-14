import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './harness';

const ANA = '00000000-0000-4000-8000-0000000000d5';
const BEN = '00000000-0000-4000-8000-0000000000d6';
const OLU = '00000000-0000-4000-8000-0000000000d7';
const CITY = '30000000-0000-4000-8000-0000000000c9';
const KITCHEN = '50000000-0000-4000-8000-0000000000c9';

let db: PGlite;
let keyCounter = 0;
const newId = () => `68000000-0000-4000-8000-${String((keyCounter += 1)).padStart(12, '0')}`;

beforeEach(async () => {
  db = await createDatabase();
  await db.query(
    `insert into public.cities (id, name, country_code, tz) values ($1, 'Berlin', 'DE', 'Europe/Berlin')`,
    [CITY],
  );
  for (const [id, name] of [
    [ANA, 'Ana'],
    [BEN, 'Ben'],
    [OLU, 'Olu'],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
    await db.query(
      'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
      [id, name, CITY],
    );
  }
  await db.query(
    `insert into public.circles (id, name, city_id, access, created_by) values ($1, 'Kitchen', $2, 'open', $3)`,
    [KITCHEN, CITY, ANA],
  );
  await db.query(
    `insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [KITCHEN, ANA, BEN],
  );
});

const request = (from: string, to: string, text = 'Hi, fancy a soup?') =>
  asUser(db, from, () =>
    db.query<{ result: { status: string; conversation_id?: string } }>(
      'select public.dm_request($1, $2, $3) as result',
      [to, text, newId()],
    ),
  ).then((r) => r.rows[0]?.result);

const pendingFor = (user: string) =>
  asUser(db, user, () =>
    db.query<{ id: string; from_name: string; first_message: string }>(
      'select id, from_name, first_message from public.message_request_cards',
    ),
  ).then((r) => r.rows);

describe('asking to message someone', () => {
  it('lets a person who shares a Circle send a first message request', async () => {
    expect(await request(ANA, BEN)).toEqual({ status: 'pending' });
    const waiting = await pendingFor(BEN);
    expect(waiting).toEqual([
      expect.objectContaining({ from_name: 'Ana', first_message: 'Hi, fancy a soup?' }),
    ]);
  });

  it('refuses someone who shares no Circle, and oneself', async () => {
    await expect(request(ANA, OLU)).rejects.toThrow(/person_not_found/);
    await expect(request(ANA, ANA)).rejects.toThrow(/person_not_found/);
  });

  it('does not let anyone else see the request', async () => {
    await request(ANA, BEN);
    expect(await pendingFor(OLU)).toEqual([]);
  });

  it('allows ten requests a day, and no more', async () => {
    for (let i = 0; i < 11; i += 1) {
      const id = `69000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await db.query('insert into auth.users (id) values ($1)', [id]);
      await db.query(
        'insert into public.profiles (id, display_name, city_id) values ($1, $2, $3)',
        [id, `Stranger ${i}`, CITY],
      );
      await db.query(
        'insert into public.circle_members (circle_id, user_id, role) values ($1, $2, $3)',
        [KITCHEN, id, 'member'],
      );
      if (i < 10) {
        expect(await request(ANA, id)).toEqual({ status: 'pending' });
      } else {
        await expect(request(ANA, id)).rejects.toThrow(/rate_limited/);
      }
    }
  });
});

describe('answering a request', () => {
  it('opens the conversation on accept, with the first message in it', async () => {
    await request(ANA, BEN);
    const [req] = await pendingFor(BEN);
    const accepted = await asUser(db, BEN, () =>
      db.query<{ result: { status: string; conversation_id: string } }>(
        'select public.dm_request_respond($1, true) as result',
        [req?.id],
      ),
    );
    expect(accepted.rows[0]?.result.status).toBe('accepted');
    const conversation = await asUser(db, ANA, () =>
      db.query<{ id: string }>('select public.conversation_open($1, $2) as id', [
        'direct',
        BEN,
      ]),
    );
    const messages = await asUser(db, BEN, () =>
      db.query<{ body: string; sender_name: string }>(
        'select body, sender_name from public.message_cards where conversation_id = $1',
        [conversation.rows[0]?.id],
      ),
    );
    expect(messages.rows).toEqual([{ body: 'Hi, fancy a soup?', sender_name: 'Ana' }]);
  });

  it('declines silently: the sender still sees a pending request, and no conversation opens', async () => {
    await request(ANA, BEN);
    const [req] = await pendingFor(BEN);
    await asUser(db, BEN, () =>
      db.query('select public.dm_request_respond($1, false)', [req?.id]),
    );
    expect(await pendingFor(BEN)).toEqual([]);
    expect(await request(ANA, BEN)).toEqual({ status: 'pending' });
    // The declined text is no longer readable by the person who declined it.
    const kept = await asUser(db, BEN, () =>
      db.query('select id from public.message_requests'),
    );
    expect(kept.rows).toEqual([]);
    await expect(
      asUser(db, ANA, () =>
        db.query('select public.conversation_open($1, $2)', ['direct', BEN]),
      ),
    ).rejects.toThrow(/not_member/);
  });

  it('refuses anyone but the recipient answering', async () => {
    await request(ANA, BEN);
    const [req] = await pendingFor(BEN);
    await expect(
      asUser(db, ANA, () => db.query('select public.dm_request_respond($1, true)', [req?.id])),
    ).rejects.toThrow(/request_not_found/);
  });
});

describe('mute and pin', () => {
  async function openDirect(): Promise<string> {
    await request(ANA, BEN);
    const [req] = await pendingFor(BEN);
    await asUser(db, BEN, () =>
      db.query('select public.dm_request_respond($1, true)', [req?.id]),
    );
    const { rows } = await asUser(db, ANA, () =>
      db.query<{ id: string }>('select public.conversation_open($1, $2) as id', [
        'direct',
        BEN,
      ]),
    );
    return rows[0]?.id ?? '';
  }

  it('lets a member mute and pin their own view of a conversation, not the other person’s', async () => {
    const conversation = await openDirect();
    await asUser(db, ANA, () =>
      db.query("select public.conversation_mute($1, now() + interval '8 hours')", [
        conversation,
      ]),
    );
    await asUser(db, ANA, () =>
      db.query('select public.conversation_pin($1, true)', [conversation]),
    );
    const mine = await asUser(db, ANA, () =>
      db.query<{ muted: boolean; pinned: boolean }>(
        `select muted_until > now() as muted, pinned_at is not null as pinned
         from public.conversation_settings where conversation_id = $1`,
        [conversation],
      ),
    );
    expect(mine.rows[0]).toEqual({ muted: true, pinned: true });
    const theirs = await asUser(db, BEN, () =>
      db.query('select * from public.conversation_settings where conversation_id = $1', [
        conversation,
      ]),
    );
    expect(theirs.rows).toEqual([]);
  });

  it('refuses mute and pin for someone not in the conversation', async () => {
    const conversation = await openDirect();
    await expect(
      asUser(db, OLU, () =>
        db.query('select public.conversation_pin($1, true)', [conversation]),
      ),
    ).rejects.toThrow(/not_member/);
  });
});

describe('reciprocal requests', () => {
  it('accepting the second of two pending requests joins the conversation, instead of failing', async () => {
    await request(ANA, BEN, 'From Ana');
    await request(BEN, ANA, 'From Ben');
    const pendingBen = await pendingFor(BEN);
    const pendingAna = await pendingFor(ANA);
    await asUser(db, BEN, () =>
      db.query('select public.dm_request_respond($1, true)', [pendingBen[0]?.id]),
    );
    const second = await asUser(db, ANA, () =>
      db.query<{ result: { status: string } }>(
        'select public.dm_request_respond($1, true) as result',
        [pendingAna[0]?.id],
      ),
    );
    expect(second.rows[0]?.result.status).toBe('accepted');
    const count = await db.query<{ n: number }>(
      "select count(*)::int as n from public.conversations where kind = 'direct'",
    );
    expect(count.rows[0]?.n).toBe(1);
  });
});

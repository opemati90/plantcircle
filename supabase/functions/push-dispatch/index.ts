// Sends due rows of push_queue through Expo's push API. Rows are claimed under a lease (one run
// per row), marked sent only when every ticket was accepted, and retried up to five attempts;
// tokens Expo reports as gone are dropped. Email rows are left for email-send.
import { createClient } from 'npm:@supabase/supabase-js@2';
import copy from './copy.json' with { type: 'json' };
import { renderPush, type Copy } from './render.ts';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

type QueueRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};
type TokenRow = { token: string; user_id: string };
type SettingsRow = { user_id: string; language: string; lock_screen_text: boolean };
type Ticket = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const claimed = await supabase.rpc('push_queue_claim', { p_limit: BATCH });
  if (claimed.error) return new Response(claimed.error.message, { status: 500 });
  const rows = (claimed.data ?? []) as QueueRow[];
  if (rows.length === 0) return new Response('nothing due');

  const users = [...new Set(rows.map((r) => r.user_id))];
  const tokens = await supabase
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', users);
  if (tokens.error) return new Response(tokens.error.message, { status: 500 });
  const byUser = new Map<string, string[]>();
  for (const t of (tokens.data ?? []) as TokenRow[])
    byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
  // The member's language and lock-screen choice: the text is rendered per member, at send time.
  const settings = await supabase
    .from('user_settings')
    .select('user_id, language, lock_screen_text')
    .in('user_id', users);
  const prefs = new Map<string, SettingsRow>();
  for (const row of (settings.data ?? []) as SettingsRow[]) prefs.set(row.user_id, row);

  const messages: {
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    rowId: string;
  }[] = [];
  const done = new Set<string>();
  for (const row of rows) {
    const to = byUser.get(row.user_id) ?? [];
    // No device: the Inbox row (when there is one) carries the message; nothing to retry.
    if (to.length === 0) done.add(row.id);
    const pref = prefs.get(row.user_id);
    const text = renderPush(
      copy as Copy,
      pref?.language ?? 'en',
      row.type,
      row.data,
      pref?.lock_screen_text ?? false,
      {
        title: row.title,
        body: row.body,
      },
    ) ?? { title: row.title, body: row.body };
    for (const token of to)
      messages.push({
        to: token,
        title: text.title,
        body: text.body,
        data: { ...row.data, type: row.type },
        rowId: row.id,
      });
  }

  const failedRows = new Set<string>();
  const dead: string[] = [];
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(
          chunk.map(({ rowId: _rowId, ...m }) => ({ ...m, sound: null, priority: 'default' })),
        ),
      });
      if (!res.ok) {
        chunk.forEach((m) => failedRows.add(m.rowId));
        continue;
      }
      const json = (await res.json()) as { data?: Ticket[] };
      (json.data ?? []).forEach((ticket, index) => {
        const message = chunk[index]!;
        if (ticket.status === 'ok') {
          sent += 1;
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(message.to);
        } else {
          failedRows.add(message.rowId);
        }
      });
    } catch {
      chunk.forEach((m) => failedRows.add(m.rowId));
    }
  }
  for (const m of messages) if (!failedRows.has(m.rowId)) done.add(m.rowId);

  if (dead.length > 0) await supabase.from('push_tokens').delete().in('token', dead);
  if (done.size > 0)
    await supabase
      .from('push_queue')
      .update({ sent_at: new Date().toISOString() })
      .in('id', [...done]);
  // Failed rows keep their claim for five minutes, then the next run retries them (five attempts).
  return new Response(
    `sent ${sent} messages; ${done.size} rows done, ${failedRows.size} to retry; dropped ${dead.length} tokens`,
  );
});

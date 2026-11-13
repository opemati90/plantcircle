// A shared Plan link, no app needed: first name, email, 18+ → a spot or a place in line, as a
// real member underneath (an unconfirmed auth user + profile, made in one transaction with the
// join), plus a magic-link email that proves the address and opens the app. An email that
// already belongs to a member gets the sign-in link only: nobody joins or cancels for someone
// else. Rate-limited per email and per IP. Also cancels by the token the done page holds.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const fail = (message: string): Response => {
  const known: Record<string, [string, number]> = {
    rate_limited: ['rate_limited', 429],
    token_not_found: ['not_found', 404],
    plan_not_found: ['not_found', 404],
    plan_ended: ['plan_ended', 400],
    host_cannot_join: ['host', 400],
    suspended: ['suspended', 400],
    blocked: ['not_found', 404],
    account_deleted: ['not_found', 404],
    invalid_name: ['invalid_name', 400],
  };
  const [code, status] = known[message] ?? ['server', 500];
  return json({ error: code }, status);
};

type JoinBody = { action?: 'join'; plan_id: string; first_name: string; email: string; age_confirmed: boolean; idempotency_key: string };
type CancelBody = { action: 'cancel'; token: string; idempotency_key: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // The gateway sets the real client address; the forwarded chain is a fallback.
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ?? 'unknown';
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_input' }, 400);
  const input = body as Partial<JoinBody & CancelBody>;
  if (typeof input.idempotency_key !== 'string') return json({ error: 'invalid_input' }, 400);

  const ipCheck = await supabase.rpc('web_rsvp_rate_check', { p_scope: `ip:${ip}` });
  if (ipCheck.error) return fail(ipCheck.error.message);

  if (input.action === 'cancel') {
    if (typeof input.token !== 'string') return json({ error: 'invalid_input' }, 400);
    const cancelled = await supabase.rpc('guest_rsvp_cancel', { p_token: input.token, p_idempotency_key: input.idempotency_key });
    if (cancelled.error) return fail(cancelled.error.message);
    return json({ status: 'cancelled' });
  }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const firstName = typeof input.first_name === 'string' ? input.first_name.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400);
  if (firstName.length < 1 || [...firstName].length > 40) return json({ error: 'invalid_name' }, 400);
  if (input.age_confirmed !== true) return json({ error: 'age_required' }, 400);
  if (typeof input.plan_id !== 'string') return json({ error: 'invalid_input' }, 400);

  const emailCheck = await supabase.rpc('web_rsvp_rate_check', { p_scope: `email:${email}` });
  if (emailCheck.error) return fail(emailCheck.error.message);
  const open = await supabase.rpc('guest_plan_open', { p_plan_id: input.plan_id });
  if (open.error) return fail(open.error.message);
  if (open.data !== true) return json({ error: 'not_found' }, 404);

  const redirect = `${Deno.env.get('APP_WEB_URL') ?? 'https://plantcircle.app'}/p/${input.plan_id}`;
  const sendLink = async (create: boolean) =>
    (await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: create } })).error === null;

  // Someone who already has an account joins from the app: the link gets them there. Nothing is
  // said about whether the email is known, beyond that.
  const lookup = await supabase.rpc('auth_user_id_by_email', { p_email: email });
  if (!lookup.error && typeof lookup.data === 'string') {
    const emailSent = await sendLink(false);
    return json({ status: 'existing', email_sent: emailSent });
  }

  // A new guest: an unconfirmed user (the link confirms it), profile and RSVP in one transaction.
  const created = await supabase.auth.admin.createUser({ email, email_confirm: false, user_metadata: { first_name: firstName } });
  if (created.error) return json({ error: 'server' }, 500);
  const joined = await supabase.rpc('guest_rsvp_join', {
    p_user_id: created.data.user.id,
    p_plan_id: input.plan_id,
    p_first_name: firstName,
    p_email: email,
    p_idempotency_key: input.idempotency_key,
  });
  if (joined.error) {
    await supabase.auth.admin.deleteUser(created.data.user.id).catch(() => undefined);
    return fail(joined.error.message);
  }
  const result = joined.data as { status: string; cancel_token: string; position?: number };
  const emailSent = await sendLink(false);
  return json({ status: result.status, position: result.position ?? null, cancel_token: result.cancel_token, email_sent: emailSent });
});

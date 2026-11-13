-- Web RSVP (C16). A shared Plan link works without the app: first name, email, 18+ → a spot (or a
-- place in line) and a magic-link email. The guest is a real member underneath (an auth user and
-- a profile made by the web-rsvp Edge Function with the service role), so capacity, the waitlist,
-- the host's guest list and check-in all see one kind of guest.
--
-- Decisions:
--  * The Edge Function owns identity (find or create the auth user by email) and calls these
--    functions with the service role; nothing here is callable by anon or authenticated.
--  * A cancel token (random uuid, emailed and shown on the done page) lets the guest cancel
--    without signing in. It is only ever compared, never listed.
--  * Only an email nobody has used before becomes a guest here. An email that already belongs to
--    a member gets a sign-in link instead: nobody can join, or cancel, on another member's behalf.
--  * Attempts are rate-limited per email and per IP (10 in a rolling hour); tokens and attempt
--    rows are cleaned up 30 days after the Plan (docs/10-compliance.md) by web_rsvp_cleanup(),
--    which the cron calls.

create table public.guest_rsvp_tokens (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (user_id, plan_id)
);
alter table public.guest_rsvp_tokens enable row level security;
revoke all on public.guest_rsvp_tokens from anon, authenticated;

create table public.web_rsvp_attempts (
  scope text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (scope, window_start)
);
alter table public.web_rsvp_attempts enable row level security;
revoke all on public.web_rsvp_attempts from anon, authenticated;

-- Ten attempts in a rolling hour per scope ("email:x" and "ip:y"): quarter-hour buckets, the
-- last four summed, so the hour boundary gives nothing away.
create function public.web_rsvp_rate_check(p_scope text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  v_count integer;
begin
  insert into public.web_rsvp_attempts (scope, window_start, count) values (p_scope, v_window, 1)
  on conflict (scope, window_start) do update set count = public.web_rsvp_attempts.count + 1;
  select coalesce(sum(count), 0) into v_count from public.web_rsvp_attempts
  where scope = p_scope and window_start > now() - interval '1 hour';
  if v_count > 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- Whether a Plan can take a guest at all, checked before any account is made.
create function public.guest_plan_open(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.plans where id = p_plan_id and status in ('published', 'changed') and ends_at > now());
$$;

-- The guest's profile, made on first use: their first name, the Plan's city, no interests. The
-- policies are recorded only for a profile made here (the form says what is agreed to).
create function public.guest_profile_ensure(p_user_id uuid, p_first_name text, p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.text_trim(p_first_name);
  v_city uuid;
begin
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  select city_id into v_city from public.plans where id = p_plan_id;
  insert into public.profiles (id, display_name, city_id, goals) values (p_user_id, v_name, v_city, '{}')
  on conflict (id) do nothing;
  if found then
    insert into public.policy_acceptances (user_id, policy, version)
    select p_user_id, v.policy, v.version from public.policy_versions v
    where v.published_at <= now() and v.effective_at <= now()
    on conflict do nothing;
  end if;
end;
$$;

-- Profile and join in one transaction (rsvp_join's rules: a spot, or a place in line), with the
-- cancel token. A failed join leaves no profile behind.
create function public.guest_rsvp_join(p_user_id uuid, p_plan_id uuid, p_first_name text, p_email text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_token uuid;
begin
  if not public.guest_plan_open(p_plan_id) then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  perform public.guest_profile_ensure(p_user_id, p_first_name, p_plan_id);
  -- Act as the guest for the join: auth.uid() reads this setting first.
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_result := public.rsvp_join(p_plan_id, p_idempotency_key);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.guest_rsvp_tokens (user_id, plan_id, email) values (p_user_id, p_plan_id, lower(p_email))
  on conflict (user_id, plan_id) do update set created_at = now()
  returning token into v_token;
  return v_result || jsonb_build_object('cancel_token', v_token);
end;
$$;

-- Cancels by token (the link in the email, or the done page).
create function public.guest_rsvp_cancel(p_token uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.guest_rsvp_tokens%rowtype;
  v_result jsonb;
begin
  select t.* into v_row from public.guest_rsvp_tokens t join public.plans p on p.id = t.plan_id
  where t.token = p_token and p.ends_at > now() - interval '30 days';
  if not found then
    raise exception 'token_not_found' using errcode = 'P0002';
  end if;
  perform set_config('request.jwt.claim.sub', v_row.user_id::text, true);
  v_result := public.rsvp_cancel(v_row.plan_id, p_idempotency_key);
  perform set_config('request.jwt.claim.sub', '', true);
  return v_result;
end;
$$;

-- The guest's state for the done page and the email, by token.
create function public.guest_rsvp_state(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('plan_id', t.plan_id, 'status', r.state, 'email', t.email)
  from public.guest_rsvp_tokens t
  join public.plans p on p.id = t.plan_id and p.ends_at > now() - interval '30 days'
  left join public.rsvps r on r.plan_id = t.plan_id and r.user_id = t.user_id
  where t.token = p_token;
$$;

-- Thirty days after a Plan its guest tokens go; attempt counters go after a day.
create function public.web_rsvp_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.guest_rsvp_tokens t using public.plans p
  where p.id = t.plan_id and p.ends_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  delete from public.web_rsvp_attempts where window_start < now() - interval '1 day';
  return v_count;
end;
$$;
revoke all on function public.web_rsvp_cleanup() from public, anon, authenticated;
revoke all on function public.guest_plan_open(uuid) from public, anon, authenticated;

-- The auth user for an email, for the Edge Function (service role) only.
create function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1;
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;

revoke all on function public.web_rsvp_rate_check(text) from public, anon, authenticated;
revoke all on function public.guest_profile_ensure(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.guest_rsvp_join(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.guest_rsvp_cancel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.guest_rsvp_state(uuid) from public, anon, authenticated;

-- The cron's enqueue also runs the cleanup, so one schedule covers both.
create or replace function public.notifications_enqueue_due_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.web_rsvp_cleanup();
  return public.notifications_enqueue_due();
end;
$$;
revoke all on function public.notifications_enqueue_due_and_cleanup() from public, anon, authenticated;

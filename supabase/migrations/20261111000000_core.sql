-- PlantCircle core schema: profiles, cities, Plans, RSVPs with the waitlist, and
-- contributions ("bring something"). Names and states follow docs/05-data-model.md
-- and docs/07-state-machines.md; the read models keep the app's column names.
--
-- Access model (deny by default):
--   * Every table has RLS enabled and all default grants revoked; only the
--     privileges granted below exist for the `anon` and `authenticated` roles.
--   * Writes that need invariants (capacity, one RSVP per person, claim limits,
--     waitlist order) go through SECURITY DEFINER functions that lock the Plan row.
--   * Public, aggregated read models are owner-rights views so that counts and
--     first initials are visible without exposing the RSVP rows.
--   * A Plan's exact address lives in plan_private and is only readable by the
--     host, or by confirmed guests once reveal_at has passed.
--   * Every state-changing RPC takes `p_idempotency_key` and replays the stored
--     response when the same key is sent again.
--   * Global by default: cities are rows, never constants.
--
-- Known gaps (tracked in README): allergens are free text, not the spec's array;
-- reveal_at <= starts_at is not enforced in SQL yet; Plan creation is not built.

create type public.plan_kind as enum (
  'cooking_night', 'potluck', 'workshop', 'meetup', 'online_class',
  'group_order', 'food_swap', 'volunteering', 'global_table'
);
create type public.plan_status as enum (
  'draft', 'published', 'changed', 'on_hold', 'cancelled', 'completed'
);
-- Where it happens, separate from what it is (kind): an online Plan has a meeting link.
create type public.plan_format as enum ('in_person', 'online');
-- going: holds a spot · waitlisted: in line · offered: a freed spot is held until
-- offer_expires_at · cancelled: left, declined, or the offer ran out ·
-- checked_in: attended · no_show: did not come after the Plan ended.
create type public.rsvp_state as enum (
  'going', 'waitlisted', 'offered', 'cancelled', 'checked_in', 'no_show'
);

-- ------------------------------------------------------------------ cities

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  country_code char(2) not null,
  tz text not null,
  unique (name, country_code)
);

alter table public.cities enable row level security;
revoke all on public.cities from anon, authenticated;
grant select on public.cities to anon, authenticated;
create policy cities_select_all on public.cities for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  -- Chosen by the member; null means "no city yet" (online and worldwide content only).
  city_id uuid references public.cities (id) on delete set null,
  goals text[] not null default '{}' check (cardinality(goals) <= 8),
  is_verified_host boolean not null default false,
  -- 18+ is self-declared at sign-up; server-side clock.
  age_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
-- Column grants: a member can never set is_verified_host or back-date age confirmation.
grant select on public.profiles to authenticated;
grant insert (id, display_name, city_id, goals) on public.profiles to authenticated;
grant update (display_name, city_id, goals) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ------------------------------------------------------- policy acceptances
-- Which policy version a member accepted, and when (sign-up and Terms updates).
create table public.policy_acceptances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  policy text not null check (policy in ('terms', 'community_rules', 'privacy')),
  version text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy, version)
);

alter table public.policy_acceptances enable row level security;
revoke all on public.policy_acceptances from anon, authenticated;
grant select on public.policy_acceptances to authenticated;
-- accepted_at is not insertable: it always comes from the server clock.
grant insert (user_id, policy, version) on public.policy_acceptances to authenticated;

create policy policy_acceptances_select_own on public.policy_acceptances
  for select to authenticated using (user_id = (select auth.uid()));
create policy policy_acceptances_insert_own on public.policy_acceptances
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ------------------------------------------------------- idempotency keys

create table public.idempotency_keys (
  key uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rpc text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.idempotency_keys enable row level security;
revoke all on public.idempotency_keys from anon, authenticated;

-- ------------------------------------------------------------------- plans

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete restrict,
  kind public.plan_kind not null,
  format public.plan_format not null default 'in_person',
  title text not null check (char_length(title) between 3 and 80),
  description text not null check (char_length(description) <= 2000),
  city_id uuid not null references public.cities (id) on delete restrict,
  area_label text not null check (char_length(area_label) between 1 and 60),
  venue_name text check (char_length(venue_name) <= 80),
  area_hint text check (char_length(area_hint) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tz text not null,
  capacity integer not null check (capacity between 1 and 500),
  price_minor integer not null default 0 check (price_minor >= 0),
  currency char(3) not null default 'EUR',
  -- null means "not confirmed by the host"; the UI must never render that as safe.
  allergens text check (char_length(allergens) <= 300),
  image_path text check (image_path ~ '^(/|https://)'),
  image_alt text check (char_length(image_alt) <= 200),
  image_focus text check (image_focus ~ '^[0-9]{1,3}% (center|top|bottom)$'),
  status public.plan_status not null default 'published',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index plans_city_starts_idx on public.plans (city_id, starts_at)
  where status in ('published', 'changed', 'on_hold');
create index plans_host_idx on public.plans (host_id);

alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated;
-- No direct table access for clients: reads go through plan_cards, and creating
-- Plans is not built yet.

create table public.plan_private (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  -- In-person Plans have an address. Only the host and confirmed guests can read this row,
  -- and only from reveal_at.
  address text check (char_length(address) between 1 and 200),
  reveal_at timestamptz not null
);

alter table public.plan_private enable row level security;
revoke all on public.plan_private from anon, authenticated;
grant select on public.plan_private to authenticated;



-- ------------------------------------------------------------------- rsvps

-- Waitlist order. A sequence, not a timestamp: two joins can share a timestamp, and the
-- queue must stay first-come, first-served. Every (re)join takes the next number.
create sequence public.rsvp_queue_seq;

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  state public.rsvp_state not null,
  -- Position in line is queue_seq (first come, first served); a re-join takes a new number.
  created_at timestamptz not null default now(),
  queue_seq bigint not null default nextval('public.rsvp_queue_seq'),
  updated_at timestamptz not null default now(),
  offer_expires_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  unique (plan_id, user_id),
  check ((state = 'offered') = (offer_expires_at is not null)),
  check ((state = 'checked_in') = (checked_in_at is not null))
);

create index rsvps_user_idx on public.rsvps (user_id, state);
create index rsvps_queue_idx on public.rsvps (plan_id, state, queue_seq);

alter table public.rsvps enable row level security;
revoke all on public.rsvps from anon, authenticated;
grant select on public.rsvps to authenticated;

create policy rsvps_select_own on public.rsvps
  for select to authenticated using (user_id = (select auth.uid()));

-- Helper used by policies. SECURITY DEFINER so the policy on plan_private does
-- not depend on the caller's own visibility of rsvps/plans.
create function public.can_see_address(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plans p
    join public.plan_private pp on pp.plan_id = p.id
    where p.id = p_plan_id
      and (
        p.host_id = (select auth.uid())
        or (
          now() >= pp.reveal_at
          and p.status in ('published', 'changed')
          and exists (
            select 1 from public.rsvps r
            where r.plan_id = p.id and r.user_id = (select auth.uid())
              and r.state in ('going', 'checked_in')
          )
        )
      )
  );
$$;

create policy plan_private_select_confirmed on public.plan_private
  for select to authenticated using (public.can_see_address(plan_id));

-- Online Plans: the Google Meet link lives in its own table, so its access rule can be
-- time-based. The host can always see it; a confirmed guest sees it only from 10 minutes
-- before the start. Derived from starts_at, so rescheduling moves the release with it.
create table public.plan_meeting_links (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  meeting_url text not null check (meeting_url ~ '^https://[^[:space:]]+$' and char_length(meeting_url) <= 500)
);

alter table public.plan_meeting_links enable row level security;
revoke all on public.plan_meeting_links from anon, authenticated;
grant select on public.plan_meeting_links to authenticated;

create function public.can_see_meeting_link(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plans p
    where p.id = p_plan_id
      and (
        p.host_id = (select auth.uid())
        or (
          now() >= p.starts_at - interval '15 minutes'
          and p.status in ('published', 'changed')
          and exists (
            select 1 from public.rsvps r
            where r.plan_id = p.id and r.user_id = (select auth.uid())
              and r.state in ('going', 'checked_in')
          )
        )
      )
  );
$$;

create policy plan_meeting_links_select on public.plan_meeting_links
  for select to authenticated using (public.can_see_meeting_link(plan_id));

-- -------------------------------------------------------- contributions

create table public.contribution_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  needed integer not null default 1 check (needed between 1 and 20),
  position integer not null default 0
);

create index contribution_slots_plan_idx on public.contribution_slots (plan_id, position);

alter table public.contribution_slots enable row level security;
revoke all on public.contribution_slots from anon, authenticated;

create table public.contribution_claims (
  slot_id uuid not null references public.contribution_slots (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slot_id, user_id)
);

create index contribution_claims_user_idx on public.contribution_claims (user_id);

alter table public.contribution_claims enable row level security;
revoke all on public.contribution_claims from anon, authenticated;
grant select on public.contribution_claims to authenticated;

create policy contribution_claims_select_own on public.contribution_claims
  for select to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------------------------- read models
-- Owner-rights views (security_invoker = false is deliberate): they publish only
-- non-sensitive columns and aggregates of Plans that are not drafts.

create view public.plan_cards
with (security_invoker = false)
as
select
  p.id,
  p.title,
  p.kind as category,
  p.format,
  p.status,
  p.city_id,
  c.name as city,
  p.area_label as area_name,
  p.venue_name,
  p.area_hint,
  p.starts_at,
  p.ends_at,
  pp.reveal_at,
  p.tz as timezone,
  p.capacity,
  p.price_minor as price_cents,
  p.currency,
  p.description,
  p.allergens,
  p.image_path,
  p.image_alt,
  p.image_focus,
  h.display_name as host_name,
  h.is_verified_host as host_verified,
  (select count(*)::int from public.plans hp
    where hp.host_id = p.host_id and hp.status in ('published', 'changed')) as host_plans_count,
  (select count(*)::int from public.rsvps r
    where r.plan_id = p.id and r.state in ('going', 'checked_in')) as going_count,
  coalesce(
    (select array_agg(upper(left(a.display_name, 1)) order by a.created_at)
     from (
       select g.display_name, r.created_at
       from public.rsvps r
       join public.profiles g on g.id = r.user_id
       where r.plan_id = p.id and r.state in ('going', 'checked_in')
       order by r.created_at
       limit 3
     ) a),
    '{}'
  ) as attendee_initials,
  (select coalesce(sum(greatest(
      s.needed - (select count(*) from public.contribution_claims cc where cc.slot_id = s.id), 0)), 0)::int
    from public.contribution_slots s where s.plan_id = p.id) as open_bring_slots,
  -- People in line (waiting, or holding an offer).
  (select count(*)::int from public.rsvps r
    where r.plan_id = p.id and r.state in ('waitlisted', 'offered')) as waitlist_count,
  -- True when a spot can be taken directly: one is free and nobody is in line.
  (
    (select count(*) from public.rsvps r
      where r.plan_id = p.id and r.state in ('going', 'checked_in', 'offered')) < p.capacity
    and not exists (
      select 1 from public.rsvps r
      where r.plan_id = p.id and r.state in ('waitlisted', 'offered'))
  ) as has_open_spot
from public.plans p
join public.plan_private pp on pp.plan_id = p.id
join public.profiles h on h.id = p.host_id
join public.cities c on c.id = p.city_id
where p.status <> 'draft';

revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to anon, authenticated;

create view public.contribution_slot_cards
with (security_invoker = false)
as
select
  s.id,
  s.plan_id,
  s.label,
  s.needed as quantity,
  s.position,
  (select count(*)::int from public.contribution_claims cc where cc.slot_id = s.id) as claimed_count,
  coalesce(
    (select array_agg(g.display_name order by cc.created_at)
     from public.contribution_claims cc
     join public.profiles g on g.id = cc.user_id
     where cc.slot_id = s.id),
    '{}'
  ) as claimed_by
from public.contribution_slots s
join public.plans p on p.id = s.plan_id
where p.status <> 'draft';

revoke all on public.contribution_slot_cards from anon, authenticated;
grant select on public.contribution_slot_cards to anon, authenticated;

-- The viewer's own RSVPs with their place in line (owner-rights view scoped by auth.uid()).
create view public.my_rsvps
with (security_invoker = false)
as
select
  r.plan_id,
  r.state as status,
  r.offer_expires_at,
  -- Inlined (not waitlist_position()) so no function that takes an arbitrary
  -- user id has to be executable by members.
  case when r.state in ('waitlisted', 'offered') then (
    select count(*)::int from public.rsvps ahead
    where ahead.plan_id = r.plan_id
      and ahead.state in ('waitlisted', 'offered')
      and ahead.queue_seq <= r.queue_seq
  ) end as waitlist_position
from public.rsvps r
where r.user_id = (select auth.uid());

revoke all on public.my_rsvps from anon, authenticated;
grant select on public.my_rsvps to authenticated;

-- ------------------------------------------------------------------ writes
-- Each RPC runs in one transaction, locks the Plan row so concurrent calls are
-- serialised, and records its response under the caller's idempotency key.

-- A key is bound to one request: the RPC name and its target (for example the Plan).
-- Reusing a key for a different request is an error, never a silent replay.
-- The advisory lock serialises retries of one key, including races across Plans.
create function public.idempotent_replay(p_key uuid, p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rpc text;
  v_response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || p_key::text, 0));
  select rpc, response into v_rpc, v_response
  from public.idempotency_keys
  where user_id = v_uid and key = p_key;
  if not found then
    return null;
  end if;
  if v_rpc <> p_fingerprint then
    raise exception 'idempotency_key_reused' using errcode = 'P0001';
  end if;
  return v_response;
end;
$$;

create function public.idempotent_store(p_key uuid, p_rpc text, p_response jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  insert into public.idempotency_keys (key, user_id, rpc, response)
  values (p_key, (select auth.uid()), p_rpc, p_response)
  on conflict (user_id, key) do nothing;
  select p_response;
$$;

-- Caller must hold the Plan's row lock. Brings the waitlist up to date: expires
-- overdue offers, then offers freed spots.
--   * Normally: the first people in line are offered a free spot for 2 hours.
--   * Inside the last 6 hours: everyone in line is offered at once; first to
--     confirm wins. If the Plan fills again, the others go back in line.
create function public.promote_waitlist(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_going integer;
  v_offered integer;
  v_free integer;
begin
  select * into v_plan from public.plans where id = p_plan_id;

  -- A Plan that is on hold keeps its line but cannot offer or confirm spots.
  -- A cancelled or completed Plan releases everyone still waiting.
  if v_plan.status = 'on_hold' then
    update public.rsvps
    set state = 'waitlisted', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and state = 'offered';
  elsif v_plan.status in ('cancelled', 'completed') then
    update public.rsvps
    set state = 'cancelled', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and state in ('waitlisted', 'offered');
  end if;

  if v_plan.status not in ('published', 'changed') or v_plan.starts_at <= now() then
    return;
  end if;

  -- An offer that ran out leaves the line; the member can rejoin at the back.
  update public.rsvps
  set state = 'cancelled', offer_expires_at = null, updated_at = now()
  where plan_id = p_plan_id and state = 'offered' and offer_expires_at <= now();

  select count(*) filter (where state in ('going', 'checked_in')),
         count(*) filter (where state = 'offered')
  into v_going, v_offered
  from public.rsvps where plan_id = p_plan_id;

  if now() >= v_plan.starts_at - interval '6 hours' then
    if v_going < v_plan.capacity then
      update public.rsvps
      set state = 'offered',
          offer_expires_at = least(now() + interval '2 hours', v_plan.starts_at),
          updated_at = now()
      where plan_id = p_plan_id and state = 'waitlisted';
    else
      update public.rsvps
      set state = 'waitlisted', offer_expires_at = null, updated_at = now()
      where plan_id = p_plan_id and state = 'offered';
    end if;
    return;
  end if;

  v_free := v_plan.capacity - v_going - v_offered;
  if v_free > 0 then
    update public.rsvps r
    set state = 'offered', offer_expires_at = now() + interval '2 hours', updated_at = now()
    from (
      select user_id from public.rsvps
      where plan_id = p_plan_id and state = 'waitlisted'
      order by queue_seq
      limit v_free
    ) next_in_line
    where r.plan_id = p_plan_id and r.user_id = next_in_line.user_id;
  end if;
end;
$$;

-- Shared guard for the member-facing RPCs: authenticates, locks the Plan, and
-- returns it. Callers decide which Plan statuses they accept.
create function public.lock_plan_for_member(p_plan_id uuid)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or v_plan.status = 'draft' then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  return v_plan;
end;
$$;

-- A member's place in line (1 = next), counting people who are waiting or hold an offer.
create function public.waitlist_position(p_plan_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.rsvps me
  join public.rsvps ahead
    on ahead.plan_id = me.plan_id
   and ahead.state in ('waitlisted', 'offered')
   and ahead.queue_seq <= me.queue_seq
  where me.plan_id = p_plan_id and me.user_id = p_user_id
    and me.state in ('waitlisted', 'offered');
$$;

-- rsvp_join: takes a free spot if there is one and nobody is in line; otherwise
-- gets the member into line. Joining twice is a no-op.
create function public.rsvp_join(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.rsvp_state;
  v_held integer;
  v_queue integer;
  v_state public.rsvp_state;
  v_replay jsonb;
begin
  v_plan := public.lock_plan_for_member(p_plan_id);
  -- Looked up after the lock so a concurrent duplicate sees the first call's result.
  v_replay := public.idempotent_replay(p_idempotency_key, 'rsvp_join:' || p_plan_id::text);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_plan.status not in ('published', 'changed') then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_plan.ends_at <= now() then
    raise exception 'plan_ended' using errcode = 'P0001';
  end if;
  if v_plan.host_id = v_uid then
    raise exception 'host_cannot_join' using errcode = 'P0001';
  end if;
  perform public.promote_waitlist(p_plan_id);

  select state into v_existing
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;

  if v_existing is null or v_existing in ('cancelled', 'no_show') then
    select count(*) filter (where state in ('going', 'checked_in', 'offered')),
           count(*) filter (where state in ('waitlisted', 'offered'))
    into v_held, v_queue
    from public.rsvps where plan_id = p_plan_id;
    v_state := case
      when v_held < v_plan.capacity and v_queue = 0 then 'going'
      else 'waitlisted'
    end;

    insert into public.rsvps (plan_id, user_id, state)
    values (p_plan_id, v_uid, v_state)
    on conflict (plan_id, user_id)
    do update set state = excluded.state, created_at = now(), updated_at = now(),
                  queue_seq = nextval('public.rsvp_queue_seq'), offer_expires_at = null;
    -- Inside the last 6 hours a newcomer may be offered an open spot straight away.
    perform public.promote_waitlist(p_plan_id);
  end if;

  select state into v_state
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;
  return public.idempotent_store(
    p_idempotency_key,
    'rsvp_join:' || p_plan_id::text,
    jsonb_build_object(
      'status', v_state,
      'position', public.waitlist_position(p_plan_id, v_uid)));
end;
$$;

-- waitlist_respond: accept turns a held offer into a confirmed spot. Outcomes are
-- returned, not raised, so that expiring a stale offer is committed even when this
-- caller was too late:
--   going      – confirmed
--   expired    – the 2 hours ran out (the member has left the line)
--   waitlisted – no spot is open for this member; they keep their place in line
-- Declining ("pass it on") is rsvp_cancel.
create function public.waitlist_respond(
  p_plan_id uuid,
  p_accept boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_before public.rsvp_state;
  v_state public.rsvp_state;
  v_outcome text;
  v_replay jsonb;
begin
  if not p_accept then
    return public.rsvp_cancel(p_plan_id, p_idempotency_key);
  end if;

  v_plan := public.lock_plan_for_member(p_plan_id);
  -- Replay first: a committed confirmation keeps its answer even if the Plan has since changed.
  v_replay := public.idempotent_replay(p_idempotency_key, 'waitlist_respond:' || p_plan_id::text);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_plan.status not in ('published', 'changed') then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  select state into v_before
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;
  perform public.promote_waitlist(p_plan_id);
  select state into v_state
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;

  if v_state = 'going' then
    v_outcome := 'going';
  elsif v_state = 'offered' then
    -- promote_waitlist only leaves an offer standing while a spot is open for it.
    update public.rsvps
    set state = 'going', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and user_id = v_uid;
    perform public.promote_waitlist(p_plan_id);
    v_outcome := 'going';
  elsif v_before = 'offered' and v_state = 'cancelled' then
    v_outcome := 'expired';
  elsif v_state = 'waitlisted' then
    v_outcome := 'waitlisted';
  else
    raise exception 'no_offer' using errcode = 'P0001';
  end if;

  return public.idempotent_store(
    p_idempotency_key, 'waitlist_respond:' || p_plan_id::text, jsonb_build_object('status', v_outcome));
end;
$$;

-- rsvp_cancel: gives up a spot, a place in line, or an offer. Releases anything
-- the member said they'd bring, and passes the spot on.
create function public.rsvp_cancel(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  perform 1 from public.plans where id = p_plan_id for update;
  v_replay := public.idempotent_replay(p_idempotency_key, 'rsvp_cancel:' || p_plan_id::text);
  if v_replay is not null then
    return v_replay;
  end if;

  update public.rsvps
  set state = 'cancelled', offer_expires_at = null, updated_at = now()
  where plan_id = p_plan_id and user_id = v_uid
    and state in ('going', 'waitlisted', 'offered');

  delete from public.contribution_claims cc
  using public.contribution_slots s
  where cc.slot_id = s.id and s.plan_id = p_plan_id and cc.user_id = v_uid;

  perform public.promote_waitlist(p_plan_id);

  return public.idempotent_store(
    p_idempotency_key, 'rsvp_cancel:' || p_plan_id::text, jsonb_build_object('status', 'cancelled'));
end;
$$;

-- slot_claim: only confirmed guests; never more claims than the slot needs.
create function public.slot_claim(p_slot_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.contribution_slots%rowtype;
  v_plan_id uuid;
  v_claimed integer;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select plan_id into v_plan_id from public.contribution_slots where id = p_slot_id;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  -- Same order as rsvp_cancel (Plan first), so a claim cannot slip in after a cancellation.
  perform 1 from public.plans where id = v_plan_id for update;
  select * into v_slot from public.contribution_slots where id = p_slot_id for update;

  v_replay := public.idempotent_replay(p_idempotency_key, 'slot_claim:' || p_slot_id::text);
  if v_replay is not null then
    return v_replay;
  end if;

  if not exists (
    select 1 from public.rsvps
    where plan_id = v_slot.plan_id and user_id = v_uid and state in ('going', 'checked_in')
  ) then
    raise exception 'rsvp_required' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.contribution_claims where slot_id = p_slot_id and user_id = v_uid
  ) then
    select count(*) into v_claimed from public.contribution_claims where slot_id = p_slot_id;
    if v_claimed >= v_slot.needed then
      raise exception 'item_taken' using errcode = 'P0001';
    end if;
    insert into public.contribution_claims (slot_id, user_id) values (p_slot_id, v_uid);
  end if;

  return public.idempotent_store(
    p_idempotency_key, 'slot_claim:' || p_slot_id::text, jsonb_build_object('claimed', true));
end;
$$;

-- For the scheduler (service role only): expire overdue offers and pass them on.
-- Returns how many Plans were processed.
create function public.expire_waitlist_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_count integer := 0;
begin
  for v_plan_id in
    select distinct plan_id from public.rsvps
    where state = 'offered' and offer_expires_at <= now()
  loop
    perform 1 from public.plans where id = v_plan_id for update;
    perform public.promote_waitlist(v_plan_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.idempotent_replay(uuid, text) from public, anon, authenticated;
revoke all on function public.idempotent_store(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.promote_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.lock_plan_for_member(uuid) from public, anon, authenticated;
revoke all on function public.waitlist_position(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_waitlist_offers() from public, anon, authenticated;
revoke all on function public.can_see_address(uuid) from public, anon;
revoke all on function public.can_see_meeting_link(uuid) from public, anon;
grant execute on function public.can_see_meeting_link(uuid) to authenticated;
revoke all on function public.rsvp_join(uuid, uuid) from public, anon;
revoke all on function public.rsvp_cancel(uuid, uuid) from public, anon;
revoke all on function public.waitlist_respond(uuid, boolean, uuid) from public, anon;
revoke all on function public.slot_claim(uuid, uuid) from public, anon;
grant execute on function public.can_see_address(uuid) to authenticated;
grant execute on function public.rsvp_join(uuid, uuid) to authenticated;
grant execute on function public.rsvp_cancel(uuid, uuid) to authenticated;
grant execute on function public.waitlist_respond(uuid, boolean, uuid) to authenticated;
grant execute on function public.slot_claim(uuid, uuid) to authenticated;

-- Safety (C10). Report and block on every person, Plan, post, message and group order; a case
-- receipt for the reporter; staff decisions with a statement of reasons; suspension; appeals;
-- an append-only audit log.
--
-- Decisions:
--  * Blocking hides both people from each other (People, direct messages, message requests) and
--    keeps a blocked person out of the blocker's Plans. It cancels pending requests both ways.
--    It is silent: the blocked person is never told.
--  * Suspension is enforced in one place: a trigger on every table a member writes to refuses the
--    row while the account is paused. Reading stays open, as the Suspended screen promises.
--  * Reports are triaged by category into urgent (1 h), high (24 h) and routine (72 h) SLAs. AI
--    triage is a suggestion only and arrives with the Edge Function; the column is here.
--  * Staff are profiles with role = 'staff', set only by the service role. Every staff decision,
--    appeal decision and view of private messages writes an audit row with a reason.
--  * The reporter sees their own case status, never the outcome's detail; the reported member
--    never sees who reported them.

alter table public.profiles add column status text not null default 'active'
  check (status in ('active', 'suspended', 'deleted'));
alter table public.profiles add column suspended_until timestamptz;
alter table public.profiles add column role text not null default 'member'
  check (role in ('member', 'staff'));
-- A frozen member reads and joins but cannot post messages until this passes.
alter table public.profiles add column messages_frozen_until timestamptz;
-- Members keep their column grants (display_name, city_id, goals, people_visible); status, role and
-- suspended_until change only through staff RPCs.

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'staff');
$$;

-- Whether the member's account is paused right now.
create function public.is_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and status = 'suspended'
      and (suspended_until is null or suspended_until > now()));
$$;

-- ---------------------------------------------------------------------------------------------
-- Blocks

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
create policy blocks_own on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
grant select on public.blocks to authenticated;

-- True when either person has blocked the other.
create function public.blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a));
$$;

create function public.block_user(p_user_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fingerprint text := 'block:' || p_user_id::text;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if p_user_id = v_uid or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  perform set_config('pc.safety_action', 'block', true);
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user_id)
  on conflict do nothing;
  -- Pending contact both ways ends. Declining is silent, so the other side learns nothing.
  delete from public.connections
  where (requester_id = v_uid and addressee_id = p_user_id) or (requester_id = p_user_id and addressee_id = v_uid);
  update public.message_requests set status = 'declined', decided_at = now()
  where status = 'pending'
    and ((from_id = v_uid and to_id = p_user_id) or (from_id = p_user_id and to_id = v_uid));

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('blocked', true));
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.blocks where blocker_id = v_uid and blocked_id = p_user_id;
end;
$$;

-- The people the viewer has blocked, with names, for the Blocked people screen.
create function public.my_blocks()
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

-- Blocked pairs disappear from People.
create or replace function public.people_in_my_circles()
returns table (
  user_id uuid,
  display_name text,
  city text,
  circle_names text[],
  connection text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  shared as (
    select m2.user_id, array_agg(distinct c.name order by c.name) as names
    from public.circle_members m1
    join public.circles c on c.id = m1.circle_id and c.status = 'active'
    join public.circle_members m2 on m2.circle_id = m1.circle_id and m2.user_id <> m1.user_id
    where m1.user_id = (select id from me)
    group by m2.user_id
  )
  select
    p.id,
    p.display_name,
    home.name,
    s.names,
    case
      when out_c.addressee_id is not null and in_c.requester_id is not null then 'connected'
      when out_c.addressee_id is not null then 'requested'
      when in_c.requester_id is not null then 'requested_by_them'
      else 'none'
    end
  from shared s
  join public.profiles p on p.id = s.user_id and p.people_visible
  left join public.cities home on home.id = p.city_id
  left join public.connections out_c
    on out_c.requester_id = (select id from me) and out_c.addressee_id = p.id
  left join public.connections in_c
    on in_c.addressee_id = (select id from me) and in_c.requester_id = p.id
  where not public.blocked_pair((select id from me), p.id)
    and p.status <> 'deleted'
  order by p.display_name;
$$;

-- ---------------------------------------------------------------------------------------------
-- Enforcement. One trigger refuses writes from a paused account; another refuses contact
-- between blocked people. They run inside the RPCs, so every path is covered.

create function public.refuse_when_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Blocking and leaving a Plan stay open to a paused member: safety never waits, and leaving
  -- (with the claims it releases and the place it frees) harms nobody.
  if current_setting('pc.safety_action', true) in ('block', 'leave') then
    return coalesce(new, old);
  end if;
  -- Leaving a Plan stays open to a paused member.
  if tg_table_name = 'rsvps' and tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'state') = 'cancelled' then
      return new;
    end if;
  end if;
  if public.is_suspended((select auth.uid())) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

-- Every table a member writes to, for every kind of write. Staff and the service role are never
-- suspended, so their updates to these tables (decisions, lifting a suspension) pass.
create trigger plans_active before insert or update or delete on public.plans
  for each row execute function public.refuse_when_suspended();
create trigger plan_private_active before insert or update or delete on public.plan_private
  for each row execute function public.refuse_when_suspended();
create trigger rsvps_active before insert or update or delete on public.rsvps
  for each row execute function public.refuse_when_suspended();
create trigger messages_active before insert or update or delete on public.messages
  for each row execute function public.refuse_when_suspended();
create trigger message_requests_active before insert or update or delete on public.message_requests
  for each row execute function public.refuse_when_suspended();
create trigger conversation_settings_active before insert or update or delete on public.conversation_settings
  for each row execute function public.refuse_when_suspended();
create trigger circles_active before insert or update or delete on public.circles
  for each row execute function public.refuse_when_suspended();
create trigger circle_members_active before insert or update or delete on public.circle_members
  for each row execute function public.refuse_when_suspended();
create trigger circle_requests_active before insert or update or delete on public.circle_requests
  for each row execute function public.refuse_when_suspended();
create trigger recipes_active before insert or update or delete on public.recipes
  for each row execute function public.refuse_when_suspended();
create trigger connections_active before insert or update or delete on public.connections
  for each row execute function public.refuse_when_suspended();
create trigger group_orders_active before insert or update or delete on public.group_orders
  for each row execute function public.refuse_when_suspended();
create trigger order_items_active before insert or update or delete on public.order_items
  for each row execute function public.refuse_when_suspended();
create trigger order_interests_active before insert or update or delete on public.order_interests
  for each row execute function public.refuse_when_suspended();
create trigger contribution_slots_active before insert or update or delete on public.contribution_slots
  for each row execute function public.refuse_when_suspended();
create trigger contribution_claims_active before insert or update or delete on public.contribution_claims
  for each row execute function public.refuse_when_suspended();
create trigger plan_feedback_active before insert or update or delete on public.plan_feedback
  for each row execute function public.refuse_when_suspended();
-- A paused member cannot edit their own profile; staff still change its standing.
create function public.refuse_own_profile_when_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and public.is_suspended(new.id)
    and current_setting('pc.safety_action', true) is distinct from 'block' then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.refuse_own_profile_when_suspended() from public, anon, authenticated;
create trigger profiles_active before update on public.profiles
  for each row execute function public.refuse_own_profile_when_suspended();

-- A blocked pair cannot message (direct, or in the other's Plan chat), request, connect, join or
-- show interest in each other's Plans. The blocker is told "blocked"; the blocked person gets the
-- same answer as for something that does not exist for them, so the block is never disclosed.
create function public.refuse_when_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_other uuid;
  v_hidden text;
begin
  if tg_table_name = 'messages' then
    select case
        when c.kind = 'direct' then case when c.user_low = new.sender_id then c.user_high else c.user_low end
        when c.kind = 'plan' then (select host_id from public.plans where id = c.plan_id)
        else null end
    into v_other
    from public.conversations c where c.id = new.conversation_id;
    v_hidden := 'not_member';
  elsif tg_table_name = 'message_requests' then
    v_other := new.to_id;
    v_hidden := 'person_not_found';
  elsif tg_table_name = 'connections' then
    v_other := new.addressee_id;
    v_hidden := 'person_not_found';
  elsif tg_table_name = 'rsvps' then
    -- Only the member's own place: a host promoting the waitlist touches other people's rows.
    -- Leaving is always allowed; only taking or keeping a place is refused.
    if new.user_id <> v_uid or new.state in ('cancelled', 'no_show') then
      return new;
    end if;
    select host_id into v_other from public.plans where id = new.plan_id;
    v_hidden := 'plan_not_found';
  elsif tg_table_name = 'order_interests' then
    -- Lowering an amount or collecting a share is leaving, which is always allowed. An upsert
    -- arrives as an insert, so the row it would replace is read for the comparison.
    if new.user_id <> v_uid or new.quantity = 0
      or (tg_op = 'UPDATE' and new.quantity <= old.quantity)
      or (tg_op = 'INSERT' and new.quantity <= coalesce((select i.quantity from public.order_interests i
            where i.item_id = new.item_id and i.user_id = new.user_id), -1)) then
      return new;
    end if;
    select p.host_id into v_other from public.order_items oi join public.plans p on p.id = oi.plan_id
    where oi.id = new.item_id;
    v_hidden := 'item_not_found';
  end if;
  if v_other is null or v_other = v_uid then
    return new;
  end if;
  if exists (select 1 from public.blocks where blocker_id = v_uid and blocked_id = v_other) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.blocks where blocker_id = v_other and blocked_id = v_uid) then
    raise exception '%', v_hidden using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create trigger messages_not_blocked before insert on public.messages
  for each row execute function public.refuse_when_blocked();
create trigger message_requests_not_blocked before insert on public.message_requests
  for each row execute function public.refuse_when_blocked();
create trigger connections_not_blocked before insert on public.connections
  for each row execute function public.refuse_when_blocked();
create trigger rsvps_not_blocked before insert or update of state on public.rsvps
  for each row execute function public.refuse_when_blocked();
create trigger order_interests_not_blocked before insert or update on public.order_interests
  for each row execute function public.refuse_when_blocked();

-- A first-message request to someone who blocked you reads as "pending", like a declined one:
-- the block is never disclosed. (The trigger still refuses the insert; this answers before it.)
create or replace function public.dm_request_blocked_silently(p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blocks where blocker_id = p_to and blocked_id = (select auth.uid()));
$$;
revoke all on function public.dm_request_blocked_silently(uuid) from public, anon, authenticated;

-- dm_request, with the silent answer above.
create or replace function public.dm_request(p_to uuid, p_first_message text, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_low uuid := least(v_uid, p_to);
  v_high uuid := greatest(v_uid, p_to);
  v_text text := public.text_trim(p_first_message);
  v_conversation uuid;
  v_status text;
  v_today integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if p_to = v_uid or not exists (select 1 from public.profiles where id = p_to)
    or not public.share_active_circle(v_uid, p_to) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  -- Someone who blocked you reads as "pending", like a decline: the block is never disclosed,
  -- not even by an older conversation.
  if public.dm_request_blocked_silently(p_to) then
    return jsonb_build_object('status', 'pending');
  end if;
  select id into v_conversation from public.conversations where kind = 'direct' and user_low = v_low and user_high = v_high;
  if found then
    return jsonb_build_object('status', 'accepted', 'conversation_id', v_conversation);
  end if;
  if char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;

  -- One sender's requests are serialised, so the daily count and the insert see each other.
  perform pg_advisory_xact_lock(hashtext('dm_request:' || v_uid::text));
  select status into v_status from public.message_requests where from_id = v_uid and to_id = p_to;
  if found then
    -- A declined request still reads as pending to the sender: a decline is never disclosed.
    return jsonb_build_object('status', 'pending');
  end if;
  select count(*) into v_today from public.message_requests
  where from_id = v_uid and created_at > now() - interval '24 hours';
  if v_today >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.message_requests (from_id, to_id, first_message) values (v_uid, p_to, v_text);
  return jsonb_build_object('status', 'pending');
end;
$$;

-- rsvp_cancel, marked as leaving.
create or replace function public.rsvp_cancel(p_plan_id uuid, p_idempotency_key uuid)
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

  -- Leaving is a safety action: a paused member may always leave (see refuse_when_suspended).
  perform set_config('pc.safety_action', 'leave', true);
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

-- A frozen member cannot post messages. Freezing is a staff decision short of suspension.
create function public.refuse_when_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles
             where id = (select auth.uid()) and messages_frozen_until is not null and messages_frozen_until > now()) then
    raise exception 'messages_frozen' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_not_frozen before insert on public.messages
  for each row execute function public.refuse_when_frozen();
create trigger message_requests_not_frozen before insert on public.message_requests
  for each row execute function public.refuse_when_frozen();

-- An existing direct chat between a blocked pair is hidden from both, like the rest.
create or replace function public.conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and ((c.kind = 'plan' and public.plan_chat_member(c.plan_id))
        or (c.kind = 'circle' and public.circle_chat_member(c.circle_id))
        or (c.kind = 'direct' and (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid()))
            and not public.blocked_pair(c.user_low, c.user_high))));
$$;

-- ---------------------------------------------------------------------------------------------
-- Reports

create sequence public.report_case_seq start 3100;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  case_ref text unique not null,
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('person', 'plan', 'circle', 'recipe', 'message', 'order')),
  target_id uuid not null,
  category text not null check (category in
    ('harassment', 'threats', 'stalking', 'scam', 'unsafe_place', 'allergen_deception', 'accessibility', 'other')),
  details text not null check (char_length(details) between 1 and 2000),
  accuracy_confirmed boolean not null check (accuracy_confirmed),
  severity text not null check (severity in ('urgent', 'high', 'routine')),
  ai_suggestion jsonb,
  status text not null default 'open'
    check (status in ('open', 'triaged', 'actioned', 'dismissed', 'appealed', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  sla_due_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index reports_queue_idx on public.reports (status, severity, created_at);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

create table public.report_evidence (
  report_id uuid not null references public.reports (id) on delete cascade,
  media_path text not null check (char_length(media_path) between 1 and 300),
  primary key (report_id, media_path)
);
alter table public.report_evidence enable row level security;
revoke all on public.report_evidence from anon, authenticated;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete set null,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in
    ('warn', 'freeze_messages', 'remove_content', 'suspend', 'ban', 'no_action', 'verify_host', 'decline_host')),
  reason text not null check (char_length(reason) between 1 and 1000),
  rule text check (rule is null or char_length(rule) <= 120),
  target_user_id uuid references public.profiles (id) on delete cascade,
  until timestamptz,
  automated boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references public.moderation_actions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'upheld', 'reversed')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.appeals enable row level security;
revoke all on public.appeals from anon, authenticated;

alter table public.audit_events add column actor_role text not null default 'member';
alter table public.audit_events add column target_type text;
alter table public.audit_events add column target_id uuid;
alter table public.audit_events add column reason text;

-- Category → how fast a person looks. Threats and stalking page on-call (the Edge Function reads
-- the queue); the rest join the queue by severity.
create function public.report_severity(p_category text)
returns text
language sql
immutable
as $$
  select case p_category
    when 'threats' then 'urgent'
    when 'stalking' then 'urgent'
    when 'harassment' then 'high'
    when 'scam' then 'high'
    when 'unsafe_place' then 'high'
    when 'allergen_deception' then 'high'
    else 'routine' end;
$$;

-- The target must exist, and must be something the reporter can see: a person who shares a Circle
-- or a chat with them, a published Plan or order, an active Circle, a recipe or message they can read.
create function public.report_target_exists(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    -- A person you could have met: a shared active Circle, a direct conversation or request, or a
    -- Plan one of you hosts and the other is in.
    when 'person' then p_id <> (select auth.uid()) and exists (select 1 from public.profiles where id = p_id) and (
      public.share_active_circle((select auth.uid()), p_id)
      or exists (select 1 from public.conversations c where c.kind = 'direct'
                 and c.user_low = least((select auth.uid()), p_id) and c.user_high = greatest((select auth.uid()), p_id))
      or exists (select 1 from public.message_requests r
                 where (r.from_id = p_id and r.to_id = (select auth.uid())) or (r.from_id = (select auth.uid()) and r.to_id = p_id))
      or exists (select 1 from public.plans p join public.rsvps r on r.plan_id = p.id
                 where (p.host_id = p_id and r.user_id = (select auth.uid())) or (p.host_id = (select auth.uid()) and r.user_id = p_id))
      or exists (select 1 from public.plans p where p.host_id = p_id and p.status <> 'draft'))
    when 'plan' then exists (select 1 from public.plans where id = p_id and status <> 'draft')
    when 'order' then exists (select 1 from public.group_orders o join public.plans p on p.id = o.plan_id
                              where o.plan_id = p_id and p.status <> 'draft')
    when 'circle' then exists (select 1 from public.circle_cards where id = p_id)
    when 'recipe' then exists (select 1 from public.recipe_cards where id = p_id)
    when 'message' then exists (
      select 1 from public.messages m where m.id = p_id and public.conversation_member(m.conversation_id))
    else false end;
$$;

create function public.report_create(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_details text,
  p_accuracy_confirmed boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_details text := public.text_trim(p_details);
  v_fingerprint text := 'report:' || jsonb_build_object('t', p_target_type, 'id', p_target_id,
    'c', p_category, 'd', v_details, 'a', p_accuracy_confirmed)::text;
  v_replay jsonb;
  v_ref text;
  v_severity text;
  v_today integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if coalesce(p_accuracy_confirmed, false) is not true or char_length(v_details) not between 1 and 2000
    or p_category not in ('harassment', 'threats', 'stalking', 'scam', 'unsafe_place', 'allergen_deception', 'accessibility', 'other') then
    raise exception 'invalid_report' using errcode = 'P0001';
  end if;
  if not public.report_target_exists(p_target_type, p_target_id) then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;
  -- One reporter's reports are serialised so the daily count is exact.
  perform pg_advisory_xact_lock(hashtext('report_create:' || v_uid::text));
  select count(*) into v_today from public.reports
  where reporter_id = v_uid and created_at > now() - interval '24 hours';
  if v_today >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_severity := public.report_severity(p_category);
  v_ref := 'PC-' || nextval('public.report_case_seq')::text;
  insert into public.reports (case_ref, reporter_id, target_type, target_id, category, details,
    accuracy_confirmed, severity, sla_due_at)
  values (v_ref, v_uid, p_target_type, p_target_id, p_category, v_details, true, v_severity,
    now() + case v_severity when 'urgent' then interval '1 hour' when 'high' then interval '24 hours' else interval '72 hours' end);

  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('case_ref', v_ref, 'severity', v_severity));
end;
$$;

-- The reporter's own cases: reference, status and when. Never the decision's detail.
create function public.my_reports()
returns table (case_ref text, target_type text, category text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select case_ref, target_type, category, status, created_at
  from public.reports where reporter_id = (select auth.uid())
  order by created_at desc;
$$;

-- ---------------------------------------------------------------------------------------------
-- Suspension and appeal, as the member sees them: the statement of reasons.

create function public.my_suspension()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_action public.moderation_actions%rowtype;
  v_appeal public.appeals%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.is_suspended(v_uid) then
    select * into v_action from public.moderation_actions a
    where a.target_user_id = v_uid and a.action in ('suspend', 'ban')
      and not exists (select 1 from public.appeals ap where ap.action_id = a.id and ap.status = 'reversed')
    order by created_at desc limit 1;
  elsif exists (select 1 from public.profiles where id = v_uid and messages_frozen_until > now()) then
    select * into v_action from public.moderation_actions a
    where a.target_user_id = v_uid and a.action = 'freeze_messages' and a.until > now()
      and not exists (select 1 from public.appeals ap where ap.action_id = a.id and ap.status = 'reversed')
    order by a.until desc limit 1;
  else
    return null;
  end if;
  if v_action.id is null then
    return null;
  end if;
  select * into v_appeal from public.appeals where action_id = v_action.id;
  return jsonb_build_object(
    'action_id', v_action.id,
    'action', v_action.action,
    'reason', v_action.reason,
    'rule', v_action.rule,
    'until', v_action.until,
    'automated', v_action.automated,
    'decided_at', v_action.created_at,
    'appeal_status', v_appeal.status,
    'appeal_at', v_appeal.created_at);
end;
$$;

create function public.appeal_create(p_action_id uuid, p_statement text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_statement text := public.text_trim(p_statement);
  v_fingerprint text := 'appeal:' || p_action_id::text || ':' || v_statement;
  v_replay jsonb;
  v_action public.moderation_actions%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_action from public.moderation_actions where id = p_action_id for update;
  if not found or v_action.target_user_id <> v_uid then
    raise exception 'action_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_statement) not between 1 and 2000 then
    raise exception 'invalid_appeal' using errcode = 'P0001';
  end if;
  -- One appeal per decision.
  if exists (select 1 from public.appeals where action_id = p_action_id) then
    raise exception 'already_appealed' using errcode = 'P0001';
  end if;
  insert into public.appeals (action_id, user_id, statement) values (p_action_id, v_uid, v_statement)
  returning id into v_id;
  if v_action.report_id is not null then
    update public.reports set status = 'appealed' where id = v_action.report_id;
  end if;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Staff. Every call checks the role and writes an audit row.

create function public.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() or public.is_suspended(v_uid) then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- What the case is about, in words, and whose account it points at.
create function public.report_target_user(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'person' then p_id
    when 'plan' then (select host_id from public.plans where id = p_id)
    when 'order' then (select host_id from public.plans where id = p_id)
    when 'circle' then (select created_by from public.circles where id = p_id)
    when 'recipe' then (select author_id from public.recipes where id = p_id)
    when 'message' then (select sender_id from public.messages where id = p_id)
    else null end;
$$;

create function public.report_target_label(p_type text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'person' then (select display_name from public.profiles where id = p_id)
    when 'plan' then (select title from public.plans where id = p_id)
    when 'order' then (select title from public.plans where id = p_id)
    when 'circle' then (select name from public.circles where id = p_id)
    when 'recipe' then (select title from public.recipes where id = p_id)
    -- Never a message body: private messages are read only through staff_view_messages, with a reason.
    when 'message' then null
    else null end;
$$;

-- The queue: open and triaged cases by severity, oldest first within a severity.
create function public.staff_queue()
returns table (
  id uuid, case_ref text, target_type text, target_id uuid, category text, severity text,
  status text, sla_due_at timestamptz, created_at timestamptz, target_label text, target_user_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select r.id, r.case_ref, r.target_type, r.target_id, r.category, r.severity, r.status, r.sla_due_at, r.created_at,
    public.report_target_label(r.target_type, r.target_id),
    public.report_target_user(r.target_type, r.target_id)
  from public.reports r
  where r.status in ('open', 'triaged', 'appealed')
  order by case r.severity when 'urgent' then 0 when 'high' then 1 else 2 end, r.created_at;
end;
$$;

-- One case in full, with the history relevant to it (earlier reports and actions on the same
-- account) and its appeal, if any. The reporter's identity is not returned.
create function public.staff_case(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_target_user uuid;
begin
  perform public.require_staff();
  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  v_target_user := public.report_target_user(v_report.target_type, v_report.target_id);
  return jsonb_build_object(
    'id', v_report.id,
    'case_ref', v_report.case_ref,
    'target_type', v_report.target_type,
    'target_id', v_report.target_id,
    'target_label', public.report_target_label(v_report.target_type, v_report.target_id),
    'target_user_id', v_target_user,
    'target_user_name', (select display_name from public.profiles where id = v_target_user),
    'category', v_report.category,
    'details', v_report.details,
    'severity', v_report.severity,
    'status', v_report.status,
    'sla_due_at', v_report.sla_due_at,
    'created_at', v_report.created_at,
    'ai_suggestion', v_report.ai_suggestion,
    'evidence_count', (select count(*) from public.report_evidence where report_id = v_report.id),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('when', x.at, 'what', x.what) order by x.at desc)
      from (
        select r2.created_at as at, 'Reported: ' || r2.category || ' (' || r2.status || ')' as what
        from public.reports r2
        where r2.id <> v_report.id and v_target_user is not null
          and public.report_target_user(r2.target_type, r2.target_id) = v_target_user
        union all
        select a.created_at, a.action || ': ' || a.reason
        from public.moderation_actions a where a.target_user_id = v_target_user and v_target_user is not null
      ) x), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'reason', a.reason, 'until', a.until,
        'created_at', a.created_at) order by a.created_at)
      from public.moderation_actions a where a.report_id = v_report.id), '[]'::jsonb),
    'appeal', (
      select jsonb_build_object('id', ap.id, 'action_id', ap.action_id, 'statement', ap.statement,
        'status', ap.status, 'created_at', ap.created_at, 'decided_by', ap.decided_by,
        'original_actor', a.actor_id, 'original_reason', a.reason, 'original_action', a.action)
      from public.appeals ap join public.moderation_actions a on a.id = ap.action_id
      where a.report_id = v_report.id order by ap.created_at desc limit 1));
end;
$$;

-- Private messages only through this, with a reason, and every view logged.
create function public.staff_view_messages(p_report_id uuid, p_reason text)
returns setof public.message_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_report public.reports%rowtype;
  v_conversation uuid;
begin
  v_uid := public.require_staff();
  if char_length(public.text_trim(p_reason)) < 1 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into v_report from public.reports where id = p_report_id;
  if not found or v_report.target_type <> 'message' then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  select conversation_id into v_conversation from public.messages where id = v_report.target_id;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, reason, detail)
  values (v_uid, 'staff', 'staff.view_messages', 'report', p_report_id, public.text_trim(p_reason),
    jsonb_build_object('conversation_id', v_conversation));
  return query
  select m.id, m.conversation_id, m.sender_id, p.display_name, m.body, m.created_at
  from public.messages m join public.profiles p on p.id = m.sender_id
  where m.conversation_id = v_conversation
  order by m.created_at desc limit 50;
end;
$$;

-- The decision: an action with a reason (and the rule), applied to the reported member, logged.
create function public.staff_decide(
  p_report_id uuid,
  p_action text,
  p_reason text,
  p_rule text,
  p_until timestamptz,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_report public.reports%rowtype;
  v_target_user uuid;
  v_reason text := public.text_trim(p_reason);
  v_fingerprint text := 'staff_decide:' || jsonb_build_object('r', p_report_id, 'a', p_action, 'reason', p_reason,
    'rule', p_rule, 'until', p_until)::text;
  v_replay jsonb;
  v_action_id uuid;
begin
  v_uid := public.require_staff();
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_report.status in ('actioned', 'dismissed', 'closed') then
    raise exception 'report_closed' using errcode = 'P0001';
  end if;
  if p_action not in ('warn', 'freeze_messages', 'remove_content', 'suspend', 'ban', 'no_action')
    or char_length(v_reason) not between 1 and 1000 then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_action = 'suspend' and (p_until is null or p_until <= now()) then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  v_target_user := public.report_target_user(v_report.target_type, v_report.target_id);
  if p_action <> 'no_action' and v_target_user is null then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  -- Staff never decide a case about their own account, not even to dismiss it.
  if v_target_user = v_uid then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_action = 'freeze_messages' and (p_until is null or p_until <= now()) then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_action = 'remove_content' and v_report.target_type = 'person' then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  insert into public.moderation_actions (report_id, actor_id, action, reason, rule, target_user_id, until)
  values (p_report_id, v_uid, p_action, v_reason, nullif(public.text_trim(p_rule), ''), v_target_user,
    case when p_action in ('suspend', 'freeze_messages') then p_until else null end)
  returning id into v_action_id;

  if v_target_user is not null then
    perform public.apply_standing(v_target_user);
  end if;
  if p_action = 'remove_content' then
    if v_report.target_type in ('plan', 'order') then
      update public.plans set status = 'cancelled' where id = v_report.target_id;
      update public.group_orders set state = 'cancelled' where plan_id = v_report.target_id;
    elsif v_report.target_type = 'circle' then
      update public.circles set status = 'archived' where id = v_report.target_id;
    elsif v_report.target_type = 'recipe' then
      delete from public.recipes where id = v_report.target_id;
    elsif v_report.target_type = 'message' then
      delete from public.messages where id = v_report.target_id;
    end if;
  end if;

  update public.reports set status = case when p_action = 'no_action' then 'dismissed' else 'actioned' end,
    assigned_to = v_uid where id = p_report_id;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, subject_id, reason, detail)
  values (v_uid, 'staff', 'staff.' || p_action, 'report', p_report_id, v_target_user, v_reason,
    jsonb_build_object('rule', p_rule, 'until', p_until, 'action_id', v_action_id));

  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('action_id', v_action_id, 'status', (select status from public.reports where id = p_report_id)));
end;
$$;

-- The account's standing, from every decision that still stands (not reversed on appeal): a ban
-- pauses for good, the latest unexpired suspension pauses until its end, the latest unexpired
-- freeze stops messages. Called after every decision and every appeal outcome.
create function public.apply_standing(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_banned boolean;
  v_suspended_until timestamptz;
  v_frozen_until timestamptz;
begin
  select
    bool_or(a.action = 'ban'),
    max(a.until) filter (where a.action = 'suspend' and a.until > now()),
    max(a.until) filter (where a.action = 'freeze_messages' and a.until > now())
  into v_banned, v_suspended_until, v_frozen_until
  from public.moderation_actions a
  where a.target_user_id = p_user_id
    and not exists (select 1 from public.appeals ap where ap.action_id = a.id and ap.status = 'reversed');
  update public.profiles
  set status = case when coalesce(v_banned, false) or v_suspended_until is not null then 'suspended' else 'active' end,
      suspended_until = case when coalesce(v_banned, false) then null else v_suspended_until end,
      messages_frozen_until = v_frozen_until
  where id = p_user_id and status <> 'deleted';
end;
$$;
revoke all on function public.apply_standing(uuid) from public, anon, authenticated;

-- A second person decides an appeal: never the one who made the original decision.
create function public.staff_appeal_decide(p_appeal_id uuid, p_uphold boolean, p_reason text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_appeal public.appeals%rowtype;
  v_action public.moderation_actions%rowtype;
  v_reason text := public.text_trim(p_reason);
  v_fingerprint text := 'staff_appeal:' || jsonb_build_object('a', p_appeal_id, 'u', p_uphold, 'reason', p_reason)::text;
  v_replay jsonb;
begin
  v_uid := public.require_staff();
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_appeal from public.appeals where id = p_appeal_id for update;
  if not found then
    raise exception 'appeal_not_found' using errcode = 'P0002';
  end if;
  if v_appeal.status <> 'open' then
    raise exception 'appeal_closed' using errcode = 'P0001';
  end if;
  if char_length(v_reason) not between 1 and 1000 then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  select * into v_action from public.moderation_actions where id = v_appeal.action_id;
  if v_action.actor_id = v_uid or v_appeal.user_id = v_uid then
    raise exception 'same_reviewer' using errcode = 'P0001';
  end if;

  update public.appeals set status = case when p_uphold then 'upheld' else 'reversed' end,
    decided_by = v_uid, decided_reason = v_reason, decided_at = now() where id = p_appeal_id;
  -- Reversing lifts only what this decision imposed; every other standing decision still counts.
  if v_action.target_user_id is not null then
    perform public.apply_standing(v_action.target_user_id);
  end if;
  if v_action.report_id is not null then
    update public.reports set status = 'closed' where id = v_action.report_id;
  end if;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, subject_id, reason)
  values (v_uid, 'staff', case when p_uphold then 'staff.appeal_upheld' else 'staff.appeal_reversed' end,
    'appeal', p_appeal_id, v_action.target_user_id, v_reason);
  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('status', case when p_uphold then 'upheld' else 'reversed' end));
end;
$$;

-- Read-only audit trail for staff, newest first.
create function public.staff_audit(p_limit integer)
returns table (id uuid, actor_id uuid, actor_name text, actor_role text, action text, target_type text,
  target_id uuid, reason text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select a.id, a.actor_id, p.display_name, a.actor_role, a.action, a.target_type, a.target_id, a.reason, a.created_at
  from public.audit_events a left join public.profiles p on p.id = a.actor_id
  order by a.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Appeals waiting for a second reviewer.
create function public.staff_appeals()
returns table (id uuid, case_ref text, action text, original_actor_id uuid, original_actor_name text,
  original_reason text, statement text, member_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select ap.id, r.case_ref, a.action, a.actor_id, sp.display_name, a.reason, ap.statement, mp.display_name, ap.created_at
  from public.appeals ap
  join public.moderation_actions a on a.id = ap.action_id
  left join public.reports r on r.id = a.report_id
  left join public.profiles sp on sp.id = a.actor_id
  left join public.profiles mp on mp.id = ap.user_id
  where ap.status = 'open'
  order by ap.created_at;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke all on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;
revoke all on function public.blocked_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.report_severity(text) from public, anon, authenticated;
revoke all on function public.report_target_exists(text, uuid) from public, anon, authenticated;
revoke all on function public.report_target_user(text, uuid) from public, anon, authenticated;
revoke all on function public.report_target_label(text, uuid) from public, anon, authenticated;
revoke all on function public.require_staff() from public, anon, authenticated;
revoke all on function public.refuse_when_suspended() from public, anon, authenticated;
revoke all on function public.refuse_when_blocked() from public, anon, authenticated;
revoke all on function public.refuse_when_frozen() from public, anon, authenticated;
revoke all on function public.block_user(uuid, uuid) from public, anon;
grant execute on function public.block_user(uuid, uuid) to authenticated;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;
revoke all on function public.report_create(text, uuid, text, text, boolean, uuid) from public, anon;
grant execute on function public.report_create(text, uuid, text, text, boolean, uuid) to authenticated;
revoke all on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;
revoke all on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;
revoke all on function public.appeal_create(uuid, text, uuid) from public, anon;
grant execute on function public.appeal_create(uuid, text, uuid) to authenticated;
revoke all on function public.staff_queue() from public, anon;
grant execute on function public.staff_queue() to authenticated;
revoke all on function public.staff_case(uuid) from public, anon;
grant execute on function public.staff_case(uuid) to authenticated;
revoke all on function public.staff_view_messages(uuid, text) from public, anon;
grant execute on function public.staff_view_messages(uuid, text) to authenticated;
revoke all on function public.staff_decide(uuid, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.staff_decide(uuid, text, text, text, timestamptz, uuid) to authenticated;
revoke all on function public.staff_appeal_decide(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.staff_appeal_decide(uuid, boolean, text, uuid) to authenticated;
revoke all on function public.staff_audit(integer) from public, anon;
grant execute on function public.staff_audit(integer) to authenticated;
revoke all on function public.staff_appeals() from public, anon;
grant execute on function public.staff_appeals() to authenticated;

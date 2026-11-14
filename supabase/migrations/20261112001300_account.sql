-- Account (C11). Privacy choices (consent, off by default), notification settings, a copy of
-- your data on request, and a two-step delete that releases what others are waiting for.
--
-- Decisions:
--  * Consent is off by default and every change is an event, so the record shows what was on when.
--  * "Changes and cancellations" cannot be turned off: a cancelled Plan must reach everyone.
--  * Delete anonymises at once (name, city, goals), releases RSVPs and waitlist places, cancels
--    hosted Plans that have not happened, leaves Circles and archives the ones it owned. Messages
--    stay under "Deleted member". Reports and blocks are kept where the law requires. The auth
--    user is purged by the service role within 30 days (data_requests records the request).
--  * The export is a request: the service role emails a link within 48 hours (data_requests).

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  analytics_consent boolean not null default false,
  personalisation_consent boolean not null default false,
  consent_decided_at timestamptz,
  notif_reminders boolean not null default true,
  notif_waitlist boolean not null default true,
  notif_direct boolean not null default true,
  notif_chats boolean not null default true,
  quiet_hours boolean not null default true,
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23),
  lock_screen_text boolean not null default false,
  notif_prompt_dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;

create table public.consent_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('analytics', 'personalisation')),
  value boolean not null,
  created_at timestamptz not null default now()
);
alter table public.consent_events enable row level security;
revoke all on public.consent_events from anon, authenticated;

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'requested' check (status in ('requested', 'done')),
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index data_requests_open_idx on public.data_requests (user_id, kind) where status = 'requested';
alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon, authenticated;

-- The member's settings, created with the defaults on first read.
create function public.settings_get()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.user_settings%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  insert into public.user_settings (user_id) values (v_uid) on conflict do nothing;
  select * into v_row from public.user_settings where user_id = v_uid;
  return jsonb_build_object(
    'analytics_consent', v_row.analytics_consent,
    'personalisation_consent', v_row.personalisation_consent,
    'consent_decided_at', v_row.consent_decided_at,
    'notif_reminders', v_row.notif_reminders,
    'notif_waitlist', v_row.notif_waitlist,
    'notif_direct', v_row.notif_direct,
    'notif_chats', v_row.notif_chats,
    'quiet_hours', v_row.quiet_hours,
    'quiet_start', v_row.quiet_start,
    'quiet_end', v_row.quiet_end,
    'lock_screen_text', v_row.lock_screen_text,
    'notif_prompt_dismissed_at', v_row.notif_prompt_dismissed_at,
    'language', v_row.language,
    'export_requested_at', (select max(created_at) from public.data_requests
                            where user_id = v_uid and kind = 'export' and status = 'requested'));
end;
$$;

-- A partial update: only the keys given change. Consent changes are recorded as events.
create function public.settings_update(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.user_settings%rowtype;
  v_bool boolean;
  v_key text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  perform public.settings_get();
  select * into v_old from public.user_settings where user_id = v_uid for update;

  -- Only known keys, and JSON booleans and integers (no text that happens to cast).
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key in ('analytics_consent', 'personalisation_consent', 'notif_reminders', 'notif_waitlist',
                 'notif_direct', 'notif_chats', 'quiet_hours', 'lock_screen_text', 'notif_prompt_dismissed') then
      if jsonb_typeof(p_patch -> v_key) <> 'boolean' then
        raise exception 'invalid_settings' using errcode = 'P0001';
      end if;
    elsif v_key in ('quiet_start', 'quiet_end') then
      if jsonb_typeof(p_patch -> v_key) <> 'number' or (p_patch ->> v_key) !~ '^[0-9]+$' then
        raise exception 'invalid_settings' using errcode = 'P0001';
      end if;
    elsif v_key = 'language' then
      if jsonb_typeof(p_patch -> v_key) <> 'string'
         or (p_patch ->> v_key) not in ('en', 'de', 'es', 'pt', 'fr', 'pl', 'it', 'nl') then
        raise exception 'invalid_settings' using errcode = 'P0001';
      end if;
    else
      raise exception 'invalid_settings' using errcode = 'P0001';
    end if;
  end loop;

  if p_patch ? 'analytics_consent' then
    v_bool := (p_patch ->> 'analytics_consent')::boolean;
    if v_bool is distinct from v_old.analytics_consent or v_old.consent_decided_at is null then
      insert into public.consent_events (user_id, kind, value) values (v_uid, 'analytics', v_bool);
    end if;
  end if;
  if p_patch ? 'personalisation_consent' then
    v_bool := (p_patch ->> 'personalisation_consent')::boolean;
    if v_bool is distinct from v_old.personalisation_consent or v_old.consent_decided_at is null then
      insert into public.consent_events (user_id, kind, value) values (v_uid, 'personalisation', v_bool);
    end if;
  end if;

  update public.user_settings set
    analytics_consent = coalesce((p_patch ->> 'analytics_consent')::boolean, analytics_consent),
    personalisation_consent = coalesce((p_patch ->> 'personalisation_consent')::boolean, personalisation_consent),
    consent_decided_at = case when p_patch ? 'analytics_consent' or p_patch ? 'personalisation_consent'
                              then now() else consent_decided_at end,
    notif_reminders = coalesce((p_patch ->> 'notif_reminders')::boolean, notif_reminders),
    notif_waitlist = coalesce((p_patch ->> 'notif_waitlist')::boolean, notif_waitlist),
    notif_direct = coalesce((p_patch ->> 'notif_direct')::boolean, notif_direct),
    notif_chats = coalesce((p_patch ->> 'notif_chats')::boolean, notif_chats),
    quiet_hours = coalesce((p_patch ->> 'quiet_hours')::boolean, quiet_hours),
    quiet_start = coalesce((p_patch ->> 'quiet_start')::smallint, quiet_start),
    quiet_end = coalesce((p_patch ->> 'quiet_end')::smallint, quiet_end),
    lock_screen_text = coalesce((p_patch ->> 'lock_screen_text')::boolean, lock_screen_text),
    language = coalesce(p_patch ->> 'language', language),
    notif_prompt_dismissed_at = case when (p_patch ->> 'notif_prompt_dismissed')::boolean then now()
                                     else notif_prompt_dismissed_at end,
    updated_at = now()
  where user_id = v_uid;
  return public.settings_get();
end;
$$;

-- A copy of your data: one open request at a time; a repeat answers with the open one.
create function public.data_export_request(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fingerprint text := 'data_export';
  v_replay jsonb;
  v_at timestamptz;
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
  perform pg_advisory_xact_lock(hashtext('data_export:' || v_uid::text));
  select created_at into v_at from public.data_requests
  where user_id = v_uid and kind = 'export' and status = 'requested' order by created_at desc limit 1;
  if v_at is null then
    insert into public.data_requests (user_id, kind) values (v_uid, 'export') returning created_at into v_at;
  end if;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('requested_at', v_at));
end;
$$;

-- Delete for good. Anonymises now, releases what others wait for, records the purge.
create function public.account_delete(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fingerprint text := 'account_delete';
  v_replay jsonb;
  v_plan uuid;
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
  -- Leaving everything is a safety action: a paused member may delete their account too.
  perform set_config('pc.safety_action', 'leave', true);

  -- Spots and places in line go back to people waiting. The Plan row is locked first, as every
  -- RSVP change does, so promotion sees a settled count.
  -- Only Plans still ahead: a past check-in is history and stays.
  for v_plan in
    select distinct r.plan_id from public.rsvps r join public.plans p on p.id = r.plan_id
    where r.user_id = v_uid and r.state in ('going', 'waitlisted', 'offered', 'checked_in') and p.ends_at > now()
    order by r.plan_id
  loop
    perform 1 from public.plans where id = v_plan for update;
    update public.rsvps set state = 'cancelled', offer_expires_at = null, checked_in_at = null, updated_at = now()
    where plan_id = v_plan and user_id = v_uid and state in ('going', 'waitlisted', 'offered', 'checked_in');
    delete from public.contribution_claims cc using public.contribution_slots s
    where cc.slot_id = s.id and s.plan_id = v_plan and cc.user_id = v_uid;
    perform public.promote_waitlist(v_plan);
  end loop;
  -- Plans you host that have not happened (held ones too) are cancelled and every guest released.
  -- Orders lock their row before the Plan, as order_mark_collected does, so the two cannot deadlock.
  for v_plan in
    select id from public.plans where host_id = v_uid and status in ('published', 'changed', 'on_hold') and ends_at > now()
    order by id
  loop
    perform 1 from public.group_orders where plan_id = v_plan for update;
    perform 1 from public.plans where id = v_plan for update;
    update public.group_orders set state = 'cancelled' where plan_id = v_plan;
    update public.plans set status = 'cancelled' where id = v_plan;
    update public.rsvps set state = 'cancelled', offer_expires_at = null, checked_in_at = null, updated_at = now()
    where plan_id = v_plan and state in ('going', 'waitlisted', 'offered', 'checked_in');
    delete from public.contribution_claims cc using public.contribution_slots s
    where cc.slot_id = s.id and s.plan_id = v_plan;
  end loop;
  -- Interest in orders, contact, Circles.
  delete from public.order_interests where user_id = v_uid;
  delete from public.connections where requester_id = v_uid or addressee_id = v_uid;
  delete from public.message_requests where from_id = v_uid or to_id = v_uid;
  delete from public.conversation_settings where user_id = v_uid;
  delete from public.circle_members where user_id = v_uid;
  delete from public.circle_requests where user_id = v_uid;
  update public.circles set status = 'archived' where created_by = v_uid and status = 'active';
  delete from public.user_settings where user_id = v_uid;

  -- The purge (service role, within 30 days) scrubs the auth identity (email, phone, providers)
  -- and keeps the profile stub: content it authored still needs an owner, and the foreign keys
  -- on hosted Plans and owned Circles are restrictive on purpose. Recorded before the status
  -- changes, since the stub can write nothing afterwards.
  insert into public.data_requests (user_id, kind, purge_after) values (v_uid, 'delete', now() + interval '30 days');

  -- The profile stays as an anonymous stub so authored content keeps a sender.
  update public.profiles
  set display_name = 'Deleted member', city_id = null, goals = '{}', people_visible = false,
      status = 'deleted', role = 'member', suspended_until = null, messages_frozen_until = null
  where id = v_uid;

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('deleted', true));
end;
$$;

-- A deleted account cannot come back through the same profile.
create or replace function public.refuse_when_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'deleted') then
    raise exception 'account_deleted' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.refuse_when_deleted() from public, anon, authenticated;
create trigger plans_not_deleted before insert or update or delete on public.plans
  for each row execute function public.refuse_when_deleted();
create trigger plan_private_not_deleted before insert or update or delete on public.plan_private
  for each row execute function public.refuse_when_deleted();
create trigger rsvps_not_deleted before insert or update or delete on public.rsvps
  for each row execute function public.refuse_when_deleted();
create trigger messages_not_deleted before insert or update or delete on public.messages
  for each row execute function public.refuse_when_deleted();
create trigger message_requests_not_deleted before insert or update or delete on public.message_requests
  for each row execute function public.refuse_when_deleted();
create trigger conversation_settings_not_deleted before insert or update or delete on public.conversation_settings
  for each row execute function public.refuse_when_deleted();
create trigger circles_not_deleted before insert or update or delete on public.circles
  for each row execute function public.refuse_when_deleted();
create trigger circle_members_not_deleted before insert or update or delete on public.circle_members
  for each row execute function public.refuse_when_deleted();
create trigger circle_requests_not_deleted before insert or update or delete on public.circle_requests
  for each row execute function public.refuse_when_deleted();
create trigger recipes_not_deleted before insert or update or delete on public.recipes
  for each row execute function public.refuse_when_deleted();
create trigger connections_not_deleted before insert or update or delete on public.connections
  for each row execute function public.refuse_when_deleted();
create trigger group_orders_not_deleted before insert or update or delete on public.group_orders
  for each row execute function public.refuse_when_deleted();
create trigger order_items_not_deleted before insert or update or delete on public.order_items
  for each row execute function public.refuse_when_deleted();
create trigger order_interests_not_deleted before insert or update or delete on public.order_interests
  for each row execute function public.refuse_when_deleted();
create trigger contribution_slots_not_deleted before insert or update or delete on public.contribution_slots
  for each row execute function public.refuse_when_deleted();
create trigger contribution_claims_not_deleted before insert or update or delete on public.contribution_claims
  for each row execute function public.refuse_when_deleted();
create trigger plan_feedback_not_deleted before insert or update or delete on public.plan_feedback
  for each row execute function public.refuse_when_deleted();
create trigger user_settings_not_deleted before insert or update or delete on public.user_settings
  for each row execute function public.refuse_when_deleted();
create trigger blocks_not_deleted before insert or update or delete on public.blocks
  for each row execute function public.refuse_when_deleted();
create trigger reports_not_deleted before insert on public.reports
  for each row execute function public.refuse_when_deleted();
create trigger appeals_not_deleted before insert or update on public.appeals
  for each row execute function public.refuse_when_deleted();
create trigger policy_acceptances_not_deleted before insert on public.policy_acceptances
  for each row execute function public.refuse_when_deleted();
create trigger data_requests_not_deleted before insert on public.data_requests
  for each row execute function public.refuse_when_deleted();
-- The stub's own profile row is frozen too (account_delete itself runs before status changes).
create function public.refuse_own_profile_when_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and old.status = 'deleted' then
    raise exception 'account_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.refuse_own_profile_when_deleted() from public, anon, authenticated;
create trigger profiles_not_deleted before update on public.profiles
  for each row execute function public.refuse_own_profile_when_deleted();

-- Staff standing ends with the account.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'staff' and status = 'active');
$$;

-- A direct chat with a deleted member closes for both, like a blocked one.
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
            and not public.blocked_pair(c.user_low, c.user_high)
            and not exists (select 1 from public.profiles d where d.id in (c.user_low, c.user_high) and d.status = 'deleted'))));
$$;

-- Reports about the app itself (accessibility problems) need no other target.
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('person', 'plan', 'circle', 'recipe', 'message', 'order', 'app'));
create or replace function public.report_target_exists(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    -- The app itself (an accessibility problem, say): always reportable by a member.
    when 'app' then (select auth.uid()) is not null
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

-- Leaving (delete) passes the own-profile guard like blocking does.
create or replace function public.refuse_own_profile_when_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and public.is_suspended(new.id)
    and coalesce(current_setting('pc.safety_action', true), '') not in ('block', 'leave') then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.settings_get() from public, anon;
grant execute on function public.settings_get() to authenticated;
revoke all on function public.settings_update(jsonb) from public, anon;
grant execute on function public.settings_update(jsonb) to authenticated;
revoke all on function public.data_export_request(uuid) from public, anon;
grant execute on function public.data_export_request(uuid) to authenticated;
revoke all on function public.account_delete(uuid) from public, anon;
grant execute on function public.account_delete(uuid) to authenticated;

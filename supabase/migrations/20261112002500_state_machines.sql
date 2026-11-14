-- Closing the state-machine gaps found against docs/07, docs/08, docs/12 and the test matrix in
-- docs/14 (gap analysis 2026-11-14 §2–§3):
--   T-08  a suspended host's upcoming Plans go on hold (join paused, address withheld, guests told
--         when they will hear) and come back when the suspension is lifted;
--   T-17  an offer that ran out tells the member, also once the Plan has started;
--   push/email are separate channels on the queue, so email-only rows are never pushed and the
--   dispatcher drops an offer push that would arrive after the offer expired;
--   waitlist offers respect quiet hours (email goes at once; the push waits for quiet end);
--   a Plan completes on its own two hours after it ends; feedback is given once;
--   Circles: a member can leave, a declined request waits 30 days, decisions are audited.
--
-- core.sql's can_see_address / can_see_meeting_link were edited in place (no deployment yet):
-- on_hold withholds the address; the meeting link opens 15 minutes before the start.

-- ---------------------------------------------------------------- hold for a suspended host

alter table public.plans add column hold_reason text
  check (hold_reason is null or hold_reason in ('host_suspended', 'staff'));

create or replace function public.apply_standing(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_banned boolean;
  v_suspended_until timestamptz;
  v_frozen_until timestamptz;
  v_suspended boolean;
begin
  select
    bool_or(a.action = 'ban'),
    max(a.until) filter (where a.action = 'suspend' and a.until > now()),
    max(a.until) filter (where a.action = 'freeze_messages' and a.until > now())
  into v_banned, v_suspended_until, v_frozen_until
  from public.moderation_actions a
  where a.target_user_id = p_user_id
    and not exists (select 1 from public.appeals ap where ap.action_id = a.id and ap.status = 'reversed');
  v_suspended := coalesce(v_banned, false) or v_suspended_until is not null;
  update public.profiles
  set status = case when v_suspended then 'suspended' else 'active' end,
      suspended_until = case when coalesce(v_banned, false) then null else v_suspended_until end,
      messages_frozen_until = v_frozen_until
  where id = p_user_id and status <> 'deleted';

  -- Their upcoming Plans pause with them (T-08) and resume when the suspension is lifted.
  if v_suspended then
    update public.plans set status = 'on_hold', hold_reason = 'host_suspended'
    where host_id = p_user_id and status in ('published', 'changed') and starts_at > now();
  else
    update public.plans set status = 'published', hold_reason = null
    where host_id = p_user_id and status = 'on_hold' and hold_reason = 'host_suspended' and starts_at > now();
  end if;
end;
$$;

-- The hold notice says when guests will hear: the end of the suspension, else the day before.
create or replace function public.plans_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest record;
  v_type text;
  v_body text;
  v_until timestamptz;
  v_time text;
begin
  if new.status not in ('changed', 'cancelled', 'on_hold')
     or (new.status = old.status and not (new.status = 'changed' and new.starts_at <> old.starts_at)) then
    return new;
  end if;
  v_type := case new.status when 'changed' then 'plan_changed' when 'cancelled' then 'plan_cancelled' else 'plan_on_hold' end;
  if new.status = 'on_hold' then
    select least(coalesce(p.suspended_until, new.starts_at - interval '24 hours'), new.starts_at - interval '24 hours')
      into v_until from public.profiles p where p.id = new.host_id;
    v_time := public.plan_time_label(coalesce(v_until, new.starts_at - interval '24 hours'), new.tz);
  else
    v_time := public.plan_time_label(new.starts_at, new.tz);
  end if;
  v_body := case new.status
    when 'changed' then 'New time: ' || v_time || '. Still going?'
    when 'cancelled' then 'This Plan was cancelled.'
    else 'This Plan is on hold. We’ll update you by ' || v_time || '.' end;
  for v_guest in
    select r.user_id from public.rsvps r
    where r.plan_id = new.id and r.state in ('going', 'waitlisted', 'offered', 'checked_in') and r.user_id <> new.host_id
  loop
    perform public.notify(v_guest.user_id, v_type,
      jsonb_build_object('plan_id', new.id, 'plan', new.title, 'time', v_time),
      true, true, new.status <> 'on_hold', new.title, v_body, v_body, false);
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------- push and email channels

alter table public.push_queue add column push boolean not null default true;
create index push_queue_push_due_idx on public.push_queue (send_after) where sent_at is null and push;

-- Only rows meant for a device are claimed; email rows wait for email-send.
create or replace function public.push_queue_claim(p_limit integer)
returns setof public.push_queue
language sql
security definer
set search_path = ''
as $$
  update public.push_queue q set claimed_at = now(), attempts = q.attempts + 1
  where q.id in (
    select id from public.push_queue
    where sent_at is null and push and send_after <= now() and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by send_after limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked)
  returning q.*;
$$;

create or replace function public.notify(
  p_user_id uuid,
  p_type text,
  p_payload jsonb,
  p_in_app boolean,
  p_push boolean,
  p_email boolean,
  p_title text,
  p_body text,
  p_generic text,
  p_urgent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_settings public.user_settings%rowtype;
  v_send_after timestamptz := now();
  v_tz text;
  v_local time;
  v_wanted boolean := true;
begin
  -- A notification is never worth failing the write that caused it.
  begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found or v_profile.status = 'deleted' then
    return;
  end if;
  select * into v_settings from public.user_settings where user_id = p_user_id;
  if not found then
    v_settings.notif_reminders := true; v_settings.notif_waitlist := true; v_settings.notif_direct := true;
    v_settings.notif_chats := true; v_settings.quiet_hours := true; v_settings.quiet_start := 22;
    v_settings.quiet_end := 8; v_settings.lock_screen_text := false;
  end if;

  if p_in_app then
    insert into public.notifications (user_id, type, payload) values (p_user_id, p_type, p_payload);
  end if;

  v_wanted := case p_type
    when 'reminder_day_before' then v_settings.notif_reminders
    when 'reminder_2h' then v_settings.notif_reminders
    when 'weekly_digest' then v_settings.notif_reminders
    when 'waitlist_offer' then v_settings.notif_waitlist
    when 'waitlist_expired' then v_settings.notif_waitlist
    when 'new_message' then true
    else true end;
  if p_type = 'new_message' then
    v_wanted := case when (p_payload ->> 'kind') = 'direct' then v_settings.notif_direct else v_settings.notif_chats end;
  end if;

  if p_push and v_wanted then
    -- Quiet hours, in the member's city time (UTC without a city), unless urgent.
    if v_settings.quiet_hours and not p_urgent then
      select c.tz into v_tz from public.cities c where c.id = v_profile.city_id;
      v_tz := coalesce(v_tz, 'UTC');
      v_local := (now() at time zone v_tz)::time;
      if (v_settings.quiet_start > v_settings.quiet_end
            and (v_local >= make_time(v_settings.quiet_start, 0, 0) or v_local < make_time(v_settings.quiet_end, 0, 0)))
         or (v_settings.quiet_start <= v_settings.quiet_end
            and v_local >= make_time(v_settings.quiet_start, 0, 0) and v_local < make_time(v_settings.quiet_end, 0, 0)) then
        v_send_after := case
          when v_local < make_time(v_settings.quiet_end, 0, 0)
            then ((now() at time zone v_tz)::date + make_time(v_settings.quiet_end, 0, 0)) at time zone v_tz
          else (((now() at time zone v_tz)::date + 1) + make_time(v_settings.quiet_end, 0, 0)) at time zone v_tz end;
      end if;
    end if;
    insert into public.push_queue (user_id, type, title, body, data, email, push, send_after)
    values (p_user_id, p_type, p_title,
      case when p_type = 'new_message' and not v_settings.lock_screen_text then p_generic else p_body end,
      p_payload, false, true, v_send_after);
  end if;
  if p_email then
    -- Email goes at once, whatever the quiet hours: it waits in the inbox, it does not wake anyone.
    insert into public.push_queue (user_id, type, title, body, data, email, push, send_after)
    values (p_user_id, p_type, p_title, p_body, p_payload, true, false, now());
  end if;
  exception when others then
    raise warning 'notify % for % failed: %', p_type, p_user_id, sqlerrm;
  end;
end;
$$;

-- Offers: email at once, push quiet-hours aware (the dispatcher drops it once the offer ran out).
create or replace function public.rsvps_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
begin
  if tg_op = 'UPDATE' and new.state = old.state then
    return new;
  end if;
  select * into v_plan from public.plans where id = new.plan_id;
  if new.state = 'going' and (tg_op = 'INSERT' or old.state in ('cancelled', 'waitlisted', 'offered')) then
    perform public.notify(new.user_id, 'rsvp_confirmed',
      jsonb_build_object('plan_id', new.plan_id, 'plan', v_plan.title),
      true, false, false, v_plan.title, '', '', false);
  elsif new.state = 'offered' then
    perform public.notify(new.user_id, 'waitlist_offer',
      jsonb_build_object('plan_id', new.plan_id, 'plan', v_plan.title, 'expires_at', new.offer_expires_at),
      true, true, true, v_plan.title, 'A spot opened — confirm within 2 hours', 'A spot opened — confirm within 2 hours', false);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- waitlist expiry (T-17)

create or replace function public.promote_waitlist(p_plan_id uuid)
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
  v_expired record;
begin
  select * into v_plan from public.plans where id = p_plan_id;

  if v_plan.status = 'on_hold' then
    update public.rsvps
    set state = 'waitlisted', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and state = 'offered';
  elsif v_plan.status in ('cancelled', 'completed') then
    update public.rsvps
    set state = 'cancelled', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and state in ('waitlisted', 'offered');
  end if;

  -- An offer that ran out leaves the line and the member hears, whatever the Plan's state now.
  for v_expired in
    select user_id from public.rsvps
    where plan_id = p_plan_id and state = 'offered' and offer_expires_at <= now()
  loop
    update public.rsvps
    set state = 'cancelled', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and user_id = v_expired.user_id;
    perform public.notify(v_expired.user_id, 'waitlist_expired',
      jsonb_build_object('plan_id', p_plan_id, 'plan', v_plan.title),
      true, true, false, v_plan.title, 'Your spot offer ran out. You can rejoin the waitlist.',
      'Your spot offer ran out. You can rejoin the waitlist.', false);
  end loop;

  if v_plan.status not in ('published', 'changed') or v_plan.starts_at <= now() then
    return;
  end if;

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

-- ---------------------------------------------------------------- completion on its own

-- Two hours after a Plan ends it is complete: those who came and were not checked in are
-- no-shows, those still in line are released (docs/07).
create function public.plans_complete_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_count integer := 0;
begin
  for v_plan in
    select id from public.plans
    where status in ('published', 'changed') and ends_at + interval '2 hours' <= now()
    for update skip locked
  loop
    update public.plans set status = 'completed' where id = v_plan.id;
    update public.rsvps set state = 'no_show', updated_at = now()
    where plan_id = v_plan.id and state = 'going';
    update public.rsvps set state = 'cancelled', offer_expires_at = null, updated_at = now()
    where plan_id = v_plan.id and state in ('waitlisted', 'offered');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.plans_complete_due() from public, anon, authenticated;

create or replace function public.notifications_enqueue_due_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.plans_complete_due();
  perform public.web_rsvp_cleanup();
  perform public.host_featured_refresh_all();
  perform public.weekly_digest_enqueue();
  return public.notifications_enqueue_due();
end;
$$;

-- ---------------------------------------------------------------- Circles

-- A member leaves (owners hand over first: the last owner cannot leave).
create function public.circle_leave(p_circle_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_replay jsonb;
  v_fingerprint text := 'circle_leave:' || p_circle_id::text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform 1 from public.circles where id = p_circle_id for update;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  v_role := public.circle_role(p_circle_id);
  if v_role is null then
    return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('status', 'none'));
  end if;
  if v_role = 'owner' and not exists (
      select 1 from public.circle_members m where m.circle_id = p_circle_id and m.role = 'owner' and m.user_id <> v_uid) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  perform set_config('pc.safety_action', 'leave', true);
  delete from public.circle_members where circle_id = p_circle_id and user_id = v_uid;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('status', 'none'));
end;
$$;
revoke all on function public.circle_leave(uuid, uuid) from public, anon;
grant execute on function public.circle_leave(uuid, uuid) to authenticated;

-- A declined request waits 30 days before the same person can ask again (docs/07).
create or replace function public.circle_join(p_circle_id uuid, p_answer text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_circle public.circles%rowtype;
  v_status text;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  select * into v_circle from public.circles where id = p_circle_id and status = 'active'
  for update;
  if not found or v_circle.access = 'invite' then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, 'circle_join:' || p_circle_id::text);
  if v_replay is not null then
    return v_replay;
  end if;

  if public.circle_role(p_circle_id) is not null then
    v_status := 'member';
  elsif v_circle.access = 'open' then
    insert into public.circle_members (circle_id, user_id, role) values (p_circle_id, v_uid, 'member');
    v_status := 'member';
  else
    if exists (select 1 from public.circle_requests r
               where r.circle_id = p_circle_id and r.user_id = v_uid and r.status = 'declined'
                 and r.decided_at > now() - interval '30 days') then
      raise exception 'request_cooldown' using errcode = 'P0001';
    end if;
    insert into public.circle_requests (circle_id, user_id, answer)
    values (p_circle_id, v_uid, p_answer)
    on conflict (circle_id, user_id) where status = 'pending' do nothing;
    v_status := 'requested';
  end if;

  return public.idempotent_store(
    p_idempotency_key, 'circle_join:' || p_circle_id::text, jsonb_build_object('status', v_status));
end;
$$;

-- Approving or declining is a decision about someone else: it is audited (docs/07).
create or replace function public.circle_request_respond(
  p_request_id uuid,
  p_approve boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_circle_id uuid;
  v_request public.circle_requests%rowtype;
  v_replay jsonb;
  v_fingerprint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select circle_id into v_circle_id from public.circle_requests where id = p_request_id;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.circles where id = v_circle_id for update;
  select * into v_request from public.circle_requests where id = p_request_id for update;

  v_fingerprint := 'circle_request_respond:' || p_request_id::text || ':' || p_approve::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if coalesce(public.circle_role(v_request.circle_id), 'none') not in ('moderator', 'owner') then
    raise exception 'not_moderator' using errcode = '42501';
  end if;

  update public.circle_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_by = v_uid, decided_at = now()
  where id = p_request_id;
  if p_approve then
    insert into public.circle_members (circle_id, user_id, role)
    values (v_request.circle_id, v_request.user_id, 'member')
    on conflict (circle_id, user_id) do nothing;
  end if;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, subject_id)
  values (v_uid, public.circle_role(v_request.circle_id),
    case when p_approve then 'circle.request_approved' else 'circle.request_declined' end,
    'circle', v_request.circle_id, v_request.user_id);

  return public.idempotent_store(
    p_idempotency_key,
    v_fingerprint,
    jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end));
end;
$$;

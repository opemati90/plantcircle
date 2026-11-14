-- Notifications (C14). In-app rows the Inbox shows under Updates, a push queue the dispatcher
-- sends through Expo, device tokens, and the triggers that write them from the events that
-- matter (docs/12-notifications-analytics.md). Reminders come from a function the cron calls.
--
-- Decisions:
--  * Every notification goes through notify(): it checks the member's settings (reminders,
--    waitlist offers, direct messages, chats), quiet hours (push waits until they end, except
--    waitlist offers and safety), and the lock-screen choice (a message push says "New message"
--    unless the member turned message text on). Addresses never appear in push text.
--  * Changes and cancellations cannot be turned off. Deleted accounts get nothing.
--  * The push queue holds what to send; the push-dispatch Edge Function sends it and drops tokens
--    Expo reports as gone. Email rows are flagged for email-send (later).
--  * Reminders and address unlocks are written by notifications_enqueue_due(), called by the
--    cron-reminders function every 15 minutes; a marks table keeps them to one per event.

create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 40),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.notifications to authenticated;

create table public.push_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  email boolean not null default false,
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  claimed_at timestamptz
);
create index push_queue_due_idx on public.push_queue (send_after) where sent_at is null;
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- One reminder, one unlock, one closing notice per event and person.
create table public.notification_marks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The kind plus the occurrence (a rescheduled Plan is a new occurrence), e.g. reminder_2h:1763040000.
  type text not null,
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, type, ref_id)
);
alter table public.notification_marks enable row level security;
revoke all on public.notification_marks from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The one way in. p_in_app writes an Inbox row; p_push queues a push (title/body are the
-- member-facing text; p_generic the lock-screen-safe body); p_email flags it for email.

create function public.notify(
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
    -- Defaults, as settings_get would create them.
    v_settings.notif_reminders := true; v_settings.notif_waitlist := true; v_settings.notif_direct := true;
    v_settings.notif_chats := true; v_settings.quiet_hours := true; v_settings.quiet_start := 22;
    v_settings.quiet_end := 8; v_settings.lock_screen_text := false;
  end if;

  if p_in_app then
    insert into public.notifications (user_id, type, payload) values (p_user_id, p_type, p_payload);
  end if;

  -- The member's choices per kind. Changes, cancellations and safety cannot be turned off.
  v_wanted := case p_type
    when 'reminder_day_before' then v_settings.notif_reminders
    when 'reminder_2h' then v_settings.notif_reminders
    when 'weekly_digest' then v_settings.notif_reminders
    when 'waitlist_offer' then v_settings.notif_waitlist
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
    insert into public.push_queue (user_id, type, title, body, data, email, send_after)
    values (p_user_id, p_type, p_title,
      case when p_type = 'new_message' and not v_settings.lock_screen_text then p_generic else p_body end,
      p_payload, p_email, v_send_after);
  elsif p_email then
    insert into public.push_queue (user_id, type, title, body, data, email, send_after)
    values (p_user_id, p_type, p_title, p_body, p_payload, true, now());
  end if;
  exception when others then
    raise warning 'notify % for % failed: %', p_type, p_user_id, sqlerrm;
  end;
end;
$$;
revoke all on function public.notify(uuid, text, jsonb, boolean, boolean, boolean, text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Member-facing reads and writes

create function public.notifications_list(p_limit integer)
returns setof public.notifications
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.notifications where user_id = (select auth.uid())
  order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create function public.notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications where user_id = (select auth.uid()) and read_at is null;
$$;

create function public.notification_mark_read(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = coalesce(read_at, now())
  where id = p_id and user_id = (select auth.uid());
$$;

create function public.notifications_mark_all_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null;
$$;

create function public.push_token_register(p_token text, p_platform text)
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
  if not exists (select 1 from public.profiles where id = v_uid and status <> 'deleted') then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  -- A device that changes hands moves to its new member.
  insert into public.push_tokens (token, user_id, platform) values (p_token, v_uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.push_token_remove(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Triggers: the events the catalog names

create function public.plan_time_label(p_starts_at timestamptz, p_tz text)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_starts_at at time zone p_tz, 'HH24:MI');
$$;

create function public.rsvps_notify()
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
      true, true, true, v_plan.title, 'A spot opened — confirm within 2 hours', 'A spot opened — confirm within 2 hours', true);
  end if;
  return new;
end;
$$;
create trigger rsvps_notify after insert or update of state on public.rsvps
  for each row execute function public.rsvps_notify();

create function public.plans_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest record;
  v_type text;
  v_body text;
begin
  if new.status not in ('changed', 'cancelled', 'on_hold')
     or (new.status = old.status and not (new.status = 'changed' and new.starts_at <> old.starts_at)) then
    return new;
  end if;
  v_type := case new.status when 'changed' then 'plan_changed' when 'cancelled' then 'plan_cancelled' else 'plan_on_hold' end;
  v_body := case new.status
    when 'changed' then 'New time: ' || public.plan_time_label(new.starts_at, new.tz) || '. Still going?'
    when 'cancelled' then 'This Plan was cancelled.'
    else 'This Plan is on hold. We’ll update you.' end;
  for v_guest in
    select r.user_id from public.rsvps r
    where r.plan_id = new.id and r.state in ('going', 'waitlisted', 'offered', 'checked_in') and r.user_id <> new.host_id
  loop
    perform public.notify(v_guest.user_id, v_type,
      jsonb_build_object('plan_id', new.id, 'plan', new.title, 'time', public.plan_time_label(new.starts_at, new.tz)),
      true, true, new.status <> 'on_hold', new.title, v_body, v_body, false);
  end loop;
  return new;
end;
$$;
create trigger plans_notify after update of status, starts_at on public.plans
  for each row execute function public.plans_notify();

create function public.message_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.from_id;
  perform public.notify(new.to_id, 'message_request',
    jsonb_build_object('from_id', new.from_id, 'name', v_name),
    true, true, false, v_name, 'wants to message you', 'New message request', false);
  return new;
end;
$$;
create trigger message_requests_notify after insert on public.message_requests
  for each row execute function public.message_requests_notify();

create function public.circle_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select name into v_name from public.circles where id = new.circle_id;
    perform public.notify(new.user_id, 'circle_approved',
      jsonb_build_object('circle_id', new.circle_id, 'circle', v_name),
      true, true, false, v_name, 'You’re in', 'You’re in', false);
  end if;
  return new;
end;
$$;
create trigger circle_requests_notify after update of status on public.circle_requests
  for each row execute function public.circle_requests_notify();

create function public.group_orders_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_member record;
  v_type text;
  v_body text;
begin
  if new.state = old.state or new.state not in ('locked', 'extended', 'cancelled', 'ready') then
    return new;
  end if;
  select * into v_plan from public.plans where id = new.plan_id;
  v_type := case when new.state = 'ready' then 'order_ready' else 'order_decision' end;
  v_body := case new.state
    when 'locked' then 'Going ahead'
    when 'extended' then 'Three more days to join'
    when 'cancelled' then 'Cancelled. Nobody has paid, so nothing to refund.'
    else 'Ready for pickup' end;
  for v_member in
    select distinct i.user_id from public.order_items oi join public.order_interests i on i.item_id = oi.id
    where oi.plan_id = new.plan_id and i.quantity > 0 and i.user_id <> v_plan.host_id
  loop
    perform public.notify(v_member.user_id, v_type,
      jsonb_build_object('plan_id', new.plan_id, 'order', v_plan.title, 'state', new.state),
      true, true, false, v_plan.title, v_body, v_body, false);
  end loop;
  return new;
end;
$$;
create trigger group_orders_notify after update of state on public.group_orders
  for each row execute function public.group_orders_notify();

create function public.reports_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> old.status and new.reporter_id is not null then
    perform public.notify(new.reporter_id, 'report_update',
      jsonb_build_object('case_ref', new.case_ref, 'status', new.status),
      true, false, false, new.case_ref, '', '', false);
  end if;
  return new;
end;
$$;
create trigger reports_notify after update of status on public.reports
  for each row execute function public.reports_notify();

create function public.moderation_actions_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_user_id is not null and new.action <> 'no_action' then
    perform public.notify(new.target_user_id, 'moderation_notice',
      jsonb_build_object('action_id', new.id, 'action', new.action),
      true, false, true, 'A decision about your account', new.reason, new.reason, true);
  end if;
  return new;
end;
$$;
create trigger moderation_actions_notify after insert on public.moderation_actions
  for each row execute function public.moderation_actions_notify();

-- A new message: push to the other members, unless they muted the chat.
create function public.messages_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations%rowtype;
  v_sender text;
  v_member record;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  select display_name into v_sender from public.profiles where id = new.sender_id;
  for v_member in
    select m.user_id from (
      select r.user_id from public.rsvps r where v_conv.kind = 'plan' and r.plan_id = v_conv.plan_id
        and r.state in ('going', 'checked_in', 'no_show')
      union select p.host_id from public.plans p where v_conv.kind = 'plan' and p.id = v_conv.plan_id
      union select i.user_id from public.order_items oi join public.order_interests i on i.item_id = oi.id
        where v_conv.kind = 'plan' and oi.plan_id = v_conv.plan_id and i.quantity > 0
      union select cm.user_id from public.circle_members cm where v_conv.kind = 'circle' and cm.circle_id = v_conv.circle_id
      union select v_conv.user_low where v_conv.kind = 'direct'
      union select v_conv.user_high where v_conv.kind = 'direct'
    ) m
    where m.user_id <> new.sender_id
      and not exists (select 1 from public.conversation_settings s
                      where s.user_id = m.user_id and s.conversation_id = v_conv.id and s.muted_until > now())
      and not public.blocked_pair(m.user_id, new.sender_id)
    limit 500
  loop
    perform public.notify(v_member.user_id, 'new_message',
      jsonb_build_object('conversation_id', v_conv.id, 'kind', v_conv.kind, 'ref_id',
        coalesce(v_conv.plan_id, v_conv.circle_id, case when v_conv.user_low = v_member.user_id then v_conv.user_high else v_conv.user_low end)),
      false, true, false, v_sender, left(new.body, 120), 'New message', false);
  end loop;
  return new;
end;
$$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.messages_notify();

-- ---------------------------------------------------------------------------------------------
-- Due reminders, address unlocks and closing orders: the cron calls this every 15 minutes.

create function public.notifications_enqueue_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_key text;
begin
  -- Expired waitlist offers pass to the next in line (their offer notifies through the trigger).
  perform public.expire_waitlist_offers();
  -- A collecting order past its cutoff settles its stored state, so the decision notice goes out.
  update public.group_orders o set state = public.order_effective_state(o)
  where o.state in ('collecting', 'extended') and o.closes_at <= now()
    and public.order_effective_state(o) <> o.state;

  -- Day-before and two-hour reminders for everyone going. A window that was missed still sends
  -- while it makes sense; a rescheduled Plan is a new occurrence.
  for v_row in
    select r.user_id, p.id, p.title, p.starts_at, p.tz,
      case when p.starts_at - now() <= interval '2 hours 15 minutes' then 'reminder_2h' else 'reminder_day_before' end as reminder_kind
    from public.rsvps r join public.plans p on p.id = r.plan_id
    where r.state in ('going', 'checked_in') and p.status in ('published', 'changed')
      and p.starts_at - now() between interval '0' and interval '24 hours 15 minutes'
  loop
    v_key := v_row.reminder_kind || ':' || extract(epoch from v_row.starts_at)::bigint::text;
    insert into public.notification_marks (user_id, type, ref_id) values (v_row.user_id, v_key, v_row.id)
    on conflict do nothing;
    if found then
      perform public.notify(v_row.user_id, v_row.reminder_kind,
        jsonb_build_object('plan_id', v_row.id, 'plan', v_row.title, 'time', public.plan_time_label(v_row.starts_at, v_row.tz)),
        v_row.reminder_kind = 'reminder_day_before', true, false, v_row.title,
        case when v_row.reminder_kind = 'reminder_2h' then 'Starts at ' || public.plan_time_label(v_row.starts_at, v_row.tz) else 'Tomorrow ' || public.plan_time_label(v_row.starts_at, v_row.tz) end,
        case when v_row.reminder_kind = 'reminder_2h' then 'Starts at ' || public.plan_time_label(v_row.starts_at, v_row.tz) else 'Tomorrow ' || public.plan_time_label(v_row.starts_at, v_row.tz) end,
        false);
      v_count := v_count + 1;
    end if;
  end loop;
  -- The address is ready (never in the push text), any time between reveal and start.
  for v_row in
    select r.user_id, p.id, p.title, pp.reveal_at
    from public.rsvps r join public.plans p on p.id = r.plan_id join public.plan_private pp on pp.plan_id = p.id
    where r.state in ('going', 'checked_in') and p.status in ('published', 'changed') and p.format = 'in_person'
      and pp.reveal_at <= now() and p.starts_at > now()
  loop
    v_key := 'address_unlocked:' || extract(epoch from v_row.reveal_at)::bigint::text;
    insert into public.notification_marks (user_id, type, ref_id) values (v_row.user_id, v_key, v_row.id)
    on conflict do nothing;
    if found then
      perform public.notify(v_row.user_id, 'address_unlocked',
        jsonb_build_object('plan_id', v_row.id, 'plan', v_row.title),
        true, true, true, v_row.title, 'The address is ready', 'The address is ready', false);
      v_count := v_count + 1;
    end if;
  end loop;
  -- A group order closes within a day.
  for v_row in
    select distinct i.user_id, p.id, p.title, o.closes_at
    from public.group_orders o join public.plans p on p.id = o.plan_id
    join public.order_items oi on oi.plan_id = o.plan_id join public.order_interests i on i.item_id = oi.id
    where o.state in ('collecting', 'extended') and i.quantity > 0
      and o.closes_at - now() between interval '0' and interval '24 hours 15 minutes'
  loop
    v_key := 'order_closing:' || extract(epoch from v_row.closes_at)::bigint::text;
    insert into public.notification_marks (user_id, type, ref_id) values (v_row.user_id, v_key, v_row.id)
    on conflict do nothing;
    if found then
      perform public.notify(v_row.user_id, 'order_closing',
        jsonb_build_object('plan_id', v_row.id, 'order', v_row.title),
        false, true, false, v_row.title, 'Closes tomorrow', 'Closes tomorrow', false);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- The dispatcher claims due rows under a five-minute lease, so two runs never send the same row.
create function public.push_queue_claim(p_limit integer)
returns setof public.push_queue
language sql
security definer
set search_path = ''
as $$
  update public.push_queue q set claimed_at = now(), attempts = q.attempts + 1
  where q.id in (
    select id from public.push_queue
    where sent_at is null and send_after <= now() and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by send_after limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked)
  returning q.*;
$$;
revoke all on function public.push_queue_claim(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants. The queue, marks and enqueue function are the service role's.

revoke all on function public.notifications_list(integer) from public, anon;
grant execute on function public.notifications_list(integer) to authenticated;
revoke all on function public.notifications_unread_count() from public, anon;
grant execute on function public.notifications_unread_count() to authenticated;
revoke all on function public.notification_mark_read(uuid) from public, anon;
grant execute on function public.notification_mark_read(uuid) to authenticated;
revoke all on function public.notifications_mark_all_read() from public, anon;
grant execute on function public.notifications_mark_all_read() to authenticated;
revoke all on function public.push_token_register(text, text) from public, anon;
grant execute on function public.push_token_register(text, text) to authenticated;
revoke all on function public.push_token_remove(text) from public, anon;
grant execute on function public.push_token_remove(text) to authenticated;
revoke all on function public.notifications_enqueue_due() from public, anon, authenticated;
revoke all on function public.plan_time_label(timestamptz, text) from public, anon, authenticated;
revoke all on function public.rsvps_notify() from public, anon, authenticated;
revoke all on function public.plans_notify() from public, anon, authenticated;
revoke all on function public.message_requests_notify() from public, anon, authenticated;
revoke all on function public.circle_requests_notify() from public, anon, authenticated;
revoke all on function public.group_orders_notify() from public, anon, authenticated;
revoke all on function public.reports_notify() from public, anon, authenticated;
revoke all on function public.moderation_actions_notify() from public, anon, authenticated;
revoke all on function public.messages_notify() from public, anon, authenticated;

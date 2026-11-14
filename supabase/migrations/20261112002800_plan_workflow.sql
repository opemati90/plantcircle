-- Plan workflow (docs/07 §Plan, docs/06 plan_update / plan_cancel): a host edits a live Plan,
-- a time or place change asks going guests to re-confirm, the Plan returns to `published` once
-- everyone has answered or after 48 hours, and a host can cancel with a reason. Drafts and
-- a separate publish step stay on the backlog (S2); every Plan is still created published.
--
-- Decisions (engineer's call, open for the owner):
--  * "Time or place" = starts_at, ends_at, the area label or the exact address. Title,
--    description and capacity changes never ask anyone to re-confirm.
--  * Capacity can only drop to the number of people already going.
--  * Cancelling releases every spot, place in line and bring claim; the record stays.
--  * A guest who cannot make it after a change uses the ordinary rsvp_cancel.

alter table public.plans add column changed_at timestamptz;
alter table public.plans add column cancelled_reason text
  check (cancelled_reason is null or char_length(cancelled_reason) between 1 and 300);
alter table public.rsvps add column needs_reconfirm boolean not null default false;

-- ---------------------------------------------------------------- host edits

create function public.plan_update(
  p_plan_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_area_label text,
  p_address text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.plans%rowtype;
  v_old_address text;
  v_going integer;
  v_moved boolean;
  v_replay jsonb;
  v_fingerprint text;
  v_title text := public.text_trim(p_title);
  v_description text := public.text_trim(p_description);
  v_area text := public.text_trim(p_area_label);
  v_address text := public.text_trim(p_address);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_plan.host_id <> v_uid then
    raise exception 'not_host' using errcode = '42501';
  end if;
  v_fingerprint := 'plan_update:' || p_plan_id::text || ':' || jsonb_build_object(
    'title', p_title, 'description', p_description, 'starts', p_starts_at, 'ends', p_ends_at,
    'capacity', p_capacity, 'area', p_area_label, 'address', p_address)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_plan.status not in ('published', 'changed') then
    raise exception 'plan_not_live' using errcode = 'P0001';
  end if;
  if v_plan.starts_at <= now() then
    raise exception 'plan_started' using errcode = 'P0001';
  end if;

  -- The same rules as plan_create.
  if char_length(v_title) not between 3 and 80 or char_length(v_description) > 2000 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_starts_at <= now() + interval '1 hour' then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_ends_at - p_starts_at not between interval '30 minutes' and interval '8 hours' then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_capacity not between 2 and 50 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if v_plan.format = 'in_person'
     and (char_length(v_area) not between 1 and 60 or char_length(v_address) not between 1 and 200) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  select count(*) into v_going from public.rsvps
  where plan_id = p_plan_id and state in ('going', 'checked_in', 'offered');
  if p_capacity < v_going then
    raise exception 'capacity_below_going' using errcode = 'P0001';
  end if;
  if p_capacity > v_plan.capacity then
    perform public.host_level_check(v_plan.format, p_capacity);
  end if;

  select address into v_old_address from public.plan_private where plan_id = p_plan_id;
  v_moved := p_starts_at <> v_plan.starts_at or p_ends_at <> v_plan.ends_at
    or (v_plan.format = 'in_person'
        and (v_area is distinct from v_plan.area_label or v_address is distinct from v_old_address));

  update public.plans
  set title = v_title,
      description = v_description,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      capacity = p_capacity,
      area_label = case when format = 'in_person' then v_area else area_label end,
      status = case when v_moved then 'changed'::public.plan_status else status end,
      changed_at = case when v_moved then now() else changed_at end
  where id = p_plan_id;
  if v_plan.format = 'in_person' then
    update public.plan_private
    set address = v_address,
        -- A later start keeps the address hidden until the day before it, as at creation.
        reveal_at = case when reveal_at > now() then least(reveal_at, p_starts_at - interval '1 day') else reveal_at end
    where plan_id = p_plan_id;
  end if;

  if v_moved then
    update public.rsvps set needs_reconfirm = true, updated_at = now()
    where plan_id = p_plan_id and state in ('going', 'checked_in');
    -- Someone freed a spot at the old time: promote_waitlist keeps the line moving as usual.
  end if;

  insert into public.audit_events (actor_id, action, plan_id, detail)
  values (v_uid, 'host.update_plan', p_plan_id,
    jsonb_build_object('moved', v_moved, 'starts_at', p_starts_at, 'capacity', p_capacity));

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint,
    jsonb_build_object('status', case when v_moved then 'changed' else v_plan.status::text end));
end;
$$;
revoke all on function public.plan_update(uuid, text, text, timestamptz, timestamptz, integer, text, text, uuid)
  from public, anon;

-- A going guest says they are still coming after a change. "Can't make it" is rsvp_cancel.
-- Once nobody is left to answer, the Plan is simply published again.
create function public.rsvp_reconfirm(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.plans%rowtype;
  v_replay jsonb;
  v_fingerprint text := 'rsvp_reconfirm:' || p_plan_id::text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  update public.rsvps set needs_reconfirm = false, updated_at = now()
  where plan_id = p_plan_id and user_id = v_uid and state in ('going', 'checked_in');
  if not found then
    raise exception 'rsvp_required' using errcode = 'P0001';
  end if;
  perform public.plan_settle_changed(p_plan_id);
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('status', 'going'));
end;
$$;
revoke all on function public.rsvp_reconfirm(uuid, uuid) from public, anon;

-- `changed` → `published` once nobody still has to answer. Called with the Plan row locked.
create function public.plan_settle_changed(p_plan_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.plans
  set status = 'published'
  where id = p_plan_id and status = 'changed'
    and not exists (
      select 1 from public.rsvps r
      where r.plan_id = p_plan_id and r.needs_reconfirm and r.state in ('going', 'checked_in'));
$$;
revoke all on function public.plan_settle_changed(uuid) from public, anon, authenticated;

-- A guest who cancels after a change no longer has to answer; the Plan may settle.
create or replace function public.rsvps_settle_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.needs_reconfirm and new.state not in ('going', 'checked_in') then
    new.needs_reconfirm := false;
  end if;
  return new;
end;
$$;
create trigger rsvps_settle_changed before update of state on public.rsvps
  for each row execute function public.rsvps_settle_changed();

create function public.rsvps_settle_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.needs_reconfirm and not new.needs_reconfirm then
    perform public.plan_settle_changed(new.plan_id);
  end if;
  return null;
end;
$$;
-- On every update (not "of needs_reconfirm"): a BEFORE trigger clearing the flag inside
-- rsvp_cancel would not count as that column being named in the statement.
create trigger rsvps_settle_plan after update on public.rsvps
  for each row execute function public.rsvps_settle_plan();

-- 48 hours after a change, the Plan is published again whatever is still unanswered.
create function public.plans_changed_due()
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
    where status = 'changed' and changed_at + interval '48 hours' <= now()
    for update skip locked
  loop
    update public.rsvps set needs_reconfirm = false, updated_at = now()
    where plan_id = v_plan.id and needs_reconfirm;
    update public.plans set status = 'published' where id = v_plan.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.plans_changed_due() from public, anon, authenticated;

create or replace function public.notifications_enqueue_due_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.plans_changed_due();
  perform public.plans_complete_due();
  perform public.web_rsvp_cleanup();
  perform public.host_featured_refresh_all();
  perform public.weekly_digest_enqueue();
  return public.notifications_enqueue_due();
end;
$$;

-- ---------------------------------------------------------------- host cancels

create function public.plan_cancel(p_plan_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.plans%rowtype;
  v_reason text := public.text_trim(p_reason);
  v_replay jsonb;
  v_fingerprint text := 'plan_cancel:' || p_plan_id::text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_plan.host_id <> v_uid then
    raise exception 'not_host' using errcode = '42501';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_plan.status not in ('published', 'changed', 'on_hold') then
    raise exception 'plan_not_live' using errcode = 'P0001';
  end if;
  if char_length(v_reason) not between 1 and 300 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;

  insert into public.audit_events (actor_id, action, plan_id, detail)
  values (v_uid, 'host.cancel_plan', p_plan_id, jsonb_build_object('reason', v_reason));

  -- The reason is stored first so the status flip (plans_notify) carries it to everyone who
  -- still holds a spot or a place in line; only then is everything released. The record stays.
  update public.plans set cancelled_reason = v_reason where id = p_plan_id;
  update public.plans set status = 'cancelled', hold_reason = null where id = p_plan_id;
  delete from public.contribution_claims cc
  using public.contribution_slots s
  where cc.slot_id = s.id and s.plan_id = p_plan_id;
  update public.rsvps
  set state = 'cancelled', offer_expires_at = null, needs_reconfirm = false, updated_at = now()
  where plan_id = p_plan_id and state in ('going', 'checked_in', 'waitlisted', 'offered');

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('status', 'cancelled'));
end;
$$;
revoke all on function public.plan_cancel(uuid, text, uuid) from public, anon;

-- ---------------------------------------------------------------- notifications

-- The cancellation carries who cancelled and why (docs/12: “{plan} was cancelled. {host}: “{reason}””).
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
  v_host text;
  v_payload jsonb;
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
  select display_name into v_host from public.profiles where id = new.host_id;
  v_body := case new.status
    when 'changed' then 'New time: ' || v_time || '. Still going?'
    when 'cancelled' then
      case when new.cancelled_reason is null then 'This Plan was cancelled.'
      else 'Cancelled by ' || coalesce(v_host, 'the host') || ': “' || new.cancelled_reason || '”' end
    else 'This Plan is on hold. We’ll update you by ' || v_time || '.' end;
  v_payload := jsonb_build_object('plan_id', new.id, 'plan', new.title, 'time', v_time,
    'host', v_host, 'reason', new.cancelled_reason);
  for v_guest in
    select r.user_id from public.rsvps r
    where r.plan_id = new.id and r.user_id <> new.host_id
      and r.state in ('going', 'waitlisted', 'offered', 'checked_in')
  loop
    perform public.notify(v_guest.user_id, v_type, v_payload,
      true, true, new.status <> 'on_hold', new.title, v_body, v_body, false);
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------- read models

-- The viewer's own standing carries the re-confirm flag; the card carries the Plan's status
-- and the cancellation reason, which is public to anyone who could see the Plan.
create or replace view public.my_rsvps
with (security_invoker = false)
as
select
  r.plan_id,
  r.state as status,
  r.offer_expires_at,
  case when r.state in ('waitlisted', 'offered') then (
    select count(*)::int from public.rsvps ahead
    where ahead.plan_id = r.plan_id
      and ahead.state in ('waitlisted', 'offered')
      and ahead.queue_seq <= r.queue_seq
  ) end as waitlist_position,
  p.starts_at,
  p.ends_at,
  r.needs_reconfirm
from public.rsvps r
join public.plans p on p.id = r.plan_id
where r.user_id = (select auth.uid());

create or replace view public.plan_cards
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
  (select count(*)::int from public.rsvps r
    where r.plan_id = p.id and r.state in ('waitlisted', 'offered')) as waitlist_count,
  (
    (select count(*) from public.rsvps r
      where r.plan_id = p.id and r.state in ('going', 'checked_in', 'offered')) < p.capacity
    and not exists (
      select 1 from public.rsvps r
      where r.plan_id = p.id and r.state in ('waitlisted', 'offered'))
  ) as has_open_spot,
  (h.is_verified_host or h.featured_host) as host_featured,
  p.cancelled_reason,
  p.changed_at
from public.plans p
join public.plan_private pp on pp.plan_id = p.id
join public.profiles h on h.id = p.host_id
join public.cities c on c.id = p.city_id
where p.status <> 'draft'
  and not public.hidden_by_block(p.host_id);

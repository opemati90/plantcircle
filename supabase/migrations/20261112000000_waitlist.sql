-- Waitlist (AC-17/18/19).
--
--   * First in, first out.
--   * When a spot frees up, the first person in line is OFFERED it for 2 hours.
--     If they confirm they are going; if they decline or the offer expires, it
--     passes to the next person.
--   * Inside the last 6 hours before the start there is no time for that: the
--     spot is offered to everyone in line at once and the first to confirm wins.
--   * An exclusive offer holds its spot, so going + offered never exceeds capacity
--     outside the 6-hour window, and going never exceeds capacity at all.
--
-- Offers are expired lazily by every RPC that touches the Plan (so an expired
-- offer can never be confirmed), and by expire_waitlist_offers(), which a
-- scheduled job must call every minute so the next person is offered promptly.
--
-- PROVISIONAL: written from the design canvas notes; reconcile with
-- docs/07-state-machines.md when it is available.

-- Caller must hold the Plan's row lock.
create function public.advance_waitlist(p_plan_id uuid)
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

  update public.rsvps
  set status = 'expired', offer_expires_at = null, updated_at = now()
  where plan_id = p_plan_id and status = 'offered' and offer_expires_at <= now();

  if v_plan.status <> 'published' or v_plan.starts_at <= now() then
    return;
  end if;

  select count(*) filter (where status = 'going'), count(*) filter (where status = 'offered')
  into v_going, v_offered
  from public.rsvps where plan_id = p_plan_id;

  if now() >= v_plan.starts_at - interval '6 hours' then
    if v_going < v_plan.capacity then
      -- Last 6 hours: offer to everyone in line; first to confirm wins.
      update public.rsvps
      set status = 'offered',
          offer_expires_at = least(now() + interval '2 hours', v_plan.starts_at),
          updated_at = now()
      where plan_id = p_plan_id and status = 'waitlisted';
    else
      -- Full again: the others go back in line and keep their place.
      update public.rsvps
      set status = 'waitlisted', offer_expires_at = null, updated_at = now()
      where plan_id = p_plan_id and status = 'offered';
    end if;
    return;
  end if;

  v_free := v_plan.capacity - v_going - v_offered;
  if v_free > 0 then
    update public.rsvps r
    set status = 'offered', offer_expires_at = now() + interval '2 hours', updated_at = now()
    from (
      select user_id from public.rsvps
      where plan_id = p_plan_id and status = 'waitlisted'
      order by joined_at, user_id
      limit v_free
    ) next_in_line
    where r.plan_id = p_plan_id and r.user_id = next_in_line.user_id;
  end if;
end;
$$;

-- Shared guard for the member-facing RPCs below: authenticates, locks the Plan,
-- and brings the waitlist up to date. Returns the locked Plan.
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
  if not found or v_plan.status <> 'published' then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  return v_plan;
end;
$$;

-- A member's place in line (1 = next), counting people who are waiting or
-- currently hold an offer.
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
   and ahead.status in ('waitlisted', 'offered')
   and (ahead.joined_at, ahead.user_id) <= (me.joined_at, me.user_id)
  where me.plan_id = p_plan_id and me.user_id = p_user_id
    and me.status in ('waitlisted', 'offered');
$$;

-- join_plan: takes a free spot. Raises plan_full when there is none, or when
-- people are already in line (nobody jumps the queue).
create or replace function public.join_plan(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.rsvp_status;
  v_held integer;
  v_queue integer;
  v_replay jsonb;
begin
  v_plan := public.lock_plan_for_member(p_plan_id);
  -- Looked up after the lock so a concurrent duplicate sees the first call's result.
  v_replay := public.idempotent_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_plan.ends_at <= now() then
    raise exception 'plan_ended' using errcode = 'P0001';
  end if;
  if v_plan.host_id = v_uid then
    raise exception 'host_cannot_join' using errcode = 'P0001';
  end if;
  perform public.advance_waitlist(p_plan_id);

  select status into v_existing
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;

  if v_existing is null or v_existing in ('cancelled', 'expired') then
    select count(*) filter (where status in ('going', 'offered')),
           count(*) filter (where status in ('waitlisted', 'offered'))
    into v_held, v_queue
    from public.rsvps where plan_id = p_plan_id;
    if v_held >= v_plan.capacity or v_queue > 0 then
      raise exception 'plan_full' using errcode = 'P0001';
    end if;

    insert into public.rsvps (plan_id, user_id, status)
    values (p_plan_id, v_uid, 'going')
    on conflict (plan_id, user_id)
    do update set status = 'going', joined_at = now(), updated_at = now();
    v_existing := 'going';
  end if;

  return public.idempotent_store(
    p_idempotency_key, 'join_plan', jsonb_build_object('status', v_existing));
end;
$$;

-- join_waitlist: gets in line. If a spot is in fact free and nobody is waiting,
-- the member simply gets the spot.
create function public.join_waitlist(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.rsvp_status;
  v_held integer;
  v_queue integer;
  v_status public.rsvp_status;
  v_replay jsonb;
begin
  v_plan := public.lock_plan_for_member(p_plan_id);
  v_replay := public.idempotent_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_plan.starts_at <= now() then
    raise exception 'plan_ended' using errcode = 'P0001';
  end if;
  if v_plan.host_id = v_uid then
    raise exception 'host_cannot_join' using errcode = 'P0001';
  end if;
  perform public.advance_waitlist(p_plan_id);

  select status into v_existing
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;

  if v_existing is null or v_existing in ('cancelled', 'expired') then
    select count(*) filter (where status in ('going', 'offered')),
           count(*) filter (where status in ('waitlisted', 'offered'))
    into v_held, v_queue
    from public.rsvps where plan_id = p_plan_id;
    v_status := case
      when v_held < v_plan.capacity and v_queue = 0 then 'going'
      else 'waitlisted'
    end;

    insert into public.rsvps (plan_id, user_id, status)
    values (p_plan_id, v_uid, v_status)
    on conflict (plan_id, user_id)
    do update set status = excluded.status, joined_at = now(), updated_at = now(),
                  offer_expires_at = null;
    -- Inside the last 6 hours a newcomer may be offered an open spot straight away.
    perform public.advance_waitlist(p_plan_id);
  end if;

  select status into v_existing
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;
  return public.idempotent_store(
    p_idempotency_key,
    'join_waitlist',
    jsonb_build_object(
      'status', v_existing,
      'position', public.waitlist_position(p_plan_id, v_uid)));
end;
$$;

-- confirm_waitlist_offer: turns an offer into a confirmed spot. Expected
-- outcomes are returned, not raised, so that expiring a stale offer and passing
-- it on are committed even when this caller was too late:
--   going      – confirmed
--   expired    – the 2 hours ran out
--   waitlisted – no spot is open for this member (in the last 6 hours: someone
--                else confirmed first); they keep their place in line
create function public.confirm_waitlist_offer(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_before public.rsvp_status;
  v_status public.rsvp_status;
  v_outcome text;
  v_replay jsonb;
begin
  v_plan := public.lock_plan_for_member(p_plan_id);
  v_replay := public.idempotent_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  select status into v_before
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;
  perform public.advance_waitlist(p_plan_id);
  select status into v_status
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;

  if v_status = 'going' then
    v_outcome := 'going';
  elsif v_status = 'offered' then
    -- advance_waitlist only leaves an offer standing while a spot is open for it.
    update public.rsvps
    set status = 'going', offer_expires_at = null, updated_at = now()
    where plan_id = p_plan_id and user_id = v_uid;
    perform public.advance_waitlist(p_plan_id);
    v_outcome := 'going';
  elsif v_before = 'offered' and v_status = 'expired' then
    v_outcome := 'expired';
  elsif v_status = 'waitlisted' then
    v_outcome := 'waitlisted';
  else
    raise exception 'no_offer' using errcode = 'P0001';
  end if;

  return public.idempotent_store(
    p_idempotency_key, 'confirm_waitlist_offer', jsonb_build_object('status', v_outcome));
end;
$$;

-- cancel_rsvp: gives up a spot, a place in line, or an offer ("pass it on"),
-- releases anything the member said they'd bring, and passes the spot on.
create or replace function public.cancel_rsvp(p_plan_id uuid, p_idempotency_key uuid)
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
  v_replay := public.idempotent_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  update public.rsvps
  set status = 'cancelled', offer_expires_at = null, updated_at = now()
  where plan_id = p_plan_id and user_id = v_uid
    and status in ('going', 'waitlisted', 'offered');

  delete from public.bring_claims c
  using public.bring_items i
  where c.item_id = i.id and i.plan_id = p_plan_id and c.user_id = v_uid;

  perform public.advance_waitlist(p_plan_id);

  return public.idempotent_store(
    p_idempotency_key, 'cancel_rsvp', jsonb_build_object('status', 'cancelled'));
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
    where status = 'offered' and offer_expires_at <= now()
  loop
    perform 1 from public.plans where id = v_plan_id for update;
    perform public.advance_waitlist(v_plan_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- The viewer's own RSVPs with their place in line (owner-rights view scoped by auth.uid()).
create view public.my_rsvps
with (security_invoker = false)
as
select
  r.plan_id,
  r.status,
  r.offer_expires_at,
  -- Inlined (not waitlist_position()) so no function that takes an arbitrary
  -- user id has to be executable by members.
  case when r.status in ('waitlisted', 'offered') then (
    select count(*)::int from public.rsvps ahead
    where ahead.plan_id = r.plan_id
      and ahead.status in ('waitlisted', 'offered')
      and (ahead.joined_at, ahead.user_id) <= (r.joined_at, r.user_id)
  ) end as waitlist_position
from public.rsvps r
where r.user_id = (select auth.uid());

revoke all on public.my_rsvps from anon, authenticated;
grant select on public.my_rsvps to authenticated;

revoke all on function public.advance_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.lock_plan_for_member(uuid) from public, anon, authenticated;
revoke all on function public.waitlist_position(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_waitlist_offers() from public, anon, authenticated;
revoke all on function public.join_waitlist(uuid, uuid) from public, anon;
revoke all on function public.confirm_waitlist_offer(uuid, uuid) from public, anon;
grant execute on function public.join_waitlist(uuid, uuid) to authenticated;
grant execute on function public.confirm_waitlist_offer(uuid, uuid) to authenticated;

-- Hosting (C5): check guests in, end a Plan, see who came, and collect feedback after it.
--
-- Decisions (recorded in docs/superpowers/plans/2026-11-12-remaining-work.md):
--  * Check-in opens 2 hours before the start and closes 2 hours after the end.
--  * Only the host checks guests in, one at a time, with undo inside the window.
--  * End Plan works from the start time on. Going guests not checked in become no_show;
--    waitlisted and offered people are cancelled.
--  * Feedback: a checked-in guest, once the Plan has ended, rates 1 to 5 with an optional note.
--    The host sees the count and the average only.
--  * Every host action on a guest or on the Plan writes an audit row.

-- Who did what to whom. Written only by the functions below; nobody reads it through the API yet.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  plan_id uuid references public.plans (id) on delete cascade,
  subject_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;

create table public.plan_feedback (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
alter table public.plan_feedback enable row level security;
create policy plan_feedback_own on public.plan_feedback for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.plan_feedback from anon, authenticated;
grant select on public.plan_feedback to authenticated;

-- The check-in window for a Plan. Open for a live Plan from 2 hours before it starts to 2 hours
-- after it ends. Used by the functions only; it reads times, never addresses.
create function public.checkin_open(p_plan public.plans)
returns boolean
language sql
immutable
as $$
  select p_plan.status in ('published', 'changed')
    and now() >= p_plan.starts_at - interval '2 hours'
    and now() <= p_plan.ends_at + interval '2 hours';
$$;

-- Host checks one guest in, or undoes it, inside the window.
create function public.host_check_in(
  p_plan_id uuid,
  p_user_id uuid,
  p_checked_in boolean,
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
  v_rsvp public.rsvps%rowtype;
  v_fingerprint text := 'host_check_in:' || p_plan_id::text || ':' || p_user_id::text || ':' || p_checked_in::text;
  v_replay jsonb;
  v_state public.rsvp_state;
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
  if not public.checkin_open(v_plan) then
    raise exception 'checkin_closed' using errcode = 'P0001';
  end if;
  select * into v_rsvp from public.rsvps where plan_id = p_plan_id and user_id = p_user_id for update;
  if not found or v_rsvp.state not in ('going', 'checked_in') then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;

  if p_checked_in and v_rsvp.state = 'going' then
    update public.rsvps
    set state = 'checked_in', checked_in_at = now(), checked_in_by = v_uid, updated_at = now()
    where id = v_rsvp.id;
  elsif not p_checked_in and v_rsvp.state = 'checked_in' then
    update public.rsvps
    set state = 'going', checked_in_at = null, checked_in_by = null, updated_at = now()
    where id = v_rsvp.id;
  end if;

  insert into public.audit_events (actor_id, action, plan_id, subject_id)
  values (v_uid, case when p_checked_in then 'host.check_in' else 'host.undo_check_in' end,
    p_plan_id, p_user_id);

  select state into v_state from public.rsvps where id = v_rsvp.id;
  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('state', v_state));
end;
$$;

-- The host ends the Plan. Going guests who did not check in are no-shows; people still waiting
-- or holding an offer are cancelled, because the Plan is over.
create function public.host_end_plan(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.plans%rowtype;
  v_fingerprint text := 'host_end_plan:' || p_plan_id::text;
  v_replay jsonb;
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
  if v_plan.status not in ('published', 'changed') then
    raise exception 'plan_not_live' using errcode = 'P0001';
  end if;
  if now() < v_plan.starts_at then
    raise exception 'plan_not_started' using errcode = 'P0001';
  end if;

  insert into public.audit_events (actor_id, action, plan_id)
  values (v_uid, 'host.end_plan', p_plan_id);
  insert into public.audit_events (actor_id, action, plan_id, subject_id)
  select v_uid, 'host.mark_no_show', p_plan_id, r.user_id
  from public.rsvps r where r.plan_id = p_plan_id and r.state = 'going';
  insert into public.audit_events (actor_id, action, plan_id, subject_id)
  select v_uid, 'host.end_cancel_waiting', p_plan_id, r.user_id
  from public.rsvps r where r.plan_id = p_plan_id and r.state in ('waitlisted', 'offered');

  update public.plans set status = 'completed' where id = p_plan_id;
  update public.rsvps set state = 'no_show', updated_at = now()
  where plan_id = p_plan_id and state = 'going';
  update public.rsvps set state = 'cancelled', offer_expires_at = null, updated_at = now()
  where plan_id = p_plan_id and state in ('waitlisted', 'offered');

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('status', 'completed'));
end;
$$;

-- The guest list for the host. Names and states only; no contact details.
create function public.host_guest_list(p_plan_id uuid)
returns table (
  user_id uuid,
  display_name text,
  state public.rsvp_state,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans where id = p_plan_id and host_id = (select auth.uid())) then
    raise exception 'not_host' using errcode = '42501';
  end if;
  return query
    select r.user_id, p.display_name, r.state, r.checked_in_at
    from public.rsvps r
    join public.profiles p on p.id = r.user_id
    where r.plan_id = p_plan_id and r.state in ('going', 'checked_in', 'no_show', 'waitlisted', 'offered')
    order by
      case r.state when 'checked_in' then 0 when 'going' then 1 when 'no_show' then 2
        when 'offered' then 3 else 4 end,
      r.queue_seq;
end;
$$;

-- Counts and the average rating, for the host only.
create function public.host_plan_summary(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans where id = p_plan_id and host_id = (select auth.uid())) then
    raise exception 'not_host' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'going', count(*) filter (where r.state = 'going'),
      'checked_in', count(*) filter (where r.state = 'checked_in'),
      'no_show', count(*) filter (where r.state = 'no_show'),
      'ended', (select p.status = 'completed' from public.plans p where p.id = p_plan_id),
      'live', (select p.status in ('published', 'changed') from public.plans p where p.id = p_plan_id),
      'feedback_count', (select count(*) from public.plan_feedback f where f.plan_id = p_plan_id),
      -- Below three ratings an average names the one guest who rated, so none is shown.
      'average_rating', (select case when count(*) >= 3 then round(avg(f.rating)::numeric, 1) end
        from public.plan_feedback f where f.plan_id = p_plan_id)
    )
    from public.rsvps r
    where r.plan_id = p_plan_id
  );
end;
$$;

-- A guest's own feedback state: whether they may give it, and what they gave.
create function public.plan_feedback_mine(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'eligible', exists (
      select 1 from public.rsvps r join public.plans p on p.id = r.plan_id
      where r.plan_id = p_plan_id and r.user_id = (select auth.uid())
        and r.state = 'checked_in' and now() >= p.ends_at),
    'rating', (select f.rating from public.plan_feedback f
      where f.plan_id = p_plan_id and f.user_id = (select auth.uid())),
    'comment', (select f.comment from public.plan_feedback f
      where f.plan_id = p_plan_id and f.user_id = (select auth.uid()))
  );
$$;

-- Leave or change feedback, as a checked-in guest, once the Plan has ended.
create function public.plan_feedback_submit(
  p_plan_id uuid,
  p_rating integer,
  p_comment text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ends timestamptz;
  v_comment text := nullif(public.text_trim(p_comment), '');
  v_fingerprint text := 'plan_feedback:' || p_plan_id::text || ':' || p_rating::text || ':' || coalesce(v_comment, '');
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_feedback' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_comment, '')) > 500 then
    raise exception 'invalid_feedback' using errcode = 'P0001';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select p.ends_at into v_ends from public.plans p where p.id = p_plan_id;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.rsvps where plan_id = p_plan_id and user_id = v_uid and state = 'checked_in')
    or now() < v_ends then
    raise exception 'feedback_not_open' using errcode = 'P0001';
  end if;

  insert into public.plan_feedback (plan_id, user_id, rating, comment)
  values (p_plan_id, v_uid, p_rating, v_comment)
  on conflict (plan_id, user_id)
  do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('rating', p_rating));
end;
$$;

revoke all on function public.checkin_open(public.plans) from public, anon, authenticated;
revoke all on function public.host_check_in(uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.host_check_in(uuid, uuid, boolean, uuid) to authenticated;
revoke all on function public.host_end_plan(uuid, uuid) from public, anon;
grant execute on function public.host_end_plan(uuid, uuid) to authenticated;
revoke all on function public.host_guest_list(uuid) from public, anon;
grant execute on function public.host_guest_list(uuid) to authenticated;
revoke all on function public.host_plan_summary(uuid) from public, anon;
grant execute on function public.host_plan_summary(uuid) to authenticated;
revoke all on function public.plan_feedback_mine(uuid) from public, anon;
grant execute on function public.plan_feedback_mine(uuid) to authenticated;
revoke all on function public.plan_feedback_submit(uuid, integer, text, uuid) from public, anon;
grant execute on function public.plan_feedback_submit(uuid, integer, text, uuid) to authenticated;

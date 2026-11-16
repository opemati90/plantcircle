-- Two loose ends from the reviews of 2026-11-15:
--
-- 1. circle_cards named every Circle's owner to anyone, signed in or not, including suspended
--    owners and people the viewer blocked. The name now shows only to signed-in members, only
--    for an active owner, and never across a block.
-- 2. Asking to join had no limit across Circles: one person could send requests to every Circle.
--    New requests are now limited to 10 a day and 20 waiting at once per person.

create or replace view public.circle_cards
with (security_invoker = false)
as
select
  c.id,
  c.name,
  c.tagline,
  c.city_id,
  city.name as city,
  c.is_global,
  c.access,
  c.join_question,
  (select count(*)::int from public.circle_members m where m.circle_id = c.id) as member_count,
  public.circle_role(c.id) as viewer_role,
  (select r.status from public.circle_requests r
    where r.circle_id = c.id and r.user_id = (select auth.uid()) and r.status = 'pending') as viewer_request,
  c.name || ' ' || coalesce(c.tagline, '') as search_text,
  case when (select auth.uid()) is not null and not public.hidden_by_block(owner.id)
       then owner.display_name end as owner_name
from public.circles c
left join public.cities city on city.id = c.city_id
left join public.profiles owner on owner.id = c.created_by and owner.status = 'active'
where c.status = 'active'
  and (c.access <> 'invite' or public.circle_role(c.id) is not null);

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
    -- A new request (asking again while one waits changes nothing) counts towards the limits,
    -- counted under a per-person lock so parallel requests cannot slip past.
    if not exists (select 1 from public.circle_requests r
                   where r.circle_id = p_circle_id and r.user_id = v_uid and r.status = 'pending') then
      perform pg_advisory_xact_lock(hashtext('circle_join:' || v_uid::text));
      if (select count(*) from public.circle_requests r
          where r.user_id = v_uid and r.created_at > now() - interval '24 hours') >= 10 then
        raise exception 'rate_limited' using errcode = 'P0001';
      end if;
      -- Waiting requests do not expire overnight: a different answer from the daily limit.
      if (select count(*) from public.circle_requests r
          where r.user_id = v_uid and r.status = 'pending') >= 20 then
        raise exception 'requests_pending' using errcode = 'P0001';
      end if;
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

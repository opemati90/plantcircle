-- A person's profile, seen before connecting or answering their message request (docs/04 People,
-- docs/10 privacy). It shows only what helps decide and nothing that locates or contacts them:
-- name, home city, when they joined, the Circles you share, their hosting level and what earned
-- it, and how many Plans you have been to together. No diet, no goals, no exact place.
--
-- Who may see it: someone who shares an active Circle with you and either chose to be visible in
-- People or has a pending connection or message request to you (you are deciding about them).
-- Never across a block, and never a suspended or deleted account.

create function public.person_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person public.profiles%rowtype;
  v_city text;
  v_circles text[];
  v_recipes integer;
  v_hosted integer;
  v_followers integer;
  v_upvotes integer;
  v_level integer := 0;
  v_row public.host_levels%rowtype;
  v_together integer;
  v_out boolean;
  v_in boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_person from public.profiles where id = p_user_id;
  if not found or p_user_id = v_uid or v_person.status <> 'active'
     or public.blocked_pair(v_uid, p_user_id) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  select array_agg(distinct c.name order by c.name) into v_circles
  from public.circle_members m1
  join public.circles c on c.id = m1.circle_id and c.status = 'active'
  join public.circle_members m2 on m2.circle_id = m1.circle_id
  where m1.user_id = v_uid and m2.user_id = p_user_id;
  if v_circles is null then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  v_out := exists (select 1 from public.connections where requester_id = v_uid and addressee_id = p_user_id);
  v_in := exists (select 1 from public.connections where requester_id = p_user_id and addressee_id = v_uid);
  if not v_person.people_visible
     and not v_in
     and not exists (
       select 1 from public.message_requests r
       where r.from_id = p_user_id and r.to_id = v_uid and r.status = 'pending') then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  select name into v_city from public.cities where id = v_person.city_id;
  select c.recipes, c.hosted, c.followers, c.upvotes
    into v_recipes, v_hosted, v_followers, v_upvotes from public.host_counts(p_user_id) c;
  if v_person.is_verified_host then
    select max(level) into v_level from public.host_levels;
  else
    for v_row in select * from public.host_levels order by level loop
      exit when v_recipes < v_row.recipes or v_hosted < v_row.hosted
        or v_followers < v_row.followers or v_upvotes < v_row.upvotes;
      v_level := v_row.level;
    end loop;
  end if;

  -- Plans you both went to (or one hosted and the other attended).
  select count(distinct p.id)::int into v_together
  from public.plans p
  where p.status = 'completed'
    and (p.host_id = v_uid or exists (select 1 from public.rsvps r
          where r.plan_id = p.id and r.user_id = v_uid and r.state = 'checked_in'))
    and (p.host_id = p_user_id or exists (select 1 from public.rsvps r
          where r.plan_id = p.id and r.user_id = p_user_id and r.state = 'checked_in'));

  return jsonb_build_object(
    'user_id', p_user_id,
    'display_name', v_person.display_name,
    'city', v_city,
    'member_since', date_trunc('month', v_person.created_at),
    'circle_names', to_jsonb(v_circles),
    'connection', case
      when v_out and v_in then 'connected'
      when v_out then 'requested'
      when v_in then 'requested_by_them'
      else 'none' end,
    'verified', v_person.is_verified_host,
    'level', v_level,
    'recipes', v_recipes,
    'hosted', v_hosted,
    'upvotes', v_upvotes,
    'plans_together', v_together);
end;
$$;
revoke all on function public.person_profile(uuid) from public, anon;
grant execute on function public.person_profile(uuid) to authenticated;

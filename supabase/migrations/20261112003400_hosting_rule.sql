-- The launch hosting rule (docs/superpowers/specs/2026-11-15-lean-core-design.md), replacing
-- recipes, followers and upvotes, which only made sense while recipes were central:
--
--   level 1  shared 3 posts (Cooked it)                      online Plans, up to 12 spots
--   level 2  shared 3 posts and an account 14 days or older  in-person Plans too, up to 12
--   level 3  staff-verified host                             up to 30 spots
--
-- Removed posts do not count. The thresholds stay rows in host_levels; host_level() keeps its
-- shape (the old counts are still returned, unused by the launch app) and adds the new ones.

alter table public.host_levels add column posts integer not null default 0;
alter table public.host_levels add column account_days integer not null default 0;
update public.host_levels set posts = 3, account_days = 0, max_capacity = 12 where level = 1;
update public.host_levels set posts = 3, account_days = 14 where level = 2;
-- Level 3 is reached only by staff verification, never by counts.
update public.host_levels set posts = 2147483647, account_days = 2147483647 where level = 3;

-- A member's level under the launch rule. One calculation for host_level(), person_profile()
-- and featured hosts, so they never disagree.
create function public.host_level_of(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_posts integer;
  v_days integer;
  v_row public.host_levels%rowtype;
  v_level integer := 0;
begin
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_verified_host) then
    return (select max(level) from public.host_levels);
  end if;
  select count(*)::int into v_posts from public.cooks where author_id = p_user_id and removed_at is null;
  select greatest(0, extract(day from now() - created_at))::int into v_days
  from public.profiles where id = p_user_id;
  for v_row in select * from public.host_levels order by level loop
    exit when v_posts < v_row.posts or coalesce(v_days, 0) < v_row.account_days;
    v_level := v_row.level;
  end loop;
  return v_level;
end;
$$;
revoke all on function public.host_level_of(uuid) from public, anon, authenticated;

create or replace function public.host_level()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p_user_id uuid := (select auth.uid());
  v_recipes integer;
  v_hosted integer;
  v_followers integer;
  v_upvotes integer;
  v_posts integer;
  v_days integer;
  v_level public.host_levels%rowtype;
  v_next public.host_levels%rowtype;
  v_current integer := 0;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select c.recipes, c.hosted, c.followers, c.upvotes
    into v_recipes, v_hosted, v_followers, v_upvotes from public.host_counts(p_user_id) c;
  select count(*)::int into v_posts from public.cooks where author_id = p_user_id and removed_at is null;
  select greatest(0, extract(day from now() - created_at))::int into v_days
  from public.profiles where id = p_user_id;

  v_current := public.host_level_of(p_user_id);
  select * into v_level from public.host_levels where level = v_current;
  select * into v_next from public.host_levels where level = v_current + 1;

  return jsonb_build_object(
    'level', v_current,
    'recipes', v_recipes, 'hosted', v_hosted, 'followers', v_followers, 'upvotes', v_upvotes,
    'posts', v_posts, 'account_days', coalesce(v_days, 0),
    'max_capacity', coalesce(v_level.max_capacity, 0),
    'in_person', coalesce(v_level.in_person, false),
    'group_orders', coalesce(v_level.group_orders, false),
    -- Level 3 is verification only, so it is never shown as the next step.
    'next', case when v_next.level is null or v_next.level = 3 then null else jsonb_build_object(
      'level', v_next.level, 'recipes', v_next.recipes, 'hosted', v_next.hosted,
      'followers', v_next.followers, 'upvotes', v_next.upvotes,
      'posts', v_next.posts, 'account_days', v_next.account_days,
      'max_capacity', v_next.max_capacity, 'in_person', v_next.in_person,
      'group_orders', v_next.group_orders) end);
end;
$$;

-- The profile shows the same level as everywhere else.
create or replace function public.person_profile(p_user_id uuid)
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
  -- A hidden person is shown only while they are asking you for something.
  if not v_person.people_visible
     and not (v_in and not v_out)
     and not exists (
       select 1 from public.message_requests r
       where r.from_id = p_user_id and r.to_id = v_uid and r.status = 'pending') then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  select name into v_city from public.cities where id = v_person.city_id;
  select c.recipes, c.hosted, c.followers, c.upvotes
    into v_recipes, v_hosted, v_followers, v_upvotes from public.host_counts(p_user_id) c;
  v_level := public.host_level_of(p_user_id);

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

-- Featured hosts: level 3 is staff verification only now.
create or replace function public.host_is_featured(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.is_verified_host);
$$;
revoke all on function public.host_is_featured(uuid) from public, anon, authenticated;
select public.host_featured_refresh_all();

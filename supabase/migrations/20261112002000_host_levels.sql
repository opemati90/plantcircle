-- Hosting is earned (design note docs/superpowers/specs/2026-11-14-hosting-levels-city-flow-design.md §2).
-- A host has shown up in the community first: shared recipes, a completed Plan with feedback,
-- followers, upvotes. The thresholds are rows, not code, so they can be tuned without a release.
--
--   level 0 Member  account                                   join, share recipes
--   level 1 Cook    1 recipe                                  online Plans, up to 6 spots
--   level 2 Host    3 recipes, 1 hosted Plan with feedback,   in-person Plans up to 12 spots,
--                   10 followers                              group orders
--   level 3 Pillar  100 followers, 2,000 recipe upvotes       up to 30 spots, featured
--
-- A staff-verified host (profiles.is_verified_host) is level 3 regardless.
--
-- What counts (against made-up accounts): a follower or voter counts only while their account is
-- active and they have shown up themselves (checked in at a Plan, or an account older than a
-- week); one voter adds at most 5 upvotes to an author. Suspended and deleted accounts can
-- neither follow nor vote (the standing triggers), and blocking removes follows both ways.
--
-- plan_create (20261112000500) and order_create (20261112001100) were edited in place to call
-- the checks below: no database had applied them yet (no Supabase project exists, see README).
-- Followers come from recipes (a reader follows the author); upvotes are one per member per
-- recipe, from members who can see it (Circle members), never the author.

create table public.host_levels (
  level integer primary key check (level between 1 and 3),
  recipes integer not null default 0,
  hosted integer not null default 0,
  followers integer not null default 0,
  upvotes integer not null default 0,
  max_capacity integer not null,
  in_person boolean not null default false,
  group_orders boolean not null default false
);
alter table public.host_levels enable row level security;
revoke all on public.host_levels from anon, authenticated;
grant select on public.host_levels to anon, authenticated;
create policy host_levels_select_all on public.host_levels for select to anon, authenticated using (true);

insert into public.host_levels (level, recipes, hosted, followers, upvotes, max_capacity, in_person, group_orders) values
  (1, 1, 0, 0, 0, 6, false, false),
  (2, 3, 1, 10, 0, 12, true, true),
  (3, 3, 1, 100, 2000, 30, true, true);

-- ---------------------------------------------------------------- follows

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index follows_followed on public.follows (followed_id);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;
create policy follows_own on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followed_id = (select auth.uid()));
create trigger follows_active before insert or update or delete on public.follows
  for each row execute function public.refuse_when_suspended();
create trigger follows_not_deleted before insert or update or delete on public.follows
  for each row execute function public.refuse_when_deleted();

-- A block ends the follows between the two, both ways.
create function public.follows_end_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followed_id = new.blocked_id)
     or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_end_follows after insert on public.blocks
  for each row execute function public.follows_end_on_block();

-- Follow or unfollow a member. Anyone you can see (a profile that is not deleted and has not
-- blocked you, nor you them). Idempotent by nature: the state after the call is what was asked.
create function public.follow_set(p_user_id uuid, p_on boolean)
returns jsonb
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
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if not p_on then
    -- Taking a follow back needs no access to the other person: it is the caller's own row.
    delete from public.follows where follower_id = v_uid and followed_id = p_user_id;
    return jsonb_build_object('following', false);
  end if;
  if p_user_id = v_uid
    or not exists (select 1 from public.profiles p where p.id = p_user_id and p.status <> 'deleted')
    or exists (select 1 from public.blocks b
               where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
                  or (b.blocker_id = p_user_id and b.blocked_id = v_uid))
  then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  insert into public.follows (follower_id, followed_id) values (v_uid, p_user_id)
  on conflict do nothing;
  return jsonb_build_object('following', true);
end;
$$;
revoke all on function public.follow_set(uuid, boolean) from public, anon;
grant execute on function public.follow_set(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- recipe votes

create table public.recipe_votes (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
alter table public.recipe_votes enable row level security;
revoke all on public.recipe_votes from anon, authenticated;
grant select on public.recipe_votes to authenticated;
create policy recipe_votes_own on public.recipe_votes for select to authenticated
  using (user_id = (select auth.uid()));
create trigger recipe_votes_active before insert or update or delete on public.recipe_votes
  for each row execute function public.refuse_when_suspended();
create trigger recipe_votes_not_deleted before insert or update or delete on public.recipe_votes
  for each row execute function public.refuse_when_deleted();
-- Counting by author (host_level) and by recipe (the cards).
create index recipes_author on public.recipes (author_id);

-- Upvote or take it back. Members who can see the recipe, never its author.
create function public.recipe_vote_set(p_recipe_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not p_on then
    -- Taking a vote back needs no access to the recipe any more: it is the caller's own row.
    delete from public.recipe_votes where recipe_id = p_recipe_id and user_id = v_uid;
    return jsonb_build_object('voted', false,
      'votes', (select count(*) from public.recipe_votes v where v.recipe_id = p_recipe_id));
  end if;
  select r.author_id into v_author from public.recipes r
  where r.id = p_recipe_id
    and (r.visibility = 'public' or public.circle_role(r.circle_id) is not null);
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_author = v_uid then
    raise exception 'own_recipe' using errcode = 'P0001';
  end if;
  insert into public.recipe_votes (recipe_id, user_id) values (p_recipe_id, v_uid)
  on conflict do nothing;
  return jsonb_build_object(
    'voted', true,
    'votes', (select count(*) from public.recipe_votes v where v.recipe_id = p_recipe_id));
end;
$$;
revoke all on function public.recipe_vote_set(uuid, boolean) from public, anon;
grant execute on function public.recipe_vote_set(uuid, boolean) to authenticated;

-- Recipe cards carry the vote count, the viewer's vote and whether the viewer follows the author.
create or replace view public.recipe_cards
with (security_invoker = false)
as
select
  r.id,
  r.circle_id,
  c.name as circle_name,
  r.author_id,
  p.display_name as author_name,
  r.title,
  r.cuisine,
  r.serves,
  r.minutes,
  r.intro,
  r.allergens,
  r.allergens_confirmed,
  r.created_at,
  r.title || ' ' || coalesce(r.cuisine, '') || ' ' || coalesce(r.intro, '') as search_text,
  (select count(*)::int from public.recipe_votes v where v.recipe_id = r.id) as votes,
  exists (select 1 from public.recipe_votes v where v.recipe_id = r.id and v.user_id = auth.uid()) as voted,
  exists (select 1 from public.follows f where f.followed_id = r.author_id and f.follower_id = auth.uid()) as following_author
from public.recipes r
join public.circles c on c.id = r.circle_id
left join public.profiles p on p.id = r.author_id
where r.visibility = 'public' or public.circle_role(r.circle_id) is not null;

-- ---------------------------------------------------------------- the level

-- A member's hosting level, what earned it, and the next step. `hosted` counts Plans the member
-- hosted that ended and got at least one piece of guest feedback.
-- Whether an account's follows and votes count towards someone's level: active, and has shown
-- up (checked in at a Plan) or is at least a week old.
create function public.contributor_counts(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active'
      and (p.created_at <= now() - interval '7 days'
           or exists (select 1 from public.rsvps r where r.user_id = p.id and r.state = 'checked_in')));
$$;

create function public.host_level()
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
  v_level public.host_levels%rowtype;
  v_next public.host_levels%rowtype;
  v_current integer := 0;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select count(*) into v_recipes from public.recipes r where r.author_id = p_user_id;
  select count(*) into v_hosted from public.plans p
  where p.host_id = p_user_id and p.status in ('published', 'changed', 'completed') and p.ends_at < now()
    and exists (select 1 from public.plan_feedback f where f.plan_id = p.id);
  select count(*) into v_followers from public.follows f
  where f.followed_id = p_user_id and public.contributor_counts(f.follower_id);
  select coalesce(sum(least(n, 5)), 0) into v_upvotes from (
    select count(*) as n from public.recipe_votes v
    join public.recipes r on r.id = v.recipe_id
    where r.author_id = p_user_id and public.contributor_counts(v.user_id)
    group by v.user_id) per_voter;

  -- A host staff verified (is_verified_host) has the top level whatever the counts.
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_verified_host) then
    select max(level) into v_current from public.host_levels;
  else
    for v_level in select * from public.host_levels order by level loop
      exit when v_recipes < v_level.recipes or v_hosted < v_level.hosted
        or v_followers < v_level.followers or v_upvotes < v_level.upvotes;
      v_current := v_level.level;
    end loop;
  end if;
  select * into v_level from public.host_levels where level = v_current;
  select * into v_next from public.host_levels where level = v_current + 1;

  return jsonb_build_object(
    'level', v_current,
    'recipes', v_recipes, 'hosted', v_hosted, 'followers', v_followers, 'upvotes', v_upvotes,
    'max_capacity', coalesce(v_level.max_capacity, 0),
    'in_person', coalesce(v_level.in_person, false),
    'group_orders', coalesce(v_level.group_orders, false),
    'next', case when v_next.level is null then null else jsonb_build_object(
      'level', v_next.level, 'recipes', v_next.recipes, 'hosted', v_next.hosted,
      'followers', v_next.followers, 'upvotes', v_next.upvotes,
      'max_capacity', v_next.max_capacity, 'in_person', v_next.in_person,
      'group_orders', v_next.group_orders) end);
end;
$$;
revoke all on function public.host_level() from public, anon;
grant execute on function public.host_level() to authenticated;

-- What a host may publish at their level. Raised from plan_create and order_create.
create function public.host_level_check(p_format public.plan_format, p_capacity integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := public.host_level();
begin
  if (v ->> 'level')::int = 0 then
    raise exception 'host_level_required' using errcode = 'P0001';
  end if;
  if p_format = 'in_person' and not (v ->> 'in_person')::boolean then
    raise exception 'host_level_in_person' using errcode = 'P0001';
  end if;
  if p_capacity > (v ->> 'max_capacity')::int then
    raise exception 'host_level_capacity' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.host_level_check(public.plan_format, integer) from public, anon, authenticated;

create function public.host_level_check_orders()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.host_level() ->> 'group_orders')::boolean then
    raise exception 'host_level_required' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.host_level_check_orders() from public, anon, authenticated;

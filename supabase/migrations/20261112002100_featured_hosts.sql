-- Featured hosts (design note §2, level 3 "Pillar"): their Plans carry a badge and come first
-- in Explore. The level is computed from the same counts as host_level(); a staff-verified host
-- is featured as well.

-- The counts behind a level, for one member. Shared by host_level() and host_is_featured().
create function public.host_counts(p_user_id uuid)
returns table (recipes integer, hosted integer, followers integer, upvotes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.recipes r where r.author_id = p_user_id),
    (select count(*)::int from public.plans p
      where p.host_id = p_user_id and p.status in ('published', 'changed', 'completed') and p.ends_at < now()
        and exists (select 1 from public.plan_feedback f where f.plan_id = p.id)),
    (select count(*)::int from public.follows f
      where f.followed_id = p_user_id and public.contributor_counts(f.follower_id)),
    (select coalesce(sum(least(n, 5)), 0)::int from (
      select count(*) as n from public.recipe_votes v
      join public.recipes r on r.id = v.recipe_id
      where r.author_id = p_user_id and public.contributor_counts(v.user_id)
      group by v.user_id) per_voter);
$$;
revoke all on function public.host_counts(uuid) from public, anon, authenticated;

-- Computed on writes that can change it (recipes, votes, follows, feedback, blocks) and nightly,
-- never per row of a public view: plan_cards reads profiles.featured_host.
create function public.host_is_featured(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.is_verified_host)
    or exists (
      select 1 from public.host_counts(p_user_id) c, public.host_levels l
      where l.level = (select max(level) from public.host_levels)
        and c.recipes >= l.recipes and c.hosted >= l.hosted
        and c.followers >= l.followers and c.upvotes >= l.upvotes);
$$;
revoke all on function public.host_is_featured(uuid) from public, anon, authenticated;

alter table public.profiles add column featured_host boolean not null default false;

create function public.host_featured_refresh(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set featured_host = public.host_is_featured(id)
  where id = p_user_id and featured_host is distinct from public.host_is_featured(id);
$$;
revoke all on function public.host_featured_refresh(uuid) from public, anon, authenticated;

-- Eligibility also moves with time (feedback lands, contributors age in): the cron refreshes
-- everyone featured now and everyone with enough followers to become featured.
create function public.host_featured_refresh_all()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_id uuid;
begin
  for v_id in
    select p.id from public.profiles p
    where p.featured_host
       or (select count(*) from public.follows f where f.followed_id = p.id)
          >= (select min(followers) from public.host_levels where level = (select max(level) from public.host_levels))
  loop
    perform public.host_featured_refresh(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.host_featured_refresh_all() from public, anon, authenticated;

create or replace function public.notifications_enqueue_due_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.web_rsvp_cleanup();
  perform public.host_featured_refresh_all();
  return public.notifications_enqueue_due();
end;
$$;

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
  -- People in line (waiting, or holding an offer).
  (select count(*)::int from public.rsvps r
    where r.plan_id = p.id and r.state in ('waitlisted', 'offered')) as waitlist_count,
  -- True when a spot can be taken directly: one is free and nobody is in line.
  (
    (select count(*) from public.rsvps r
      where r.plan_id = p.id and r.state in ('going', 'checked_in', 'offered')) < p.capacity
    and not exists (
      select 1 from public.rsvps r
      where r.plan_id = p.id and r.state in ('waitlisted', 'offered'))
  ) as has_open_spot,
  -- A level-3 or staff-verified host: shown first in Explore (design note §2).
  (h.is_verified_host or h.featured_host) as host_featured
from public.plans p
join public.plan_private pp on pp.plan_id = p.id
join public.profiles h on h.id = p.host_id
join public.cities c on c.id = p.city_id
where p.status <> 'draft';

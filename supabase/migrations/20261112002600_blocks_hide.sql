-- T-07 (docs/14): a block hides content both ways. Beyond People, direct chats and RSVPs
-- (20261112001200_safety.sql), the public read models now leave out what the other side made:
-- their Plans and group orders, their recipes, and their messages inside shared Plan and Circle
-- chats. Signed-out readers (auth.uid() is null) see everything, as before.

-- Postgres checks function privileges in a view against the caller, not the view owner, and
-- blocked_pair(uuid, uuid) stays private so nobody can probe other people's blocks. This wrapper
-- only ever answers for the caller's own pairs.
create function public.hidden_by_block(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and p_other is not null and public.blocked_pair(auth.uid(), p_other);
$$;
revoke all on function public.hidden_by_block(uuid) from public;
grant execute on function public.hidden_by_block(uuid) to anon, authenticated;

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
  (h.is_verified_host or h.featured_host) as host_featured
from public.plans p
join public.plan_private pp on pp.plan_id = p.id
join public.profiles h on h.id = p.host_id
join public.cities c on c.id = p.city_id
where p.status <> 'draft'
  and not public.hidden_by_block(p.host_id);

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
where (r.visibility = 'public' or public.circle_role(r.circle_id) is not null)
  and not public.hidden_by_block(r.author_id);

create or replace view public.order_cards
with (security_invoker = false)
as
select
  o.plan_id,
  p.title,
  p.description,
  p.host_id as organizer_id,
  h.display_name as organizer_name,
  p.city_id,
  p.status as plan_status,
  o.supplier_name,
  o.supplier_area,
  o.closes_at,
  o.pickup_start,
  o.pickup_end,
  o.pickup_note,
  p.tz,
  public.order_effective_state(o) as state,
  o.extended_once,
  (select coalesce(sum(oi.target), 0) from public.order_items oi where oi.plan_id = o.plan_id) as target_total,
  (select coalesce(sum(i.quantity), 0) from public.order_items oi
     join public.order_interests i on i.item_id = oi.id where oi.plan_id = o.plan_id) as interest_total,
  (select count(distinct i.user_id)::int from public.order_items oi
     join public.order_interests i on i.item_id = oi.id where oi.plan_id = o.plan_id and i.quantity > 0) as people_count
from public.group_orders o
join public.plans p on p.id = o.plan_id
join public.profiles h on h.id = p.host_id
where p.status <> 'draft'
  and not public.hidden_by_block(p.host_id);

create or replace view public.message_cards
with (security_invoker = false)
as
select m.id, m.conversation_id, m.sender_id, p.display_name as sender_name, m.body, m.created_at
from public.messages m
join public.profiles p on p.id = m.sender_id
where public.conversation_member(m.conversation_id)
  and not public.hidden_by_block(m.sender_id);

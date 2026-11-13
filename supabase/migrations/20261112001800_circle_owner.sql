-- Circle request screen (C1 gap): the card names who moderates the Circle, as the CircleRequest
-- design has it ("Moderated by Jonas K."). Appended so existing readers keep their columns.
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
  owner.display_name as owner_name
from public.circles c
left join public.cities city on city.id = c.city_id
left join public.profiles owner on owner.id = c.created_by and owner.status <> 'deleted'
where c.status = 'active'
  and (c.access <> 'invite' or public.circle_role(c.id) is not null);

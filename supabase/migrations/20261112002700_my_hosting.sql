-- My Plans → Hosting (docs/04 §My Plans): the Plans the signed-in member hosts. Clients cannot
-- read public.plans directly (reads go through plan_cards), so this view hands them the ids and
-- status of their own Plans; the cards themselves still come from plan_cards.
create view public.my_hosted_plans
with (security_invoker = false)
as
select p.id as plan_id, p.status, p.starts_at, p.ends_at
from public.plans p
where p.host_id = auth.uid();

grant select on public.my_hosted_plans to authenticated;

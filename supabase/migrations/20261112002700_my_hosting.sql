-- My Plans → Hosting (docs/04 §My Plans): the Plans the signed-in member hosts. Clients cannot
-- read public.plans directly (reads go through plan_cards), so this view hands them the ids and
-- status of their own Plans; the cards themselves still come from plan_cards, which never
-- returns drafts, so drafts stay out here too (the draft workflow is a separate backlog row).
create view public.my_hosted_plans
with (security_invoker = false)
as
select p.id as plan_id, p.status, p.starts_at, p.ends_at
from public.plans p
where p.host_id = auth.uid()
  and p.status <> 'draft';

-- Supabase's default privileges would make this simple view writable (a host could set a
-- Plan's status straight past the RPCs). Read only, members only.
revoke all on public.my_hosted_plans from public, anon, authenticated;
grant select on public.my_hosted_plans to authenticated;

-- My Plans windows and orders its candidates before the row limit, so the view carries the
-- Plan's times. Columns are appended; existing readers are unaffected.
create or replace view public.my_rsvps
with (security_invoker = false)
as
select
  r.plan_id,
  r.state as status,
  r.offer_expires_at,
  case when r.state in ('waitlisted', 'offered') then (
    select count(*)::int from public.rsvps ahead
    where ahead.plan_id = r.plan_id
      and ahead.state in ('waitlisted', 'offered')
      and ahead.queue_seq <= r.queue_seq
  ) end as waitlist_position,
  p.starts_at,
  p.ends_at
from public.rsvps r
join public.plans p on p.id = r.plan_id
where r.user_id = (select auth.uid());

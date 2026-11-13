-- Profile stats (C13). The counts on the identity card are whole counts from the database, not
-- the length of a capped list: Plans the member joined (going, checked in, or went) or hosted,
-- active Circle memberships, and mutual connections.

create function public.profile_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plans', (
      select count(*) from public.plans p
      where p.status <> 'draft' and (
        p.host_id = (select auth.uid())
        or exists (select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = (select auth.uid())
                   and r.state in ('going', 'checked_in', 'no_show')))),
    'circles', (
      select count(*) from public.circle_members m join public.circles c on c.id = m.circle_id
      where m.user_id = (select auth.uid()) and c.status = 'active'),
    'connections', (
      select count(*) from public.connections a join public.connections b
        on b.requester_id = a.addressee_id and b.addressee_id = a.requester_id
      where a.requester_id = (select auth.uid())));
$$;
revoke all on function public.profile_stats() from public, anon;
grant execute on function public.profile_stats() to authenticated;

-- Goals are the onboarding keys only.
alter table public.profiles add constraint profiles_goals_known
  check (goals <@ array['cook', 'meet', 'buy', 'online']::text[]);

-- Policy versions (C12). The Terms, Community Rules and Privacy Policy carry versions; a new
-- required version blocks the app with a summary of what changed until the member accepts it.
--
-- Decisions:
--  * Versions are rows the service role publishes with an effective date and a short summary of
--    changes. Members see a version once it is published; it blocks only once effective.
--  * An acceptance names a version that exists; the acceptance itself is the member's row (the
--    grant from the core migration still applies).
--  * The under-18 path stores nothing; it is only a screen. Age is self-declared at sign-up.

create table public.policy_versions (
  policy text not null check (policy in ('terms', 'community_rules', 'privacy')),
  version text not null check (char_length(version) between 1 and 20),
  effective_at timestamptz not null,
  published_at timestamptz not null default now(),
  required boolean not null default true,
  -- [{"title": ..., "note": ...}] in English; the app shows the localised copy for the keys it knows.
  summary jsonb not null default '[]',
  url text,
  primary key (policy, version)
);
alter table public.policy_versions enable row level security;
revoke all on public.policy_versions from anon, authenticated;
create policy policy_versions_read on public.policy_versions for select to anon, authenticated
  using (published_at <= now());
grant select on public.policy_versions to anon, authenticated;

insert into public.policy_versions (policy, version, effective_at, published_at, summary, url) values
  ('terms', '2026-11', '2026-11-01', '2026-11-01', '[]', 'https://plantcircle.app/legal/terms'),
  ('community_rules', '2026-11', '2026-11-01', '2026-11-01', '[]', 'https://plantcircle.app/legal/rules'),
  ('privacy', '2026-11', '2026-11-01', '2026-11-01', '[]', 'https://plantcircle.app/legal/privacy');

-- An acceptance must name a published version.
create function public.policy_acceptance_known()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.policy_versions v
                 where v.policy = new.policy and v.version = new.version and v.published_at <= now()) then
    raise exception 'unknown_policy_version' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.policy_acceptance_known() from public, anon, authenticated;
create trigger policy_acceptances_known before insert on public.policy_acceptances
  for each row execute function public.policy_acceptance_known();

-- The versions the member has not accepted yet, newest per policy, with whether they block now.
create function public.policies_pending()
returns table (policy text, version text, effective_at timestamptz, required boolean, blocking boolean,
  summary jsonb, url text, accepted_version text)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (v.policy) v.*
    from public.policy_versions v
    where v.published_at <= now()
    order by v.policy, v.effective_at desc, v.version desc
  ),
  mine as (
    select distinct on (a.policy) a.policy, a.version
    from public.policy_acceptances a
    where a.user_id = (select auth.uid())
    order by a.policy, a.accepted_at desc
  )
  select l.policy, l.version, l.effective_at, l.required,
    (l.required and l.effective_at <= now()) as blocking,
    l.summary, l.url, m.version
  from latest l
  left join mine m on m.policy = l.policy
  where (select auth.uid()) is not null
    and not exists (select 1 from public.policy_acceptances a
                    where a.user_id = (select auth.uid()) and a.policy = l.policy and a.version = l.version)
  order by l.policy;
$$;

-- Accept exactly the versions the screen showed. A version that is not pending (unpublished,
-- unknown, or already accepted) is refused, so a retry records what was shown and nothing newer.
create function public.policies_accept(p_versions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_versions) is distinct from 'array' or jsonb_array_length(p_versions) not between 1 and 10 then
    raise exception 'invalid_policy_set' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(p_versions) loop
    if not exists (select 1 from public.policy_versions v
                   where v.policy = v_item ->> 'policy' and v.version = v_item ->> 'version' and v.published_at <= now()) then
      raise exception 'unknown_policy_version' using errcode = 'P0001';
    end if;
    insert into public.policy_acceptances (user_id, policy, version)
    values (v_uid, v_item ->> 'policy', v_item ->> 'version')
    on conflict do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.policies_pending() from public, anon;
grant execute on function public.policies_pending() to authenticated;
revoke all on function public.policies_accept(jsonb) from public, anon;
grant execute on function public.policies_accept(jsonb) to authenticated;

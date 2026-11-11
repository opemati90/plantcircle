-- PlantCircle milestone 1: profiles, Plans, RSVPs, "bring something" claims.
--
-- Access model (deny by default):
--   * Every table has RLS enabled and all default grants revoked; only the
--     privileges granted below exist for the `anon` and `authenticated` roles.
--   * Writes that need invariants (capacity, one RSVP per person, claim limits)
--     go through SECURITY DEFINER functions that lock the parent row.
--   * Public, aggregated read models are exposed as owner-rights views so that
--     counts and first initials are visible without exposing the RSVP rows.
--   * A Plan's exact address lives in its own table and is only readable by the
--     host, or by confirmed guests from 24 hours before the start.

create type public.plan_category as enum ('cooking_class', 'potluck', 'social', 'online_class');
create type public.plan_status as enum ('published', 'cancelled');
create type public.rsvp_status as enum ('going', 'cancelled');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  city text not null default 'Berlin' check (char_length(city) between 1 and 60),
  goals text[] not null default '{}' check (cardinality(goals) <= 8),
  is_verified_host boolean not null default false,
  -- FR-01: which policy version was accepted, and when. Set once, server-side clock.
  terms_version text not null check (char_length(terms_version) between 1 and 20),
  terms_accepted_at timestamptz not null default now(),
  age_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
-- Column grants: a member can never set is_verified_host or back-date acceptance.
grant select on public.profiles to authenticated;
grant insert (id, display_name, city, goals, terms_version) on public.profiles to authenticated;
grant update (display_name, city, goals) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ------------------------------------------------------------------- plans
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 80),
  category public.plan_category not null,
  city text not null check (char_length(city) between 1 and 60),
  area_name text not null check (char_length(area_name) between 1 and 60),
  venue_name text check (char_length(venue_name) <= 80),
  area_hint text check (char_length(area_hint) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  capacity integer not null check (capacity between 1 and 500),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency char(3) not null default 'EUR',
  description text not null check (char_length(description) <= 2000),
  -- null means "not confirmed by the host"; the UI must never render that as safe.
  allergens text check (char_length(allergens) <= 300),
  image_path text check (image_path ~ '^(/|https://)'),
  image_alt text check (char_length(image_alt) <= 200),
  image_focus text check (image_focus ~ '^[0-9]{1,3}% (center|top|bottom)$'),
  status public.plan_status not null default 'published',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index plans_city_starts_idx on public.plans (city, starts_at) where status = 'published';
create index plans_host_idx on public.plans (host_id);

alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated;
-- No direct table access for clients in this milestone: reads go through
-- plan_cards, and creating Plans is not built yet.

create table public.plan_private (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  address text not null check (char_length(address) between 1 and 200)
);

alter table public.plan_private enable row level security;
revoke all on public.plan_private from anon, authenticated;
grant select on public.plan_private to authenticated;

-- ------------------------------------------------------------------- rsvps
create table public.rsvps (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create index rsvps_user_idx on public.rsvps (user_id, status);

alter table public.rsvps enable row level security;
revoke all on public.rsvps from anon, authenticated;
grant select on public.rsvps to authenticated;

create policy rsvps_select_own on public.rsvps
  for select to authenticated using (user_id = (select auth.uid()));

-- Helper used by policies. SECURITY DEFINER so the policy on plan_private does
-- not depend on the caller's own visibility of rsvps/plans.
create function public.can_see_address(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plans p
    where p.id = p_plan_id
      and (
        p.host_id = (select auth.uid())
        or (
          now() >= p.starts_at - interval '24 hours'
          and p.status = 'published'
          and exists (
            select 1 from public.rsvps r
            where r.plan_id = p.id and r.user_id = (select auth.uid()) and r.status = 'going'
          )
        )
      )
  );
$$;

create policy plan_private_select_confirmed on public.plan_private
  for select to authenticated using (public.can_see_address(plan_id));

-- ----------------------------------------------------------- bring something
create table public.bring_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  quantity integer not null default 1 check (quantity between 1 and 20),
  position integer not null default 0
);

create index bring_items_plan_idx on public.bring_items (plan_id, position);

alter table public.bring_items enable row level security;
revoke all on public.bring_items from anon, authenticated;

create table public.bring_claims (
  item_id uuid not null references public.bring_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index bring_claims_user_idx on public.bring_claims (user_id);

alter table public.bring_claims enable row level security;
revoke all on public.bring_claims from anon, authenticated;
grant select on public.bring_claims to authenticated;

create policy bring_claims_select_own on public.bring_claims
  for select to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------------------------- read models
-- Owner-rights views (security_invoker = false is deliberate): they publish
-- only non-sensitive columns and aggregates of published Plans.
create view public.plan_cards
with (security_invoker = false)
as
select
  p.id,
  p.title,
  p.category,
  p.city,
  p.area_name,
  p.venue_name,
  p.area_hint,
  p.starts_at,
  p.ends_at,
  p.timezone,
  p.capacity,
  p.price_cents,
  p.currency,
  p.description,
  p.allergens,
  p.image_path,
  p.image_alt,
  p.image_focus,
  h.display_name as host_name,
  h.is_verified_host as host_verified,
  (select count(*)::int from public.plans hp
    where hp.host_id = p.host_id and hp.status = 'published') as host_plans_count,
  (select count(*)::int from public.rsvps r
    where r.plan_id = p.id and r.status = 'going') as going_count,
  coalesce(
    (select array_agg(upper(left(a.display_name, 1)) order by a.joined_at)
     from (
       select g.display_name, r.joined_at
       from public.rsvps r
       join public.profiles g on g.id = r.user_id
       where r.plan_id = p.id and r.status = 'going'
       order by r.joined_at
       limit 3
     ) a),
    '{}'
  ) as attendee_initials,
  (select coalesce(sum(greatest(
      i.quantity - (select count(*) from public.bring_claims c where c.item_id = i.id), 0)), 0)::int
    from public.bring_items i where i.plan_id = p.id) as open_bring_slots
from public.plans p
join public.profiles h on h.id = p.host_id
where p.status = 'published';

revoke all on public.plan_cards from anon, authenticated;
grant select on public.plan_cards to anon, authenticated;

create view public.bring_item_cards
with (security_invoker = false)
as
select
  i.id,
  i.plan_id,
  i.label,
  i.quantity,
  i.position,
  (select count(*)::int from public.bring_claims c where c.item_id = i.id) as claimed_count,
  coalesce(
    (select array_agg(g.display_name order by c.created_at)
     from public.bring_claims c
     join public.profiles g on g.id = c.user_id
     where c.item_id = i.id),
    '{}'
  ) as claimed_by
from public.bring_items i
join public.plans p on p.id = i.plan_id
where p.status = 'published';

revoke all on public.bring_item_cards from anon, authenticated;
grant select on public.bring_item_cards to anon, authenticated;

-- ------------------------------------------------------------------ writes
-- join_plan: idempotent; serialises concurrent joins by locking the Plan row,
-- so capacity can never be exceeded.
create function public.join_plan(p_plan_id uuid)
returns public.rsvp_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.rsvp_status;
  v_going integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or v_plan.status <> 'published' then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_plan.ends_at <= now() then
    raise exception 'plan_ended' using errcode = 'P0001';
  end if;
  if v_plan.host_id = v_uid then
    raise exception 'host_cannot_join' using errcode = 'P0001';
  end if;

  select status into v_existing
  from public.rsvps where plan_id = p_plan_id and user_id = v_uid;
  if v_existing = 'going' then
    return v_existing;
  end if;

  select count(*) into v_going
  from public.rsvps where plan_id = p_plan_id and status = 'going';
  if v_going >= v_plan.capacity then
    raise exception 'plan_full' using errcode = 'P0001';
  end if;

  insert into public.rsvps (plan_id, user_id, status)
  values (p_plan_id, v_uid, 'going')
  on conflict (plan_id, user_id)
  do update set status = 'going', joined_at = now(), updated_at = now();

  return 'going';
end;
$$;

-- cancel_rsvp: idempotent; also releases anything the member said they'd bring.
create function public.cancel_rsvp(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform 1 from public.plans where id = p_plan_id for update;

  update public.rsvps
  set status = 'cancelled', updated_at = now()
  where plan_id = p_plan_id and user_id = v_uid and status = 'going';

  delete from public.bring_claims c
  using public.bring_items i
  where c.item_id = i.id and i.plan_id = p_plan_id and c.user_id = v_uid;
end;
$$;

-- claim_bring_item: only confirmed guests; never more claims than the quantity.
create function public.claim_bring_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.bring_items%rowtype;
  v_claimed integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_item from public.bring_items where id = p_item_id for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.rsvps
    where plan_id = v_item.plan_id and user_id = v_uid and status = 'going'
  ) then
    raise exception 'rsvp_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bring_claims where item_id = p_item_id and user_id = v_uid) then
    return;
  end if;

  select count(*) into v_claimed from public.bring_claims where item_id = p_item_id;
  if v_claimed >= v_item.quantity then
    raise exception 'item_taken' using errcode = 'P0001';
  end if;

  insert into public.bring_claims (item_id, user_id) values (p_item_id, v_uid);
end;
$$;

revoke all on function public.join_plan(uuid) from public, anon;
revoke all on function public.cancel_rsvp(uuid) from public, anon;
revoke all on function public.claim_bring_item(uuid) from public, anon;
revoke all on function public.can_see_address(uuid) from public, anon;
grant execute on function public.join_plan(uuid) to authenticated;
grant execute on function public.cancel_rsvp(uuid) to authenticated;
grant execute on function public.claim_bring_item(uuid) to authenticated;
grant execute on function public.can_see_address(uuid) to authenticated;

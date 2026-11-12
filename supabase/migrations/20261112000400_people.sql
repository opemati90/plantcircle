-- People (C3). Off by default: a member appears only if they chose to be visible, and then only to
-- members of a Circle they share. Connecting records intent; it is mutual once both sides connect.

alter table public.profiles add column people_visible boolean not null default false;
grant update (people_visible) on public.profiles to authenticated;

create table public.connections (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Whether a person is visible in People, for policies that must not read profiles directly.
create function public.person_is_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and people_visible);
$$;

alter table public.connections enable row level security;
-- You always see requests you sent. A request you received shows only while its sender is visible.
create policy connections_read on public.connections for select to authenticated
  using (
    requester_id = (select auth.uid())
    or (addressee_id = (select auth.uid()) and public.person_is_visible(requester_id))
  );
revoke all on public.connections from anon, authenticated;
grant select on public.connections to authenticated;

-- Visible people who share at least one active Circle with the viewer, with the Circles they share
-- and where the connection stands from the viewer's side.
create function public.people_in_my_circles()
returns table (
  user_id uuid,
  display_name text,
  city text,
  circle_names text[],
  connection text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  shared as (
    select m2.user_id, array_agg(distinct c.name order by c.name) as names
    from public.circle_members m1
    join public.circles c on c.id = m1.circle_id and c.status = 'active'
    join public.circle_members m2 on m2.circle_id = m1.circle_id and m2.user_id <> m1.user_id
    where m1.user_id = (select id from me)
    group by m2.user_id
  )
  select
    p.id,
    p.display_name,
    home.name,
    s.names,
    case
      when out_c.addressee_id is not null and in_c.requester_id is not null then 'connected'
      when out_c.addressee_id is not null then 'requested'
      when in_c.requester_id is not null then 'requested_by_them'
      else 'none'
    end
  from shared s
  join public.profiles p on p.id = s.user_id and p.people_visible
  left join public.cities home on home.id = p.city_id
  left join public.connections out_c
    on out_c.requester_id = (select id from me) and out_c.addressee_id = p.id
  left join public.connections in_c
    on in_c.addressee_id = (select id from me) and in_c.requester_id = p.id
  order by p.display_name;
$$;

-- Connect with a visible person who shares a Circle with you. Both sides connecting makes it mutual.
-- The pair is locked, so two connects at the same moment cannot both read "requested".
create function public.person_connect(p_user_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fingerprint text := 'person_connect:' || p_user_id::text;
  v_replay jsonb;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if p_user_id = v_uid then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext(least(v_uid, p_user_id)::text || greatest(v_uid, p_user_id)::text));

  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  if not public.person_is_visible(p_user_id)
    or not exists (
      select 1 from public.circle_members m1
      join public.circles c on c.id = m1.circle_id and c.status = 'active'
      join public.circle_members m2 on m2.circle_id = m1.circle_id
      where m1.user_id = v_uid and m2.user_id = p_user_id)
  then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;

  insert into public.connections (requester_id, addressee_id)
  values (v_uid, p_user_id)
  on conflict (requester_id, addressee_id) do nothing;

  v_status := case when exists (
    select 1 from public.connections where requester_id = p_user_id and addressee_id = v_uid)
    then 'connected' else 'requested' end;

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('status', v_status));
end;
$$;

revoke all on function public.people_in_my_circles() from public, anon;
grant execute on function public.people_in_my_circles() to authenticated;
revoke all on function public.person_is_visible(uuid) from public, anon;
grant execute on function public.person_is_visible(uuid) to authenticated;
revoke all on function public.person_connect(uuid, uuid) from public, anon;
grant execute on function public.person_connect(uuid, uuid) to authenticated;

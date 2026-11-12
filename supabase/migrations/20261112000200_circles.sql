-- Circles (C1): communities people join openly, by request, or by invitation.
--
--   * open: join at once. request: ask, a moderator approves. invite: members only,
--     never listed publicly (the spec's AC-15: private content never appears in search).
--   * Members see each other's Circle role; the public sees counts only.
--   * Creating a Circle is limited to 3 a day per member (spec: rate-limit to stop spam).
--   * Every state change runs in a function that checks the caller's role on that Circle.

create type public.circle_access as enum ('open', 'request', 'invite');

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  tagline text check (char_length(tagline) <= 120),
  -- null city with is_global means worldwide; otherwise a city chapter.
  city_id uuid references public.cities (id) on delete set null,
  is_global boolean not null default false,
  access public.circle_access not null default 'open',
  join_question text check (char_length(join_question) <= 300),
  created_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  check (is_global or city_id is not null or access = 'invite')
);

alter table public.circles enable row level security;
revoke all on public.circles from anon, authenticated;

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator', 'owner')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create index circle_members_user_idx on public.circle_members (user_id);

alter table public.circle_members enable row level security;
revoke all on public.circle_members from anon, authenticated;
grant select on public.circle_members to authenticated;

create policy circle_members_select_own on public.circle_members
  for select to authenticated using (user_id = (select auth.uid()));

create table public.circle_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text check (char_length(answer) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);

-- One open request per person and Circle. A declined person may ask again later.
create unique index circle_requests_one_pending on public.circle_requests (circle_id, user_id)
  where status = 'pending';

alter table public.circle_requests enable row level security;
revoke all on public.circle_requests from anon, authenticated;
grant select on public.circle_requests to authenticated;

create policy circle_requests_select_own on public.circle_requests
  for select to authenticated using (user_id = (select auth.uid()));

-- Helper: the caller's role on a Circle (null if not a member). Definer, so policies can use it.
create function public.circle_role(p_circle_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.circle_members m
  where m.circle_id = p_circle_id and m.user_id = (select auth.uid());
$$;

-- Public listing: open and request Circles to everyone; invite-only Circles only to members.
create view public.circle_cards
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
  c.name || ' ' || coalesce(c.tagline, '') as search_text
from public.circles c
left join public.cities city on city.id = c.city_id
where c.status = 'active'
  and (c.access <> 'invite' or public.circle_role(c.id) is not null);

revoke all on public.circle_cards from anon, authenticated;
grant select on public.circle_cards to anon, authenticated;

-- Creating a Circle. The creator becomes its owner. Rate-limited to 3 a day.
create function public.circle_create(
  p_name text,
  p_tagline text,
  p_city_id uuid,
  p_is_global boolean,
  p_access public.circle_access,
  p_join_question text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_recent integer;
  v_replay jsonb;
  v_fingerprint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_fingerprint := 'circle_create:' || jsonb_build_object(
    'name', p_name, 'tagline', p_tagline, 'city', p_city_id,
    'global', p_is_global, 'access', p_access, 'question', p_join_question)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  -- Serialise creation per member before counting, so concurrent calls cannot both pass the limit.
  perform 1 from public.profiles where id = v_uid for update;
  select count(*) into v_recent from public.circles
  where created_by = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.circles
    (name, tagline, city_id, is_global, access, join_question, created_by)
  values (p_name, p_tagline, p_city_id, p_is_global, p_access, p_join_question, v_uid)
  returning id into v_id;
  insert into public.circle_members (circle_id, user_id, role) values (v_id, v_uid, 'owner');

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;

-- Joining. Open Circles admit at once; request Circles record a pending request;
-- invite-only Circles cannot be joined by asking (the invitation flow comes later).
create function public.circle_join(p_circle_id uuid, p_answer text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_circle public.circles%rowtype;
  v_status text;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  select * into v_circle from public.circles where id = p_circle_id and status = 'active'
  for update;
  if not found or v_circle.access = 'invite' then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, 'circle_join:' || p_circle_id::text);
  if v_replay is not null then
    return v_replay;
  end if;

  if public.circle_role(p_circle_id) is not null then
    v_status := 'member';
  elsif v_circle.access = 'open' then
    insert into public.circle_members (circle_id, user_id, role) values (p_circle_id, v_uid, 'member');
    v_status := 'member';
  else
    insert into public.circle_requests (circle_id, user_id, answer)
    values (p_circle_id, v_uid, p_answer)
    on conflict (circle_id, user_id) where status = 'pending' do nothing;
    v_status := 'requested';
  end if;

  return public.idempotent_store(
    p_idempotency_key, 'circle_join:' || p_circle_id::text, jsonb_build_object('status', v_status));
end;
$$;

-- Moderators and owners read the requests waiting on their Circle, with the asker's name.
create function public.circle_pending_requests(p_circle_id uuid)
returns table (request_id uuid, display_name text, answer text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.circle_role(p_circle_id), 'none') not in ('moderator', 'owner') then
    raise exception 'not_moderator' using errcode = '42501';
  end if;
  return query
    select r.id, p.display_name, r.answer, r.created_at
    from public.circle_requests r
    join public.profiles p on p.id = r.user_id
    where r.circle_id = p_circle_id and r.status = 'pending'
    order by r.created_at
    limit 100;
end;
$$;

-- A moderator or owner approves or declines. Declining is silent: nothing is sent to the asker.
-- The Circle is locked before the request, the same order joining uses, so they cannot deadlock.
create function public.circle_request_respond(
  p_request_id uuid,
  p_approve boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_circle_id uuid;
  v_request public.circle_requests%rowtype;
  v_replay jsonb;
  v_fingerprint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select circle_id into v_circle_id from public.circle_requests where id = p_request_id;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.circles where id = v_circle_id for update;
  select * into v_request from public.circle_requests where id = p_request_id for update;

  v_fingerprint := 'circle_request_respond:' || p_request_id::text || ':' || p_approve::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if coalesce(public.circle_role(v_request.circle_id), 'none') not in ('moderator', 'owner') then
    raise exception 'not_moderator' using errcode = '42501';
  end if;

  update public.circle_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_by = v_uid, decided_at = now()
  where id = p_request_id;
  if p_approve then
    insert into public.circle_members (circle_id, user_id, role)
    values (v_request.circle_id, v_request.user_id, 'member')
    on conflict (circle_id, user_id) do nothing;
  end if;

  return public.idempotent_store(
    p_idempotency_key,
    v_fingerprint,
    jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end));
end;
$$;

revoke all on function public.circle_role(uuid) from public;
revoke all on function public.circle_create(text, text, uuid, boolean, public.circle_access, text, uuid) from public, anon;
revoke all on function public.circle_join(uuid, text, uuid) from public, anon;
revoke all on function public.circle_request_respond(uuid, boolean, uuid) from public, anon;
revoke all on function public.circle_pending_requests(uuid) from public, anon;
-- Granted to anon too: the public listing calls it for visitors, and it returns null for them.
grant execute on function public.circle_role(uuid) to anon, authenticated;
grant execute on function public.circle_create(text, text, uuid, boolean, public.circle_access, text, uuid) to authenticated;
grant execute on function public.circle_join(uuid, text, uuid) to authenticated;
grant execute on function public.circle_request_respond(uuid, boolean, uuid) to authenticated;
grant execute on function public.circle_pending_requests(uuid) to authenticated;

-- The weekly Circle challenge and cooking streaks
-- (docs/superpowers/specs/2026-11-15-challenges-sharing-design.md, slices 2a and 2b).
--
-- Every Circle has a challenge every week. Owners and moderators may set the theme for the
-- current week; otherwise the app shows a default theme picked by week number (translated copy,
-- so the database stores only custom themes). A week starts Monday 00:00 in the Circle's city
-- time zone, UTC for global Circles. A post is an entry when its author says so, for the week
-- the composer showed (a draft from Sunday sent on Monday is refused, not moved to a new
-- theme); it keeps that week and the theme it was posted under, even if the theme changes.
--
-- Streaks count UTC weeks with at least one post (any Circle), for the member themselves only.
-- They never count toward hosting.

create table public.circle_challenges (
  circle_id uuid not null references public.circles (id) on delete cascade,
  week_start date not null,
  theme text not null check (char_length(theme) between 1 and 40),
  set_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (circle_id, week_start)
);
alter table public.circle_challenges enable row level security;
revoke all on public.circle_challenges from anon, authenticated;

alter table public.cooks add column challenge_week date;
-- The custom theme the entry was posted under (null: the week's default theme).
alter table public.cooks add column challenge_theme text;
create index cooks_challenge on public.cooks (circle_id, challenge_week) where challenge_week is not null;

-- The Circle's time zone: its city's, or UTC for a global Circle.
create function public.circle_tz(p_circle_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select ci.tz from public.circles c join public.cities ci on ci.id = c.city_id
                   where c.id = p_circle_id), 'UTC');
$$;
revoke all on function public.circle_tz(uuid) from public, anon, authenticated;

-- Monday of the week `p_at` falls in, in the Circle's time zone.
create function public.circle_week_start(p_circle_id uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('week', p_at at time zone public.circle_tz(p_circle_id))::date;
$$;
revoke all on function public.circle_week_start(uuid, timestamptz) from public, anon, authenticated;

-- This week's challenge in a Circle, for its members: the week, when it ends, the custom theme
-- (null means the app's default for the week), how many members entered, and up to four entries.
create function public.circle_challenge(p_circle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week date;
  v_tz text;
begin
  if not public.circle_active_member(p_circle_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  v_tz := public.circle_tz(p_circle_id);
  v_week := public.circle_week_start(p_circle_id, now());
  return jsonb_build_object(
    'week_start', v_week,
    'ends_at', ((v_week + 7)::timestamp at time zone v_tz),
    'theme', (select theme from public.circle_challenges where circle_id = p_circle_id and week_start = v_week),
    'can_set', public.circle_role(p_circle_id) in ('owner', 'moderator'),
    'entrants', (select count(distinct k.author_id)::int from public.cook_cards k
                 where k.circle_id = p_circle_id and k.challenge_week = v_week),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'photo_path', e.photo_path, 'caption', e.caption,
        'author_name', e.author_name) order by e.created_at desc)
      from (select k.id, k.photo_path, k.caption, k.author_name, k.created_at from public.cook_cards k
            where k.circle_id = p_circle_id and k.challenge_week = v_week
            order by k.created_at desc limit 4) e), '[]'::jsonb));
end;
$$;
revoke all on function public.circle_challenge(uuid) from public, anon;
grant execute on function public.circle_challenge(uuid) to authenticated;

-- An owner or moderator sets the theme for the week they were looking at, or clears it (null) to
-- go back to the default. A save meant for a week that has ended is refused, and a retried save
-- replays its first answer instead of touching the new week.
create function public.circle_challenge_set(
  p_circle_id uuid,
  p_week_start date,
  p_theme text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_theme text := nullif(public.text_trim(p_theme), '');
  v_fingerprint text := 'circle_challenge_set:' || jsonb_build_object(
    'circle', p_circle_id, 'week', p_week_start, 'theme', nullif(public.text_trim(p_theme), ''))::text;
  v_replay jsonb;
  v_week date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if not public.circle_active_member(p_circle_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  if public.circle_role(p_circle_id) not in ('owner', 'moderator') then
    raise exception 'not_moderator' using errcode = 'P0001';
  end if;
  if public.is_suspended(v_uid) then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_theme, '')) > 40 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  v_week := public.circle_week_start(p_circle_id, now());
  if p_week_start is distinct from v_week then
    raise exception 'challenge_ended' using errcode = 'P0001';
  end if;
  if v_theme is null then
    delete from public.circle_challenges where circle_id = p_circle_id and week_start = v_week;
  else
    insert into public.circle_challenges (circle_id, week_start, theme, set_by)
    values (p_circle_id, v_week, v_theme, v_uid)
    on conflict (circle_id, week_start) do update set theme = excluded.theme, set_by = excluded.set_by,
      created_at = now();
  end if;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, detail)
  values (v_uid, public.circle_role(p_circle_id), 'circle.challenge_set', 'circle', p_circle_id,
    jsonb_build_object('week', v_week, 'theme', v_theme));
  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('week_start', v_week, 'theme', v_theme));
end;
$$;
revoke all on function public.circle_challenge_set(uuid, date, text, uuid) from public, anon;
grant execute on function public.circle_challenge_set(uuid, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------- entries

-- cook_create gains the challenge week. The six-argument version stays for app builds that
-- still call it (20261112003100 is live on staging), forwarding with no challenge; without a week
-- the request fingerprint is the old one, so a retry across the two replays correctly.

create function public.cook_create(
  p_circle_id uuid,
  p_recipe_id uuid,
  p_caption text,
  p_photo_path text,
  p_photo_alt text,
  p_challenge_week date,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_caption text := public.text_trim(p_caption);
  v_alt text := nullif(public.text_trim(p_photo_alt), '');
  v_fingerprint text;
  v_replay jsonb;
  v_upload public.cook_uploads%rowtype;
  v_id uuid;
  v_week date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_fingerprint := 'cook_create:' || (jsonb_build_object(
    'circle', p_circle_id, 'recipe', p_recipe_id, 'caption', v_caption, 'path', p_photo_path,
    'alt', v_alt)
    || case when p_challenge_week is null then '{}'::jsonb
            else jsonb_build_object('challenge', p_challenge_week) end)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  if not public.circle_active_member(p_circle_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  if char_length(coalesce(v_caption, '')) not between 1 and 140
    or char_length(coalesce(v_alt, '')) > 200 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- An entry only for the week the member saw: the week may have turned since.
  if p_challenge_week is not null then
    v_week := public.circle_week_start(p_circle_id, now());
    if p_challenge_week <> v_week then
      raise exception 'challenge_ended' using errcode = 'P0001';
    end if;
  end if;
  -- A recipe shared in the same Circle, so everyone who sees the post can open it.
  if p_recipe_id is not null and not exists (
    select 1 from public.recipes r where r.id = p_recipe_id and r.circle_id = p_circle_id) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- The caller's own upload, stored, recent and not used.
  select * into v_upload from public.cook_uploads
  where photo_path = p_photo_path and user_id = v_uid for update;
  if not found or v_upload.stored_at is null or v_upload.used_at is not null
    or v_upload.created_at < now() - interval '12 hours' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('cook_create:' || v_uid::text));
  if (select count(*) from public.cook_post_log
      where user_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  update public.cook_uploads set used_at = now() where photo_path = p_photo_path;
  insert into public.cooks (author_id, circle_id, recipe_id, caption, photo_path, photo_alt, width, height,
    challenge_week, challenge_theme)
  values (v_uid, p_circle_id, p_recipe_id, v_caption, p_photo_path, v_alt, v_upload.width, v_upload.height,
    v_week,
    (select theme from public.circle_challenges where circle_id = p_circle_id and week_start = v_week))
  returning id into v_id;
  insert into public.cook_post_log (user_id) values (v_uid);

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;
revoke all on function public.cook_create(uuid, uuid, text, text, text, date, uuid) from public, anon;
grant execute on function public.cook_create(uuid, uuid, text, text, text, date, uuid) to authenticated;

create or replace function public.cook_create(
  p_circle_id uuid,
  p_recipe_id uuid,
  p_caption text,
  p_photo_path text,
  p_photo_alt text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.cook_create(p_circle_id, p_recipe_id, p_caption, p_photo_path, p_photo_alt,
    null::date, p_idempotency_key);
$$;
revoke all on function public.cook_create(uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.cook_create(uuid, uuid, text, text, text, uuid) to authenticated;

-- The feed carries the entry's week and the custom theme it was posted under (null: the default).
create or replace view public.cook_cards
with (security_invoker = false)
as
select
  k.id,
  k.circle_id,
  c.name as circle_name,
  k.author_id,
  p.display_name as author_name,
  k.recipe_id,
  rc.title as recipe_title,
  k.caption,
  k.photo_path,
  k.photo_alt,
  k.width,
  k.height,
  k.created_at,
  (select count(*)::int from public.cook_reactions r where r.cook_id = k.id) as reactions,
  exists (select 1 from public.cook_reactions r where r.cook_id = k.id and r.user_id = auth.uid()) as reacted,
  k.challenge_week,
  k.challenge_theme
from public.cooks k
join public.circles c on c.id = k.circle_id
join public.profiles p on p.id = k.author_id and p.status = 'active'
left join public.recipe_cards rc on rc.id = k.recipe_id
where k.removed_at is null
  and public.circle_active_member(k.circle_id)
  and not public.hidden_by_block(k.author_id);

-- ---------------------------------------------------------------- streaks

-- The caller's own weeks with a post (UTC, Monday start): the current run, ending this week or
-- last week (so it does not break on Monday morning), the best run, and how many weeks in all.
create function public.cook_streak()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_this date := date_trunc('week', now() at time zone 'UTC')::date;
  v_current integer := 0;
  v_best integer := 0;
  v_run integer := 0;
  v_total integer := 0;
  v_prev date;
  v_week date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  for v_week in
    select distinct date_trunc('week', created_at at time zone 'UTC')::date
    from public.cooks where author_id = v_uid and removed_at is null
    order by 1
  loop
    v_total := v_total + 1;
    v_run := case when v_prev is not null and v_week = v_prev + 7 then v_run + 1 else 1 end;
    v_best := greatest(v_best, v_run);
    v_prev := v_week;
  end loop;
  if v_prev is not null and v_prev >= v_this - 7 then
    v_current := v_run;
  end if;
  return jsonb_build_object('current', v_current, 'best', v_best, 'weeks', v_total);
end;
$$;
revoke all on function public.cook_streak() from public, anon;
grant execute on function public.cook_streak() to authenticated;

-- The Monday notice leads with the week's challenge
-- (docs/superpowers/specs/2026-11-15-retention-invites-analytics-design.md §1).
--
-- One notice a week, as before (Monday 09:00 to 11:59 local, once per ISO week), and now only
-- with reminders on, for the Inbox line too. A member of a Circle hears their first active
-- Circle's theme (by name, the Circle This week shows) for the week starting on the member's own
-- Monday, so a Circle in another time zone never announces last week's theme; with the Plans line
-- when there are Plans. Members without a Circle keep the Plans notice and get nothing when there
-- are none. Default themes travel as a key, translated when the push is sent; a custom theme
-- travels as written. With lock-screen text off, push-dispatch sends a generic title and body.
--
-- Also fixes the local clock: `at time zone` gives a timestamp without zone, which the old
-- version stored in a timestamptz and so depended on the session's time zone.

-- The default theme's key for a week: the same rotation as the app (challengeThemes.ts).
create function public.challenge_default_key(p_week_start date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['lentils', 'greens', 'onePot', 'streetFood', 'breakfast', 'spice', 'budget',
                'leftovers', 'soup', 'baking', 'grains', 'roots'])[
    ((((p_week_start - date '2026-01-05') / 7) % 12) + 12) % 12 + 1];
$$;
revoke all on function public.challenge_default_key(date) from public, anon, authenticated;

create or replace function public.weekly_digest_enqueue(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_in_city integer;
  v_online integer;
  v_local timestamp;
  v_week text;
  v_body text;
  v_title text;
  v_online_all integer;
  v_circle_id uuid;
  v_circle_name text;
  v_monday date;
  v_theme text;
  v_payload jsonb;
begin
  -- Plans in the coming week, once: online everywhere, in person per city.
  create temp table if not exists digest_city_counts (city_id uuid primary key, n integer) on commit drop;
  truncate digest_city_counts;
  insert into digest_city_counts
    select pl.city_id, count(*) from public.plans pl
    where pl.format = 'in_person' and pl.status in ('published', 'changed')
      and pl.starts_at between p_now and p_now + interval '7 days'
    group by pl.city_id;
  select count(*) into v_online_all from public.plans pl
  where pl.format = 'online' and pl.status in ('published', 'changed')
    and pl.starts_at between p_now and p_now + interval '7 days';

  for v_row in
    select p.id, p.city_id, c.name as city, coalesce(c.tz, 'UTC') as tz
    from public.profiles p left join public.cities c on c.id = p.city_id
    left join public.user_settings s on s.user_id = p.id
    where p.status = 'active' and coalesce(s.notif_reminders, true)
  loop
    v_local := p_now at time zone v_row.tz;
    -- Monday, 09:00 to 11:59 local; one mark per ISO week, so a cron that runs often sends once.
    if extract(isodow from v_local) <> 1 or extract(hour from v_local) not between 9 and 11 then
      continue;
    end if;
    v_week := to_char(v_local, 'IYYY-IW');
    v_monday := v_local::date;
    if exists (select 1 from public.notification_marks m
               where m.user_id = v_row.id and m.type = 'weekly_digest:' || v_week) then
      continue;
    end if;
    -- The shared counts, minus Plans whose host and this member have blocked each other.
    v_in_city := coalesce((select n from digest_city_counts d where d.city_id = v_row.city_id), 0)
      - (select count(*) from public.plans pl
         where v_row.city_id is not null and pl.city_id = v_row.city_id and pl.format = 'in_person'
           and pl.status in ('published', 'changed')
           and pl.starts_at between p_now and p_now + interval '7 days'
           and public.blocked_pair(v_row.id, pl.host_id));
    v_online := v_online_all
      - (select count(*) from public.plans pl
         where pl.format = 'online' and pl.status in ('published', 'changed')
           and pl.starts_at between p_now and p_now + interval '7 days'
           and public.blocked_pair(v_row.id, pl.host_id));
    -- The member's first active Circle by name, as This week shows it.
    v_circle_id := null;
    v_circle_name := null;
    select c.id, c.name into v_circle_id, v_circle_name
    from public.circle_members m join public.circles c on c.id = m.circle_id and c.status = 'active'
    where m.user_id = v_row.id
    order by c.name, c.id
    limit 1;
    if v_circle_id is null and v_in_city + v_online <= 0 then
      continue;
    end if;
    insert into public.notification_marks (user_id, type, ref_id) values (v_row.id, 'weekly_digest:' || v_week, v_row.id)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    v_body := case
      when v_in_city > 0 and v_online > 0 then
        v_in_city::text || ' near you this week, ' || v_online::text || ' online'
      when v_in_city > 0 then v_in_city::text || ' near you this week'
      when v_online > 0 then v_online::text || ' online this week'
      else 'Cook it at home and share a photo with your Circle.' end;
    v_payload := jsonb_build_object('city', v_row.city, 'in_city', v_in_city, 'online', v_online, 'week', v_week);
    v_title := 'This week on PlantCircle';
    -- A Circle still on the previous week where it is (far to the west) has not started this
    -- theme yet, and its page would show last week's: announce it next time instead.
    if v_circle_id is not null and public.circle_week_start(v_circle_id, p_now) <> v_monday then
      v_circle_id := null;
      if v_in_city + v_online <= 0 then
        delete from public.notification_marks
        where user_id = v_row.id and type = 'weekly_digest:' || v_week;
        continue;
      end if;
    end if;
    if v_circle_id is not null then
      v_theme := (select theme from public.circle_challenges
                  where circle_id = v_circle_id and week_start = v_monday);
      v_payload := v_payload || jsonb_build_object(
        'circle', v_circle_name, 'circle_id', v_circle_id,
        'theme', coalesce(v_theme, ''),
        'theme_key', case when v_theme is null then public.challenge_default_key(v_monday) else '' end);
      v_title := 'This week in ' || v_circle_name;
    end if;
    perform public.notify(v_row.id, 'weekly_digest', v_payload,
      true, true, false, v_title, v_body, v_body, false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.weekly_digest_enqueue(timestamptz) from public, anon, authenticated;

-- push-dispatch rechecks a weekly notice's Circle membership before sending.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.circle_members, public.circles to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------- the invite page

-- This week's theme for a Circle anyone can see (open and ask-to-join; invite-only and archived
-- Circles are not found, for members too), for the invite page a link opens without an account.
-- Only the week and the theme: never entries, names or photos (circle_challenge stays
-- members-only). Null theme: the week's default, named by the app. Owners are told a custom
-- theme shows on the invite page.
create function public.circle_week_public(p_circle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week date;
begin
  if not exists (select 1 from public.circles c
                 where c.id = p_circle_id and c.status = 'active' and c.access <> 'invite') then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  v_week := public.circle_week_start(p_circle_id, now());
  return jsonb_build_object(
    'week_start', v_week,
    'theme', (select theme from public.circle_challenges
              where circle_id = p_circle_id and week_start = v_week));
end;
$$;
revoke all on function public.circle_week_public(uuid) from public;
grant execute on function public.circle_week_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- analytics deletion

-- Analytics ids to delete at PostHog, with their events: recorded by the app before an account is
-- deleted or analytics consent is withdrawn, so the request survives the phone forgetting the id.
-- The analytics-forget worker (service role) deletes them through PostHog's API once its keys are
-- set, and marks them done. The id is random and not linked to the account anywhere else.
create table public.analytics_deletions (
  distinct_id text primary key check (char_length(distinct_id) between 8 and 80),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.analytics_deletions enable row level security;
revoke all on public.analytics_deletions from anon, authenticated;

create function public.analytics_forget(p_distinct_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(coalesce(p_distinct_id, '')) not between 8 and 80 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- A member may only ask for 20 a day (a few phones, a few withdrawals).
  if (select count(*) from public.analytics_deletions
      where user_id = (select auth.uid()) and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.analytics_deletions (distinct_id, user_id) values (p_distinct_id, (select auth.uid()))
  on conflict (distinct_id) do nothing;
end;
$$;
revoke all on function public.analytics_forget(text) from public, anon;
grant execute on function public.analytics_forget(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, update (done_at) on public.analytics_deletions to service_role;
  end if;
end;
$$;

-- The worker hourly, like the others (20261112003000_workers.sql).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'plantcircle-analytics-forget';
  perform cron.schedule(
    'plantcircle-analytics-forget',
    '17 * * * *',
    $job$
      select net.http_post(
        url := s.url || '/functions/v1/analytics-forget',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || s.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)
      from (
        select
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'plantcircle_project_url') as url,
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'plantcircle_service_role_key') as key
      ) s
      where s.url is not null and s.key is not null
    $job$);
end;
$$;

-- ---------------------------------------------------------------- group orders off at launch

-- Group orders are hidden in the launch app (apps/mobile/src/lib/features.ts); the server now
-- refuses to create them too, so no order and none of its notices can exist. Turning them back on
-- is `update public.host_levels set group_orders = true where level >= 2`.
update public.host_levels set group_orders = false;

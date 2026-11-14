-- Monday digest (design note 2026-11-14 §4): one push a week, Monday morning in the member's
-- city time: "3 Plans near you this week, 2 online". Nothing when there is nothing. Members
-- without a city get the online count only. Turned off together with reminders (notify(), whose
-- preference branch was edited in place: no database had applied it, see README).
--
-- Cost: members already marked this week are skipped before any counting; the online count and
-- each city's count are computed once per run; a recipient's blocks (either way) are subtracted.

create index plans_format_starts_idx on public.plans (format, starts_at) where status in ('published', 'changed');

create function public.weekly_digest_enqueue(p_now timestamptz default now())
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
  v_local timestamptz;
  v_week text;
  v_body text;
  v_online_all integer;
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
    where p.status = 'active'
  loop
    v_local := p_now at time zone v_row.tz;
    -- Monday, 09:00 to 11:59 local; one mark per ISO week, so a cron that runs often sends once.
    if extract(isodow from v_local) <> 1 or extract(hour from v_local) not between 9 and 11 then
      continue;
    end if;
    v_week := to_char(v_local, 'IYYY-IW');
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
    if v_in_city + v_online <= 0 then
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
      else v_online::text || ' online this week' end;
    perform public.notify(v_row.id, 'weekly_digest',
      jsonb_build_object('city', v_row.city, 'in_city', v_in_city, 'online', v_online, 'week', v_week),
      true, true, false, 'This week on PlantCircle', v_body, v_body, false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.weekly_digest_enqueue(timestamptz) from public, anon, authenticated;

create or replace function public.notifications_enqueue_due_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.web_rsvp_cleanup();
  perform public.host_featured_refresh_all();
  perform public.weekly_digest_enqueue();
  return public.notifications_enqueue_due();
end;
$$;

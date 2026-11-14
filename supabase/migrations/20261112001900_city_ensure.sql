-- Free city choice (design note docs/superpowers/specs/2026-11-14-hosting-levels-city-flow-design.md §1).
-- Nobody picks from a seeded list: a person types their city and, if it is not known yet, it is
-- added on the spot with the device's country and time zone. Cities stay rows because Plans,
-- group orders and reminders need a time zone and a country.
--
-- Decisions:
--  * Callable before sign-up (anon): onboarding asks for the city before an account exists.
--  * Names are unique per country, case-insensitively; "berlin" finds Berlin.
--  * Duplicates in spelling ("Köln" / "Cologne") are a staff merge later (docs/16-open-questions.md).
--  * Only IANA zones JavaScript's Intl accepts ("Area/Location", Etc/*): PostgreSQL also lists
--    Factory, posix/*, right/*, which would crash date formatting in the app.
--  * New cities are rate-limited per caller (the signed-in member, else the request's address):
--    5 new rows an hour. Finding an existing city is never limited.

create unique index cities_name_country_ci on public.cities (lower(name), country_code);

-- Who is adding a city: the member, else the address the gateway reports, else "unknown".
create function public.city_caller()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.uid()::text,
    nullif(split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), ''),
    'unknown');
$$;
revoke all on function public.city_caller() from public, anon, authenticated;

create function public.city_ensure(p_name text, p_country_code text, p_tz text)
returns public.cities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.text_trim(p_name);
  v_country text := upper(public.text_trim(p_country_code));
  v_row public.cities%rowtype;
begin
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_tz !~ '^(Etc/)?[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' or p_tz ~ '^(posix|right|SystemV)/'
     or p_tz in ('Factory', 'localtime')
     or not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select c.* into v_row from public.cities c
  where lower(c.name) = lower(v_name) and c.country_code = v_country;
  if found then
    return v_row;
  end if;
  perform public.web_rsvp_rate_check('city:' || public.city_caller(), 5);
  insert into public.cities (name, country_code, tz) values (v_name, v_country, p_tz)
  on conflict (lower(name), country_code) do update set name = public.cities.name
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.city_ensure(text, text, text) to anon, authenticated;

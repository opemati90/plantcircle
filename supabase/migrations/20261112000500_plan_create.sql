-- Creating a Plan (C4). One step: the Plan is published in the same transaction it is created,
-- because a Plan cannot publish without allergens and the create flow always has them. Drafts
-- (not visible in plan_cards) are a later step (G4).
--
-- Allergens are stored as text, as the plans table defines them: the allergen keys joined with
-- commas ("gluten,eggs"), or "none" alone. The app translates the keys when it shows them.

create function public.plan_create(
  p_kind public.plan_kind,
  p_format public.plan_format,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_allergens text[],
  p_area_label text,
  p_address text,
  p_keep_address_private boolean,
  p_meeting_url text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_city_id uuid;
  v_city_name text;
  v_tz text;
  v_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  -- Text is trimmed before any rule is checked, so blank-looking values are refused everywhere.
  v_title text := regexp_replace(coalesce(p_title, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_description text := regexp_replace(coalesce(p_description, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_area text := regexp_replace(coalesce(p_area_label, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_address text := regexp_replace(coalesce(p_address, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_link text := regexp_replace(coalesce(p_meeting_url, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_allergen_keys constant text[] := array['none','gluten','crustaceans','eggs','fish','peanuts',
    'soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs'];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  select p.city_id into v_city_id from public.profiles p where p.id = v_uid;
  if v_city_id is null then
    raise exception 'city_required' using errcode = 'P0001';
  end if;
  select c.name, c.tz into v_city_name, v_tz from public.cities c where c.id = v_city_id;

  v_fingerprint := 'plan_create:' || jsonb_build_object(
    'kind', p_kind, 'format', p_format, 'title', p_title, 'description', p_description,
    'starts', p_starts_at, 'ends', p_ends_at, 'capacity', p_capacity, 'allergens', p_allergens,
    'area', p_area_label, 'address', p_address, 'private', p_keep_address_private,
    'link', p_meeting_url)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  -- v1 offers two kinds in the app; the rest of the enum waits for their flows.
  if p_kind not in ('cooking_night', 'potluck') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if char_length(v_title) not between 3 and 80 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if char_length(v_description) > 2000 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_starts_at <= now() + interval '1 hour' then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_ends_at - p_starts_at not between interval '30 minutes' and interval '8 hours' then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_capacity not between 2 and 50 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_allergens), 0) = 0 then
    raise exception 'allergens_required' using errcode = 'P0001';
  end if;
  if not (p_allergens <@ v_allergen_keys) then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if 'none' = any(p_allergens) and cardinality(p_allergens) > 1 then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;

  -- A meeting link: https, with a real host (a dot in it) and nothing after the path that breaks it.
  if p_format = 'in_person' then
    if char_length(v_area) not between 1 and 60 or char_length(v_address) not between 1 and 200 then
      raise exception 'invalid_plan' using errcode = 'P0001';
    end if;
  elsif p_format = 'online' then
    if v_link !~ '^https://[^[:space:]/?#@:]+\.[^[:space:]/?#@:]+([/?#][^[:space:]]*)?$'
      or char_length(v_link) > 500 then
      raise exception 'invalid_plan' using errcode = 'P0001';
    end if;
  else
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;

  insert into public.plans
    (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz,
     capacity, allergens, status)
  values (
    v_uid, p_kind, p_format, v_title, v_description, v_city_id,
    case when p_format = 'in_person' then v_area else v_city_name end,
    p_starts_at, p_ends_at, v_tz, p_capacity, array_to_string(p_allergens, ','),
    'published')
  returning id into v_id;

  -- Every Plan has a private-address row: the read view joins it. Online Plans have no address.
  insert into public.plan_private (plan_id, address, reveal_at)
  values (
    v_id,
    case when p_format = 'in_person' then v_address else null end,
    case
      when p_format = 'in_person' and p_keep_address_private then p_starts_at - interval '1 day'
      else now()
    end);

  if p_format = 'online' then
    insert into public.plan_meeting_links (plan_id, meeting_url) values (v_id, v_link);
  end if;

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;

revoke all on function public.plan_create(
  public.plan_kind, public.plan_format, text, text, timestamptz, timestamptz, integer, text[],
  text, text, boolean, text, uuid) from public, anon;
grant execute on function public.plan_create(
  public.plan_kind, public.plan_format, text, text, timestamptz, timestamptz, integer, text[],
  text, text, boolean, text, uuid) to authenticated;

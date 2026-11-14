-- Staff city merge (typed cities, design note §1): "Köln" and "Cologne" become one row. Everything
-- that points at the duplicate (members, Plans, Circles) moves to the kept city; the duplicate is
-- deleted; the audit trail records it. Plans keep their own tz column, so times do not move.

create function public.staff_cities()
returns table (id uuid, name text, country_code text, tz text, members integer, plans integer, circles integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select c.id, c.name, c.country_code::text, c.tz,
    (select count(*)::int from public.profiles p where p.city_id = c.id),
    (select count(*)::int from public.plans p where p.city_id = c.id),
    (select count(*)::int from public.circles x where x.city_id = c.id)
  from public.cities c
  order by c.country_code, lower(c.name);
end;
$$;
revoke all on function public.staff_cities() from public, anon;
grant execute on function public.staff_cities() to authenticated;

create function public.staff_city_merge(p_from uuid, p_into uuid, p_reason text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_reason text := public.text_trim(p_reason);
  v_fingerprint text := 'city_merge:' || p_from::text || ':' || p_into::text;
  v_replay jsonb;
  v_from public.cities%rowtype;
  v_into public.cities%rowtype;
  v_members integer;
  v_plans integer;
  v_circles integer;
begin
  if char_length(v_reason) < 3 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if p_from = p_into then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_from from public.cities where id = p_from for update;
  if not found then
    raise exception 'city_not_found' using errcode = 'P0002';
  end if;
  select * into v_into from public.cities where id = p_into for update;
  if not found then
    raise exception 'city_not_found' using errcode = 'P0002';
  end if;

  update public.profiles set city_id = p_into where city_id = p_from;
  get diagnostics v_members = row_count;
  update public.plans set city_id = p_into where city_id = p_from;
  get diagnostics v_plans = row_count;
  update public.circles set city_id = p_into where city_id = p_from;
  get diagnostics v_circles = row_count;
  delete from public.cities where id = p_from;

  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, reason, detail)
  values (v_uid, 'staff', 'staff.city_merge', 'city', p_into, v_reason,
    jsonb_build_object('from', v_from.name, 'from_country', v_from.country_code, 'into', v_into.name,
      'members', v_members, 'plans', v_plans, 'circles', v_circles));
  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('members', v_members, 'plans', v_plans, 'circles', v_circles));
end;
$$;
revoke all on function public.staff_city_merge(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.staff_city_merge(uuid, uuid, text, uuid) to authenticated;

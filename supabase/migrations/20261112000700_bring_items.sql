-- Contributions, host side (C6). Guests claim bring slots (slot_claim, from core). The host adds,
-- changes and removes them while the Plan is live. A claimed item cannot be removed, and its
-- quantity cannot drop below the number already claimed.

create function public.host_bring_live(p_plan_id uuid)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.plans%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_plan.host_id <> v_uid then
    raise exception 'not_host' using errcode = '42501';
  end if;
  if v_plan.status not in ('published', 'changed') or now() >= v_plan.ends_at then
    raise exception 'plan_not_live' using errcode = 'P0001';
  end if;
  return v_plan;
end;
$$;

create function public.host_bring_add(
  p_plan_id uuid,
  p_label text,
  p_quantity integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := regexp_replace(coalesce(p_label, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_fingerprint text := 'bring_add:' || p_plan_id::text || ':' || v_label || ':' || coalesce(p_quantity::text, '');
  v_replay jsonb;
  v_id uuid;
  v_position integer;
begin
  perform public.host_bring_live(p_plan_id);
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if char_length(v_label) not between 1 and 60 or p_quantity is null or p_quantity not between 1 and 20 then
    raise exception 'invalid_item' using errcode = 'P0001';
  end if;

  select coalesce(max(position), -1) + 1 into v_position
  from public.contribution_slots where plan_id = p_plan_id;
  insert into public.contribution_slots (plan_id, label, needed, position)
  values (p_plan_id, v_label, p_quantity, v_position)
  returning id into v_id;

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;

create function public.host_bring_update(
  p_item_id uuid,
  p_label text,
  p_quantity integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_label text := regexp_replace(coalesce(p_label, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_fingerprint text := 'bring_update:' || p_item_id::text || ':' || v_label || ':' || coalesce(p_quantity::text, '');
  v_replay jsonb;
  v_claimed integer;
begin
  select plan_id into v_plan_id from public.contribution_slots where id = p_item_id;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  perform public.host_bring_live(v_plan_id);
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if char_length(v_label) not between 1 and 60 or p_quantity is null or p_quantity not between 1 and 20 then
    raise exception 'invalid_item' using errcode = 'P0001';
  end if;
  select count(*)::int into v_claimed from public.contribution_claims where slot_id = p_item_id;
  if p_quantity < v_claimed then
    raise exception 'quantity_below_claims' using errcode = 'P0001';
  end if;

  update public.contribution_slots set label = v_label, needed = p_quantity where id = p_item_id;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', p_item_id));
end;
$$;

create function public.host_bring_remove(p_item_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_fingerprint text := 'bring_remove:' || p_item_id::text;
  v_replay jsonb;
begin
  select plan_id into v_plan_id from public.contribution_slots where id = p_item_id;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  perform public.host_bring_live(v_plan_id);
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if exists (select 1 from public.contribution_claims where slot_id = p_item_id) then
    raise exception 'item_claimed' using errcode = 'P0001';
  end if;

  delete from public.contribution_slots where id = p_item_id;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('removed', true));
end;
$$;

revoke all on function public.host_bring_live(uuid) from public, anon, authenticated;
revoke all on function public.host_bring_add(uuid, text, integer, uuid) from public, anon;
grant execute on function public.host_bring_add(uuid, text, integer, uuid) to authenticated;
revoke all on function public.host_bring_update(uuid, text, integer, uuid) from public, anon;
grant execute on function public.host_bring_update(uuid, text, integer, uuid) to authenticated;
revoke all on function public.host_bring_remove(uuid, uuid) from public, anon;
grant execute on function public.host_bring_remove(uuid, uuid) to authenticated;

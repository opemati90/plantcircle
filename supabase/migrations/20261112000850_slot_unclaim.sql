-- A guest withdraws their own claim on a bring item, until the Plan ends. The claim frees its place
-- for someone else. Keyed like the other writes, so a retry returns the same answer.

create function public.slot_unclaim(p_slot_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan_id uuid;
  v_ends timestamptz;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, 'slot_unclaim:' || p_slot_id::text);
  if v_replay is not null then
    return v_replay;
  end if;
  select s.plan_id, p.ends_at into v_plan_id, v_ends
  from public.contribution_slots s join public.plans p on p.id = s.plan_id
  where s.id = p_slot_id;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.plans where id = v_plan_id for update;
  -- Live means published or changed, and not yet at its scheduled end: a host who ends the Plan early
  -- closes withdrawals too.
  if not exists (select 1 from public.plans where id = v_plan_id and status in ('published', 'changed'))
    or now() >= v_ends then
    raise exception 'plan_not_live' using errcode = 'P0001';
  end if;

  delete from public.contribution_claims where slot_id = p_slot_id and user_id = v_uid;
  return public.idempotent_store(
    p_idempotency_key, 'slot_unclaim:' || p_slot_id::text, jsonb_build_object('claimed', false));
end;
$$;

revoke all on function public.slot_unclaim(uuid, uuid) from public, anon;
grant execute on function public.slot_unclaim(uuid, uuid) to authenticated;

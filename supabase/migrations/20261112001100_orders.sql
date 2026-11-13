-- Group orders (C9). A Plan of kind group_order with a supplier, items with targets, and
-- non-binding interest from members. No money moves in the app: members pay the organizer at pickup.
--
-- Decisions:
--  * No cron. A collecting order's state after closes_at is derived when it is read or written:
--    target met → locked, otherwise below_target. The organizer then decides: go, extend, cancel.
--  * Target met means the total interest is at least the total of the item targets.
--  * The pickup address is private: members with interest see it once the order is locked or ready.
--  * Members with interest can use the order's Plan chat, as guests can.

create table public.group_orders (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  supplier_name text not null check (char_length(supplier_name) between 1 and 80),
  supplier_area text check (supplier_area is null or char_length(supplier_area) <= 80),
  closes_at timestamptz not null,
  pickup_start timestamptz not null,
  pickup_end timestamptz not null,
  pickup_address text not null check (char_length(pickup_address) between 1 and 200),
  pickup_note text check (pickup_note is null or char_length(pickup_note) <= 200),
  state text not null default 'collecting'
    check (state in ('collecting', 'below_target', 'extended', 'locked', 'ready', 'completed', 'cancelled')),
  extended_once boolean not null default false,
  check (pickup_end > pickup_start),
  check (pickup_start >= closes_at)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.group_orders (plan_id) on delete cascade,
  position integer not null,
  name text not null check (char_length(name) between 1 and 80),
  unit text not null default 'kg' check (char_length(unit) between 1 and 12),
  target numeric(10, 2) not null check (target > 0),
  est_price_minor integer check (est_price_minor is null or est_price_minor >= 0),
  currency char(3) not null default 'EUR'
);

create table public.order_interests (
  item_id uuid not null references public.order_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  quantity numeric(10, 2) not null check (quantity >= 0),
  confirmed boolean not null default false,
  collected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.group_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_interests enable row level security;
revoke all on public.group_orders, public.order_items, public.order_interests from anon, authenticated;
create policy order_interests_own on public.order_interests for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.order_interests to authenticated;

-- The state as it stands now: a collecting or extended order past its close resolves itself.
create function public.order_effective_state(p_order public.group_orders)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_order.state in ('collecting', 'extended') and now() >= p_order.closes_at then
      case when (
        select coalesce(sum(i.quantity), 0) from public.order_items oi
        join public.order_interests i on i.item_id = oi.id where oi.plan_id = p_order.plan_id
      ) >= (
        select coalesce(sum(oi.target), 0) from public.order_items oi where oi.plan_id = p_order.plan_id
      ) then 'locked' else 'below_target' end
    else p_order.state
  end;
$$;

-- Interest totals for an item.
create function public.order_item_total(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0) from public.order_interests where item_id = p_item_id;
$$;

-- Public read model: everything on the order page except the pickup address.
create view public.order_cards
with (security_invoker = false)
as
select
  o.plan_id,
  p.title,
  p.description,
  p.host_id as organizer_id,
  h.display_name as organizer_name,
  p.city_id,
  p.status as plan_status,
  o.supplier_name,
  o.supplier_area,
  o.closes_at,
  o.pickup_start,
  o.pickup_end,
  o.pickup_note,
  p.tz,
  public.order_effective_state(o) as state,
  o.extended_once,
  (select coalesce(sum(oi.target), 0) from public.order_items oi where oi.plan_id = o.plan_id) as target_total,
  (select coalesce(sum(i.quantity), 0) from public.order_items oi
     join public.order_interests i on i.item_id = oi.id where oi.plan_id = o.plan_id) as interest_total,
  (select count(distinct i.user_id)::int from public.order_items oi
     join public.order_interests i on i.item_id = oi.id where oi.plan_id = o.plan_id and i.quantity > 0) as people_count
from public.group_orders o
join public.plans p on p.id = o.plan_id
join public.profiles h on h.id = p.host_id
where p.status <> 'draft';

create view public.order_item_cards
with (security_invoker = false)
as
select oi.id, oi.plan_id, oi.position, oi.name, oi.unit, oi.target, oi.est_price_minor, oi.currency,
  public.order_item_total(oi.id) as interest_total
from public.order_items oi
join public.plans p on p.id = oi.plan_id
where p.status <> 'draft';

revoke all on public.order_cards, public.order_item_cards from anon, authenticated;
grant select on public.order_cards, public.order_item_cards to anon, authenticated;

-- Whether the viewer has interest in an order (any item, quantity > 0).
create function public.order_has_interest(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.order_items oi join public.order_interests i on i.item_id = oi.id
    where oi.plan_id = p_plan_id and i.user_id = (select auth.uid()) and i.quantity > 0);
$$;

-- The pickup address: the organizer always; members with interest once the order is locked or ready.
create function public.order_pickup_address(p_plan_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.group_orders%rowtype;
  v_host uuid;
begin
  select * into v_order from public.group_orders where plan_id = p_plan_id;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  select host_id into v_host from public.plans where id = p_plan_id;
  if v_host = (select auth.uid()) then
    return v_order.pickup_address;
  end if;
  if public.order_effective_state(v_order) in ('locked', 'ready', 'completed') and public.order_has_interest(p_plan_id) then
    return v_order.pickup_address;
  end if;
  return null;
end;
$$;

-- Members with interest in a group order can use its Plan chat, like guests.
create or replace function public.plan_chat_member(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plans p
    where p.id = p_plan_id
      and p.status <> 'cancelled'
      and (
        p.host_id = (select auth.uid())
        or exists (
          select 1 from public.rsvps r
          where r.plan_id = p.id and r.user_id = (select auth.uid())
            and r.state in ('going', 'checked_in', 'no_show'))
        or (p.kind = 'group_order' and public.order_has_interest(p.id))
      )
  );
$$;

-- Creating an order publishes it at once (like Plans). Items come as a JSON array.
create function public.order_create(
  p_title text,
  p_description text,
  p_supplier_name text,
  p_supplier_area text,
  p_closes_at timestamptz,
  p_pickup_start timestamptz,
  p_pickup_end timestamptz,
  p_pickup_address text,
  p_pickup_note text,
  p_items jsonb,
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
  v_title text := public.text_trim(p_title);
  v_supplier text := public.text_trim(p_supplier_name);
  v_address text := public.text_trim(p_pickup_address);
  v_fingerprint text;
  v_replay jsonb;
  v_item jsonb;
  v_pos integer := 0;
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

  v_fingerprint := 'order_create:' || jsonb_build_object(
    'title', v_title, 'description', p_description, 'supplier', v_supplier, 'area', p_supplier_area,
    'closes', p_closes_at, 'ps', p_pickup_start, 'pe', p_pickup_end, 'address', v_address,
    'note', p_pickup_note, 'items', p_items)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  if char_length(v_title) not between 3 and 80 or char_length(v_supplier) not between 1 and 80
    or char_length(v_address) not between 1 and 200 then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;
  if p_closes_at <= now() + interval '1 hour' or p_pickup_start < p_closes_at
    or p_pickup_end <= p_pickup_start or p_pickup_end - p_pickup_start > interval '12 hours' then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  -- The Plan row: an in-person Plan at the pickup place. Allergens do not apply to goods, so the
  -- answer is "none" (the goods are listed as items, not dishes).
  insert into public.plans
    (host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz,
     capacity, allergens, status)
  values (v_uid, 'group_order', 'in_person', v_title, public.text_trim(p_description), v_city_id,
    coalesce(nullif(public.text_trim(p_supplier_area), ''), v_city_name), p_pickup_start, p_pickup_end, v_tz,
    500, 'none', 'published')
  returning id into v_id;
  insert into public.plan_private (plan_id, address, reveal_at) values (v_id, null, p_closes_at);

  insert into public.group_orders
    (plan_id, supplier_name, supplier_area, closes_at, pickup_start, pickup_end, pickup_address, pickup_note)
  values (v_id, v_supplier, nullif(public.text_trim(p_supplier_area), ''), p_closes_at, p_pickup_start,
    p_pickup_end, v_address, nullif(public.text_trim(p_pickup_note), ''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    if char_length(public.text_trim(v_item->>'name')) not between 1 and 80
      or coalesce((v_item->>'target')::numeric, 0) <= 0 then
      raise exception 'invalid_order' using errcode = 'P0001';
    end if;
    insert into public.order_items (plan_id, position, name, unit, target, est_price_minor, currency)
    values (v_id, v_pos, public.text_trim(v_item->>'name'), coalesce(nullif(v_item->>'unit', ''), 'kg'),
      (v_item->>'target')::numeric, nullif(v_item->>'est_price_minor', '')::integer,
      coalesce(nullif(v_item->>'currency', ''), 'EUR'));
  end loop;

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;

-- Non-binding interest in one item. Allowed while collecting or extended, before closes_at.
create function public.order_set_interest(p_item_id uuid, p_quantity numeric, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.group_orders%rowtype;
  v_plan_id uuid;
  v_fingerprint text := 'order_interest:' || p_item_id::text || ':' || coalesce(p_quantity::text, '');
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select plan_id into v_plan_id from public.order_items where id = p_item_id;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  select * into v_order from public.group_orders where plan_id = v_plan_id for update;
  -- Checked against the wall clock after the lock: a request that waited on the lock past the
  -- close must not change totals that readers already saw as final.
  if public.order_effective_state(v_order) not in ('collecting', 'extended')
    or clock_timestamp() >= v_order.closes_at then
    raise exception 'interest_closed' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000 then
    raise exception 'invalid_quantity' using errcode = 'P0001';
  end if;

  insert into public.order_interests (item_id, user_id, quantity)
  values (p_item_id, v_uid, p_quantity)
  on conflict (item_id, user_id) do update set quantity = excluded.quantity, updated_at = now();

  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('item_total', public.order_item_total(p_item_id)));
end;
$$;

-- The organizer decides on a below-target order: go ahead, extend once by 72 hours, or cancel.
create function public.order_decide(p_plan_id uuid, p_decision text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.group_orders%rowtype;
  v_host uuid;
  v_state text;
  v_fingerprint text := 'order_decide:' || p_plan_id::text || ':' || coalesce(p_decision, '');
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_order from public.group_orders where plan_id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  select host_id into v_host from public.plans where id = p_plan_id;
  if v_host <> v_uid then
    raise exception 'not_host' using errcode = '42501';
  end if;
  v_state := public.order_effective_state(v_order);

  if p_decision = 'cancel' then
    if v_state in ('completed', 'cancelled') then
      raise exception 'order_not_open' using errcode = 'P0001';
    end if;
    update public.group_orders set state = 'cancelled' where plan_id = p_plan_id;
    update public.plans set status = 'cancelled' where id = p_plan_id;
  elsif p_decision = 'go' then
    if v_state not in ('below_target', 'locked') then
      raise exception 'order_not_open' using errcode = 'P0001';
    end if;
    -- Going ahead with nobody in would leave an order nobody can collect; cancel or extend instead.
    if not exists (select 1 from public.order_items oi join public.order_interests i on i.item_id = oi.id
                   where oi.plan_id = p_plan_id and i.quantity > 0) then
      raise exception 'order_not_open' using errcode = 'P0001';
    end if;
    update public.group_orders set state = 'locked' where plan_id = p_plan_id;
  elsif p_decision = 'extend' then
    if v_state <> 'below_target' or v_order.extended_once then
      raise exception 'order_not_open' using errcode = 'P0001';
    end if;
    -- The pickup window keeps its length and moves only if the new close would pass it.
    update public.group_orders
    set state = 'extended', extended_once = true, closes_at = now() + interval '72 hours',
        pickup_start = greatest(pickup_start, now() + interval '72 hours'),
        pickup_end = greatest(pickup_start, now() + interval '72 hours') + (pickup_end - pickup_start)
    where plan_id = p_plan_id;
    update public.plans p set starts_at = o.pickup_start, ends_at = o.pickup_end
    from public.group_orders o where o.plan_id = p.id and p.id = p_plan_id;
    update public.plan_private set reveal_at = now() + interval '72 hours' where plan_id = p_plan_id;
  elsif p_decision = 'ready' then
    if v_state <> 'locked' then
      raise exception 'order_not_open' using errcode = 'P0001';
    end if;
    update public.group_orders set state = 'ready' where plan_id = p_plan_id;
  else
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  insert into public.audit_events (actor_id, action, plan_id, detail)
  values (v_uid, 'order.' || p_decision, p_plan_id, '{}'::jsonb);
  return public.idempotent_store(p_idempotency_key, v_fingerprint,
    jsonb_build_object('state', (select state from public.group_orders where plan_id = p_plan_id)));
end;
$$;

-- A member marks their own share collected, once the order is ready. When everyone with
-- interest has collected, the order completes.
create function public.order_mark_collected(p_plan_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.group_orders%rowtype;
  v_fingerprint text := 'order_collected:' || p_plan_id::text;
  v_replay jsonb;
  v_outstanding integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_order from public.group_orders where plan_id = p_plan_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_order.state <> 'ready' then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;
  if not public.order_has_interest(p_plan_id) then
    raise exception 'rsvp_required' using errcode = 'P0001';
  end if;

  update public.order_interests i set collected_at = now()
  from public.order_items oi
  where oi.id = i.item_id and oi.plan_id = p_plan_id and i.user_id = v_uid and i.collected_at is null;

  select count(distinct i.user_id)::int into v_outstanding
  from public.order_items oi join public.order_interests i on i.item_id = oi.id
  where oi.plan_id = p_plan_id and i.quantity > 0 and i.collected_at is null;
  if v_outstanding = 0 then
    update public.group_orders set state = 'completed' where plan_id = p_plan_id;
    update public.plans set status = 'completed' where id = p_plan_id;
  end if;

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('collected', true));
end;
$$;

-- The read views call these as the viewer; they return only aggregates.
revoke all on function public.order_effective_state(public.group_orders) from public;
grant execute on function public.order_effective_state(public.group_orders) to anon, authenticated;
revoke all on function public.order_item_total(uuid) from public;
grant execute on function public.order_item_total(uuid) to anon, authenticated;
revoke all on function public.order_has_interest(uuid) from public, anon;
grant execute on function public.order_has_interest(uuid) to authenticated;
revoke all on function public.order_pickup_address(uuid) from public, anon;
grant execute on function public.order_pickup_address(uuid) to authenticated;
revoke all on function public.order_create(text, text, text, text, timestamptz, timestamptz, timestamptz, text, text, jsonb, uuid) from public, anon;
grant execute on function public.order_create(text, text, text, text, timestamptz, timestamptz, timestamptz, text, text, jsonb, uuid) to authenticated;
revoke all on function public.order_set_interest(uuid, numeric, uuid) from public, anon;
grant execute on function public.order_set_interest(uuid, numeric, uuid) to authenticated;
revoke all on function public.order_decide(uuid, text, uuid) from public, anon;
grant execute on function public.order_decide(uuid, text, uuid) to authenticated;
revoke all on function public.order_mark_collected(uuid, uuid) from public, anon;
grant execute on function public.order_mark_collected(uuid, uuid) to authenticated;

-- Account-wide analytics deletion (docs/superpowers/specs/2026-11-15-retention-invites-analytics-design.md §3).
--
-- The analytics id is random and per device, so a "no" or an account deletion on one phone could
-- only name that phone's id; data sent from the member's other devices stayed at PostHog. Each
-- device now registers its id before it sends anything (the app keeps analytics off until this
-- succeeds), and a withdrawal or deletion queues every registered id of the account.
--
-- The ids are linked to the account here, and only here, so they can be deleted; they are never
-- sent anywhere else, and a queued id is unlinked once processed.
--
-- Registering and queueing take the same lock (the member's profile row), so a registration that
-- arrives during a withdrawal or deletion either lands before it (and is queued) or after it (and
-- is refused, consent being off or the account gone).

create table public.analytics_ids (
  distinct_id text primary key check (char_length(distinct_id) between 8 and 80),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index analytics_ids_user on public.analytics_ids (user_id);
alter table public.analytics_ids enable row level security;
revoke all on public.analytics_ids from anon, authenticated;

-- Calls per member, for the daily limits (kept apart from the queue, which is unlinked once done).
create table public.analytics_calls (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('register', 'forget')),
  at timestamptz not null default now()
);
create index analytics_calls_user on public.analytics_calls (user_id, kind, at);
alter table public.analytics_calls enable row level security;
revoke all on public.analytics_calls from anon, authenticated;

create function public.analytics_call(p_user_id uuid, p_kind text, p_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.analytics_calls
      where user_id = p_user_id and kind = p_kind and at > now() - interval '1 day') >= p_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.analytics_calls (user_id, kind) values (p_user_id, p_kind);
  delete from public.analytics_calls where user_id = p_user_id and at < now() - interval '2 days';
end;
$$;
revoke all on function public.analytics_call(uuid, text, integer) from public, anon, authenticated;

-- Every id of an account goes to the deletion queue and is unlinked, in one statement.
create function public.analytics_queue_all(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = p_user_id for update;
  with gone as (
    delete from public.analytics_ids where user_id = p_user_id returning distinct_id
  )
  insert into public.analytics_deletions (distinct_id, user_id)
  select distinct_id, p_user_id from gone
  on conflict (distinct_id) do nothing;
end;
$$;
revoke all on function public.analytics_queue_all(uuid) from public, anon, authenticated;

create function public.analytics_register(p_distinct_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(coalesce(p_distinct_id, '')) not between 8 and 80 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- Waits for a withdrawal or deletion in progress, then sees its outcome.
  perform 1 from public.profiles where id = v_uid and status <> 'deleted' for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not coalesce((select analytics_consent from public.user_settings where user_id = v_uid), false) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select user_id into v_owner from public.analytics_ids where distinct_id = p_distinct_id;
  if v_owner = v_uid then
    return;
  end if;
  -- Someone else's id (never by chance; ids are random UUIDs), or one already queued for
  -- deletion: refused, and the app starts a new id.
  if v_owner is not null
     or exists (select 1 from public.analytics_deletions where distinct_id = p_distinct_id) then
    raise exception 'id_retired' using errcode = 'P0001';
  end if;
  -- A few phones and reinstalls a day; more is not a person.
  perform public.analytics_call(v_uid, 'register', 20);
  insert into public.analytics_ids (distinct_id, user_id) values (p_distinct_id, v_uid);
end;
$$;
revoke all on function public.analytics_register(text) from public, anon;
grant execute on function public.analytics_register(text) to authenticated;

-- A withdrawal (or the app before an account deletion) names this device's id; every other device
-- of the account is queued with it. The id named may be unregistered (registration failed, or a
-- phone from before this change): it is queued as before. Asking again for an id already queued
-- is a free retry.
create or replace function public.analytics_forget(p_distinct_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(coalesce(p_distinct_id, '')) not between 8 and 80 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- One request at a time per member, so the daily limit below cannot be raced.
  perform 1 from public.profiles where id = v_uid for update;
  -- Another member's registered id is not this member's to delete.
  if exists (select 1 from public.analytics_ids
             where distinct_id = p_distinct_id and user_id <> v_uid) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.analytics_deletions where distinct_id = p_distinct_id) then
    perform public.analytics_call(v_uid, 'forget', 20);
    insert into public.analytics_deletions (distinct_id, user_id) values (p_distinct_id, v_uid)
    on conflict (distinct_id) do nothing;
  end if;
  perform public.analytics_queue_all(v_uid);
end;
$$;

-- A deleted account queues its ids even if the app never got to ask (another device, a deletion
-- made by staff, a crash in between).
create function public.analytics_forget_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.analytics_queue_all(new.id);
  return new;
end;
$$;
revoke all on function public.analytics_forget_on_account_delete() from public, anon, authenticated;
create trigger profiles_deleted_forget_analytics after update of status on public.profiles
  for each row when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.analytics_forget_on_account_delete();

-- A "no" given on any device (even one that never had analytics on, so has no id to name) queues
-- every device of the account. No limit needed: only registered ids are queued, and registering
-- is limited.
create function public.analytics_forget_on_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.analytics_queue_all(new.user_id);
  return new;
end;
$$;
revoke all on function public.analytics_forget_on_withdrawal() from public, anon, authenticated;
create trigger user_settings_analytics_withdrawn after update of analytics_consent on public.user_settings
  for each row when (old.analytics_consent and not new.analytics_consent)
  execute function public.analytics_forget_on_withdrawal();

-- Processed requests are unlinked from the account: the worker's mark also clears user_id.
create function public.analytics_deletions_unlink()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done_at is not null then
    new.user_id := null;
  end if;
  return new;
end;
$$;
create trigger analytics_deletions_unlink before update of done_at on public.analytics_deletions
  for each row execute function public.analytics_deletions_unlink();

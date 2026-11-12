-- Direct messages (C7a): a request with one first message, accepted or declined by the recipient.
-- Decisions: a request needs a shared active Circle with the recipient (no messages from strangers;
-- block arrives with C10). Decline is silent: the sender keeps seeing "request sent". A person may
-- send at most 10 requests a day. Mute and pin are per person, and live in one settings table.

-- Direct conversations: one per pair of people, created on acceptance. The pair is stored ordered.
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check
  check (kind in ('plan', 'circle', 'direct'));
alter table public.conversations drop constraint conversations_check;
alter table public.conversations add column user_low uuid references public.profiles (id) on delete cascade;
alter table public.conversations add column user_high uuid references public.profiles (id) on delete cascade;
alter table public.conversations add constraint conversations_pair_unique unique (user_low, user_high);
alter table public.conversations add constraint conversations_shape check (
  (kind = 'plan' and plan_id is not null and circle_id is null and user_low is null and user_high is null)
  or (kind = 'circle' and circle_id is not null and plan_id is null and user_low is null and user_high is null)
  or (kind = 'direct' and user_low is not null and user_high is not null and user_low < user_high
      and plan_id is null and circle_id is null));

create table public.message_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  first_message text not null check (char_length(first_message) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.message_requests enable row level security;
-- The sender sees the requests they made. The recipient sees one only while it is pending, so a
-- declined request's text is not kept readable by the person who declined it.
create policy message_requests_sender on public.message_requests for select to authenticated
  using (from_id = (select auth.uid()));
create policy message_requests_recipient on public.message_requests for select to authenticated
  using (to_id = (select auth.uid()) and status = 'pending');
revoke all on public.message_requests from anon, authenticated;
grant select on public.message_requests to authenticated;

-- Per person, per conversation: mute until a time, and pinned. Only the owner reads or changes them.
create table public.conversation_settings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  muted_until timestamptz,
  pinned_at timestamptz,
  primary key (user_id, conversation_id)
);
alter table public.conversation_settings enable row level security;
create policy conversation_settings_own on public.conversation_settings for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.conversation_settings from anon, authenticated;
grant select on public.conversation_settings to authenticated;

-- Membership now covers direct conversations: the two people in the pair.
create or replace function public.conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and ((c.kind = 'plan' and public.plan_chat_member(c.plan_id))
        or (c.kind = 'circle' and public.circle_chat_member(c.circle_id))
        or (c.kind = 'direct' and (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid())))));
$$;

-- Two people who share an active Circle, and whose conversation does not exist yet.
create function public.share_active_circle(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.circle_members m1
    join public.circle_members m2 on m2.circle_id = m1.circle_id
    join public.circles c on c.id = m1.circle_id and c.status = 'active'
    where m1.user_id = p_a and m2.user_id = p_b);
$$;

-- Ask to message someone. Returns the conversation at once if the two already talk; otherwise the
-- request stays pending until the recipient answers. A declined request still reads as pending.
create function public.dm_request(p_to uuid, p_first_message text, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_low uuid := least(v_uid, p_to);
  v_high uuid := greatest(v_uid, p_to);
  v_text text := public.text_trim(p_first_message);
  v_conversation uuid;
  v_status text;
  v_today integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if p_to = v_uid or not exists (select 1 from public.profiles where id = p_to)
    or not public.share_active_circle(v_uid, p_to) then
    raise exception 'person_not_found' using errcode = 'P0002';
  end if;
  select id into v_conversation from public.conversations where kind = 'direct' and user_low = v_low and user_high = v_high;
  if found then
    return jsonb_build_object('status', 'accepted', 'conversation_id', v_conversation);
  end if;
  if char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;

  -- One sender's requests are serialised, so the daily count and the insert see each other.
  perform pg_advisory_xact_lock(hashtext('dm_request:' || v_uid::text));
  select status into v_status from public.message_requests where from_id = v_uid and to_id = p_to;
  if found then
    -- A declined request still reads as pending to the sender: a decline is never disclosed.
    return jsonb_build_object('status', 'pending');
  end if;
  select count(*) into v_today from public.message_requests
  where from_id = v_uid and created_at > now() - interval '24 hours';
  if v_today >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.message_requests (from_id, to_id, first_message) values (v_uid, p_to, v_text);
  return jsonb_build_object('status', 'pending');
end;
$$;

-- The recipient accepts or declines. Accepting opens the conversation and posts the first message.
create function public.dm_request_respond(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.message_requests%rowtype;
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_req from public.message_requests where id = p_request_id for update;
  if not found or v_req.to_id <> v_uid then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('status', v_req.status);
  end if;

  if p_accept then
    -- Reciprocal requests can both be pending. Whichever is accepted second joins the conversation
    -- that already exists for the pair, instead of creating a second one.
    insert into public.conversations (kind, user_low, user_high)
    values ('direct', least(v_req.from_id, v_req.to_id), greatest(v_req.from_id, v_req.to_id))
    on conflict (user_low, user_high) do nothing;
    select id into v_conversation from public.conversations
    where kind = 'direct' and user_low = least(v_req.from_id, v_req.to_id)
      and user_high = greatest(v_req.from_id, v_req.to_id);
    insert into public.messages (conversation_id, sender_id, body, client_id)
    values (v_conversation, v_req.from_id, v_req.first_message, gen_random_uuid());
    update public.message_requests set status = 'accepted', decided_at = now() where id = p_request_id;
    return jsonb_build_object('status', 'accepted', 'conversation_id', v_conversation);
  end if;
  update public.message_requests set status = 'declined', decided_at = now() where id = p_request_id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- Requests waiting for the viewer, with the sender's name and first message.
create view public.message_request_cards
with (security_invoker = false)
as
select r.id, r.from_id, p.display_name as from_name, r.first_message, r.created_at
from public.message_requests r
join public.profiles p on p.id = r.from_id
where r.status = 'pending' and r.to_id = (select auth.uid());

revoke all on public.message_request_cards from anon, authenticated;
grant select on public.message_request_cards to authenticated;

-- Open the direct conversation with someone, if it exists and the viewer is in it.
create or replace function public.conversation_open(p_kind text, p_ref uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind = 'plan' then
    if not public.plan_chat_member(p_ref) then
      raise exception 'not_member' using errcode = 'P0002';
    end if;
    insert into public.conversations (kind, plan_id) values ('plan', p_ref)
    on conflict (plan_id) do nothing;
    select id into v_id from public.conversations where plan_id = p_ref;
  elsif p_kind = 'circle' then
    if not public.circle_chat_member(p_ref) then
      raise exception 'not_member' using errcode = 'P0002';
    end if;
    insert into public.conversations (kind, circle_id) values ('circle', p_ref)
    on conflict (circle_id) do nothing;
    select id into v_id from public.conversations where circle_id = p_ref;
  elsif p_kind = 'direct' then
    select id into v_id from public.conversations
    where kind = 'direct'
      and user_low = least((select auth.uid()), p_ref) and user_high = greatest((select auth.uid()), p_ref);
    if not found or not public.conversation_member(v_id) then
      raise exception 'not_member' using errcode = 'P0002';
    end if;
  else
    raise exception 'invalid_conversation' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Mute for a while, or unmute (null). Only in a conversation the viewer is in.
create function public.conversation_mute(p_conversation_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.conversation_member(p_conversation_id) then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  insert into public.conversation_settings (user_id, conversation_id, muted_until)
  values ((select auth.uid()), p_conversation_id, p_until)
  on conflict (user_id, conversation_id) do update set muted_until = excluded.muted_until;
end;
$$;

-- Pin or unpin a conversation for the viewer.
create function public.conversation_pin(p_conversation_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.conversation_member(p_conversation_id) then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  insert into public.conversation_settings (user_id, conversation_id, pinned_at)
  values ((select auth.uid()), p_conversation_id, case when p_pinned then now() end)
  on conflict (user_id, conversation_id) do update set pinned_at = excluded.pinned_at;
end;
$$;

revoke all on function public.share_active_circle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dm_request(uuid, text, uuid) from public, anon;
grant execute on function public.dm_request(uuid, text, uuid) to authenticated;
revoke all on function public.dm_request_respond(uuid, boolean) from public, anon;
grant execute on function public.dm_request_respond(uuid, boolean) to authenticated;
revoke all on function public.conversation_mute(uuid, timestamptz) from public, anon;
grant execute on function public.conversation_mute(uuid, timestamptz) to authenticated;
revoke all on function public.conversation_pin(uuid, boolean) from public, anon;
grant execute on function public.conversation_pin(uuid, boolean) to authenticated;

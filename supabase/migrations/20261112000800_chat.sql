-- Group chats (C7): one conversation for a Plan (its host and people going) and one for a Circle
-- (its members). Direct messages, mute and pin come in the next slice.
--
-- Decisions: a message is 1 to 1000 characters after trimming. A sender may post at most 20 messages
-- in any 60 seconds. A cancelled Plan's chat closes for everyone. Each send carries a client id, so a
-- retry returns the message it already made instead of posting again.

-- Who may read and post in a Plan's chat: the host, and anyone whose spot in it is held.
create function public.plan_chat_member(p_plan_id uuid)
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
      )
  );
$$;

-- Who may read and post in a Circle's chat: its members, while the Circle is active.
create function public.circle_chat_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.circles c
    where c.id = p_circle_id and c.status = 'active'
      and public.circle_role(c.id) is not null
  );
$$;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'circle')),
  plan_id uuid unique references public.plans (id) on delete cascade,
  circle_id uuid unique references public.circles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((kind = 'plan' and plan_id is not null and circle_id is null)
    or (kind = 'circle' and circle_id is not null and plan_id is null))
);

create function public.conversation_member(p_conversation_id uuid)
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
        or (c.kind = 'circle' and public.circle_chat_member(c.circle_id))));
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy conversations_member on public.conversations for select to authenticated
  using (public.conversation_member(id));
create policy messages_member on public.messages for select to authenticated
  using (public.conversation_member(conversation_id));
revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations, public.messages to authenticated;

-- Messages with the sender's name, for the chat screen.
create view public.message_cards
with (security_invoker = false)
as
select m.id, m.conversation_id, m.sender_id, p.display_name as sender_name, m.body, m.created_at
from public.messages m
join public.profiles p on p.id = m.sender_id
where public.conversation_member(m.conversation_id);

revoke all on public.message_cards from anon, authenticated;
grant select on public.message_cards to authenticated;

-- The conversation for a Plan or a Circle, created on first use, for members only.
create function public.conversation_open(p_kind text, p_ref uuid)
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
  else
    raise exception 'invalid_conversation' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Post a message. Sending the same client id twice returns the message already posted.
create function public.message_post(p_conversation_id uuid, p_body text, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := public.text_trim(p_body);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if not public.conversation_member(p_conversation_id) then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  -- One sender's sends are serialised: the rate count and the retry lookup see every earlier send.
  perform pg_advisory_xact_lock(hashtext('message_post:' || v_uid::text));
  select id into v_id from public.messages where sender_id = v_uid and client_id = p_client_id;
  if found then
    return jsonb_build_object('id', v_id);
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages
      where sender_id = v_uid and created_at > now() - interval '60 seconds') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, body, client_id)
  values (p_conversation_id, v_uid, v_body, p_client_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- The membership checks answer yes or no for the signed-in person only; the row policies use them.
revoke all on function public.plan_chat_member(uuid) from public, anon;
grant execute on function public.plan_chat_member(uuid) to authenticated;
revoke all on function public.circle_chat_member(uuid) from public, anon;
grant execute on function public.circle_chat_member(uuid) to authenticated;
revoke all on function public.conversation_member(uuid) from public, anon;
grant execute on function public.conversation_member(uuid) to authenticated;
revoke all on function public.conversation_open(text, uuid) from public, anon;
grant execute on function public.conversation_open(text, uuid) to authenticated;
revoke all on function public.message_post(uuid, text, uuid) from public, anon;
grant execute on function public.message_post(uuid, text, uuid) to authenticated;

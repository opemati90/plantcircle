-- Inbox (C8): one row per conversation the viewer can use, with the last message, an unread count,
-- and the viewer's own pin and mute. Chats a member has not opened yet still appear (a Plan they are
-- going to, a Circle they are in), so the inbox is never empty for someone with somewhere to talk.

alter table public.conversation_settings add column last_read_at timestamptz;

-- Mark a conversation read up to the newest message the reader has seen. The watermark never moves
-- backwards, and never past what was shown, so a message that arrived unseen stays unread.
create function public.conversation_mark_read(p_conversation_id uuid, p_up_to timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.conversation_member(p_conversation_id) then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  if p_up_to is null then
    raise exception 'invalid_read_marker' using errcode = 'P0001';
  end if;
  insert into public.conversation_settings (user_id, conversation_id, last_read_at)
  values ((select auth.uid()), p_conversation_id, least(p_up_to, now()))
  on conflict (user_id, conversation_id)
  do update set last_read_at = greatest(coalesce(public.conversation_settings.last_read_at, '-infinity'), excluded.last_read_at);
end;
$$;

create function public.inbox_threads()
returns table (
  conversation_id uuid,
  kind text,
  ref_id uuid,
  title text,
  last_body text,
  last_sender_name text,
  last_at timestamptz,
  unread integer,
  pinned boolean,
  muted boolean,
  image_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  -- Everywhere the viewer may talk: their live Plans, active Circles, and open direct chats.
  places as (
    select 'plan'::text as kind, p.id as ref_id, p.title as title, p.image_path
    from public.plans p
    where p.status <> 'cancelled'
      and (p.host_id = (select id from me)
        or exists (select 1 from public.rsvps r where r.plan_id = p.id
          and r.user_id = (select id from me) and r.state in ('going', 'checked_in', 'no_show')))
    union all
    select 'circle', c.id, c.name, null::text
    from public.circles c
    join public.circle_members m on m.circle_id = c.id and m.user_id = (select id from me)
    where c.status = 'active'
    union all
    select 'direct', case when cv.user_low = (select id from me) then cv.user_high else cv.user_low end,
      pr.display_name, null::text
    from public.conversations cv
    join public.profiles pr on pr.id = case when cv.user_low = (select id from me) then cv.user_high else cv.user_low end
    where cv.kind = 'direct' and (cv.user_low = (select id from me) or cv.user_high = (select id from me))
  ),
  threads as (
    select pl.kind, pl.ref_id, pl.title, pl.image_path, cv.id as conversation_id
    from places pl
    left join public.conversations cv
      on (pl.kind = 'plan' and cv.plan_id = pl.ref_id)
      or (pl.kind = 'circle' and cv.circle_id = pl.ref_id)
      or (pl.kind = 'direct' and cv.kind = 'direct'
          and cv.user_low = least((select id from me), pl.ref_id)
          and cv.user_high = greatest((select id from me), pl.ref_id))
  )
  select
    t.conversation_id,
    t.kind,
    t.ref_id,
    t.title,
    last.body,
    last.sender_name,
    last.created_at,
    coalesce((
      select count(*)::int from public.messages m
      where m.conversation_id = t.conversation_id
        and m.sender_id <> (select id from me)
        and m.created_at > coalesce(cs.last_read_at, '-infinity'::timestamptz)
    ), 0),
    cs.pinned_at is not null,
    cs.muted_until is not null and cs.muted_until > now(),
    t.image_path
  from threads t
  left join public.conversation_settings cs
    on cs.conversation_id = t.conversation_id and cs.user_id = (select id from me)
  left join lateral (
    select m.body, p.display_name as sender_name, m.created_at
    from public.messages m join public.profiles p on p.id = m.sender_id
    where m.conversation_id = t.conversation_id
    order by m.created_at desc limit 1
  ) last on true
  where (select id from me) is not null
  order by (cs.pinned_at is not null) desc, last.created_at desc nulls last, t.title;
$$;

revoke all on function public.conversation_mark_read(uuid, timestamptz) from public, anon;
grant execute on function public.conversation_mark_read(uuid, timestamptz) to authenticated;
revoke all on function public.inbox_threads() from public, anon;
grant execute on function public.inbox_threads() to authenticated;

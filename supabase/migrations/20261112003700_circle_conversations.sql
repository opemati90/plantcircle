-- Circle conversations, MVP (docs/superpowers/specs/2026-11-16-circle-conversations-design.md):
-- post kinds (cooked, tip, question, find), comments, removal by the Circle's hosts, and a
-- "comments on your posts" notification switch.
--
-- Only Cooked posts are challenge entries, count towards cooking weeks and towards hosting.

-- ---------------------------------------------------------------- posts

alter table public.cooks add column kind text not null default 'cooked'
  check (kind in ('cooked', 'tip', 'question', 'find'));
alter table public.cooks alter column photo_path drop not null;
alter table public.cooks alter column width drop not null;
alter table public.cooks alter column height drop not null;
alter table public.cooks drop constraint cooks_caption_check;
alter table public.cooks add constraint cooks_caption_length
  check (char_length(caption) between 1 and case when kind = 'cooked' then 140 else 500 end);
-- A photo comes with its size and may have a description; a Cooked post always has one.
alter table public.cooks add constraint cooks_photo_shape check (
  (photo_path is null) = (width is null) and (photo_path is null) = (height is null)
  and (photo_path is not null or photo_alt is null)
  and (kind <> 'cooked' or photo_path is not null));
alter table public.cooks add constraint cooks_challenge_cooked
  check (challenge_week is null or kind = 'cooked');
-- Set by a host of the Circle: hidden from everyone but the author (and staff).
alter table public.cooks add column host_removed_at timestamptz;
alter table public.cooks add column host_removed_by uuid references public.profiles (id) on delete set null;
-- When the author last heard about a comment (at most one notice per post every 10 minutes).
alter table public.cooks add column comment_notified_at timestamptz;

-- A text post has no photo to queue.
create or replace function public.cooks_queue_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_path is not null then
    delete from public.cook_uploads where photo_path = old.photo_path;
    insert into public.cook_photo_deletions (photo_path) values (old.photo_path)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------- comments

create table public.cook_comments (
  id uuid primary key default gen_random_uuid(),
  cook_id uuid not null references public.cooks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  host_removed_at timestamptz,
  host_removed_by uuid references public.profiles (id) on delete set null,
  -- Set by a staff decision, kept 90 days for an appeal.
  removed_at timestamptz
);
create index cook_comments_post on public.cook_comments (cook_id, created_at, id);
create index cook_comments_author on public.cook_comments (author_id);
alter table public.cook_comments enable row level security;
revoke all on public.cook_comments from anon, authenticated;
create trigger cook_comments_active before insert on public.cook_comments
  for each row execute function public.refuse_when_suspended();
create trigger cook_comments_not_deleted before insert on public.cook_comments
  for each row execute function public.refuse_when_deleted();

-- Comments made, kept two days, so deleting one does not give it back.
create table public.cook_comment_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index cook_comment_log_user on public.cook_comment_log (user_id, created_at);
alter table public.cook_comment_log enable row level security;
revoke all on public.cook_comment_log from anon, authenticated;

-- Whether the caller may remove content by p_author in a Circle: the owner and moderators may
-- remove members' content (or a former member's), never a host's, and not their own this way (they
-- delete that). Staff handle the rest through reports.
create function public.circle_can_remove(p_circle_id uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select me.role in ('owner', 'moderator')
      and p_author <> (select auth.uid())
      and coalesce((
        select them.role from public.circle_members them
        where them.circle_id = p_circle_id and them.user_id = p_author), 'member') = 'member'
    from public.circle_members me
    join public.circles c on c.id = me.circle_id and c.status = 'active'
    join public.profiles p on p.id = me.user_id and p.status = 'active'
    where me.circle_id = p_circle_id and me.user_id = (select auth.uid())), false);
$$;
revoke all on function public.circle_can_remove(uuid, uuid) from public, anon;
grant execute on function public.circle_can_remove(uuid, uuid) to authenticated;

-- A comment the caller can see: on a post they can see, never across a block, never removed by
-- staff; one a host removed only for its author.
create function public.cook_comment_visible(p_comment public.cook_comments)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_comment.removed_at is null
    and (p_comment.host_removed_at is null or p_comment.author_id = (select auth.uid()))
    and not public.hidden_by_block(p_comment.author_id)
    and exists (select 1 from public.profiles p where p.id = p_comment.author_id and p.status = 'active');
$$;
revoke all on function public.cook_comment_visible(public.cook_comments) from public, anon;
grant execute on function public.cook_comment_visible(public.cook_comments) to authenticated;

-- ---------------------------------------------------------------- what members see

-- New columns at the end (kind, host_removed, comments, can_remove). A post a host removed is
-- shown to its author only, marked.
create or replace view public.cook_cards
with (security_invoker = false)
as
select
  k.id,
  k.circle_id,
  c.name as circle_name,
  k.author_id,
  p.display_name as author_name,
  k.recipe_id,
  rc.title as recipe_title,
  k.caption,
  k.photo_path,
  k.photo_alt,
  k.width,
  k.height,
  k.created_at,
  (select count(*)::int from public.cook_reactions r where r.cook_id = k.id) as reactions,
  exists (select 1 from public.cook_reactions r where r.cook_id = k.id and r.user_id = auth.uid()) as reacted,
  k.challenge_week,
  k.challenge_theme,
  k.kind,
  k.host_removed_at is not null as host_removed,
  (select count(*)::int from public.cook_comments cc
   where cc.cook_id = k.id and cc.host_removed_at is null and public.cook_comment_visible(cc)) as comments,
  public.circle_can_remove(k.circle_id, k.author_id) and k.host_removed_at is null as can_remove
from public.cooks k
join public.circles c on c.id = k.circle_id
join public.profiles p on p.id = k.author_id and p.status = 'active'
left join public.recipe_cards rc on rc.id = k.recipe_id
where k.removed_at is null
  and (k.host_removed_at is null or k.author_id = auth.uid())
  and public.circle_active_member(k.circle_id)
  and not public.hidden_by_block(k.author_id);

create or replace view public.my_cooks
with (security_invoker = false)
as
select
  k.id,
  k.circle_id,
  c.name as circle_name,
  k.caption,
  k.photo_path,
  k.photo_alt,
  k.width,
  k.height,
  k.created_at,
  (select count(*)::int from public.cook_reactions r where r.cook_id = k.id) as reactions,
  k.kind,
  k.host_removed_at is not null as host_removed
from public.cooks k
join public.circles c on c.id = k.circle_id
where k.author_id = auth.uid() and k.removed_at is null;

-- One post's comments, oldest first.
create view public.cook_comment_cards
with (security_invoker = false)
as
select
  cc.id,
  cc.cook_id,
  cc.author_id,
  p.display_name as author_name,
  cc.body,
  cc.created_at,
  cc.host_removed_at is not null as host_removed,
  public.circle_can_remove(k.circle_id, cc.author_id) and cc.host_removed_at is null as can_remove
from public.cook_comments cc
-- Only under a post the caller can see (membership, blocks, removals, its author active).
join public.cook_cards k on k.id = cc.cook_id
join public.profiles p on p.id = cc.author_id
where public.cook_comment_visible(cc);
revoke all on public.cook_comment_cards from public, anon, authenticated;
grant select on public.cook_comment_cards to authenticated;

-- ---------------------------------------------------------------- writes

-- cook_create gains the kind. The seven- and six-argument versions forward as Cooked, with the
-- same request fingerprint as before, so a retry across versions replays.
create function public.cook_create(
  p_circle_id uuid,
  p_recipe_id uuid,
  p_caption text,
  p_photo_path text,
  p_photo_alt text,
  p_challenge_week date,
  p_kind text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_kind text := coalesce(p_kind, 'cooked');
  v_caption text := public.text_trim(p_caption);
  v_alt text := nullif(public.text_trim(p_photo_alt), '');
  v_fingerprint text;
  v_replay jsonb;
  v_upload public.cook_uploads%rowtype;
  v_id uuid;
  v_week date;
  -- A CASE inside an IF condition would end the condition early, so the limit is worked out here.
  v_limit integer := case when coalesce(p_kind, 'cooked') = 'cooked' then 140 else 500 end;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_fingerprint := 'cook_create:' || (jsonb_build_object(
    'circle', p_circle_id, 'recipe', p_recipe_id, 'caption', v_caption, 'path', p_photo_path,
    'alt', v_alt)
    || case when p_challenge_week is null then '{}'::jsonb
            else jsonb_build_object('challenge', p_challenge_week) end
    || case when v_kind = 'cooked' then '{}'::jsonb else jsonb_build_object('kind', v_kind) end)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  if not public.circle_active_member(p_circle_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  if v_kind not in ('cooked', 'tip', 'question', 'find')
    or char_length(coalesce(v_caption, '')) not between 1 and v_limit
    or char_length(coalesce(v_alt, '')) > 200
    -- A Cooked post has a photo; a description needs a photo.
    or (v_kind = 'cooked' and p_photo_path is null)
    or (p_photo_path is null and v_alt is not null)
    -- Recipes and the challenge are for what you cooked.
    or (v_kind <> 'cooked' and (p_recipe_id is not null or p_challenge_week is not null)) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- An entry only for the week the member saw: the week may have turned since.
  if p_challenge_week is not null then
    v_week := public.circle_week_start(p_circle_id, now());
    if p_challenge_week <> v_week then
      raise exception 'challenge_ended' using errcode = 'P0001';
    end if;
  end if;
  if p_recipe_id is not null and not exists (
    select 1 from public.recipes r where r.id = p_recipe_id and r.circle_id = p_circle_id) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- The caller's own upload, stored, recent and not used.
  if p_photo_path is not null then
    select * into v_upload from public.cook_uploads
    where photo_path = p_photo_path and user_id = v_uid for update;
    if not found or v_upload.stored_at is null or v_upload.used_at is not null
      or v_upload.created_at < now() - interval '12 hours' then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('cook_create:' || v_uid::text));
  if (select count(*) from public.cook_post_log
      where user_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if p_photo_path is not null then
    update public.cook_uploads set used_at = now() where photo_path = p_photo_path;
  end if;
  insert into public.cooks (author_id, circle_id, recipe_id, caption, photo_path, photo_alt, width, height,
    challenge_week, challenge_theme, kind)
  values (v_uid, p_circle_id, p_recipe_id, v_caption, p_photo_path, v_alt, v_upload.width, v_upload.height,
    v_week,
    (select theme from public.circle_challenges where circle_id = p_circle_id and week_start = v_week),
    v_kind)
  returning id into v_id;
  insert into public.cook_post_log (user_id) values (v_uid);

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;
revoke all on function public.cook_create(uuid, uuid, text, text, text, date, text, uuid) from public, anon;
grant execute on function public.cook_create(uuid, uuid, text, text, text, date, text, uuid) to authenticated;

create or replace function public.cook_create(
  p_circle_id uuid,
  p_recipe_id uuid,
  p_caption text,
  p_photo_path text,
  p_photo_alt text,
  p_challenge_week date,
  p_idempotency_key uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.cook_create(p_circle_id, p_recipe_id, p_caption, p_photo_path, p_photo_alt,
    p_challenge_week, 'cooked', p_idempotency_key);
$$;

-- Add a comment to a post the caller can see. The post's author hears about it (their switch),
-- at most once per post every 10 minutes, never for their own comment.
create function public.cook_comment_add(p_cook_id uuid, p_body text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := public.text_trim(p_body);
  v_fingerprint text;
  v_replay jsonb;
  v_post public.cooks%rowtype;
  v_id uuid;
  v_wanted boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_fingerprint := 'cook_comment_add:' || jsonb_build_object('cook', p_cook_id, 'body', v_body)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  if char_length(coalesce(v_body, '')) not between 1 and 500 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- The post's row first: a removal at the same moment either lands before (and the comment is
  -- refused) or waits; two comments at once queue here, so they send one notice and never
  -- deadlock on the comment's reference to the post.
  select * into v_post from public.cooks where id = p_cook_id for update;
  -- A post the caller can see, and not one a host removed (its author still sees it).
  if not found or not exists (select 1 from public.cook_cards where id = p_cook_id and not host_removed) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('cook_comment_add:' || v_uid::text));
  if (select count(*) from public.cook_comment_log
      where user_id = v_uid and created_at > now() - interval '24 hours') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.cook_comments (cook_id, author_id, body) values (p_cook_id, v_uid, v_body)
  returning id into v_id;
  insert into public.cook_comment_log (user_id) values (v_uid);

  -- The author hears about it while still a member of an active Circle, with their switch on, at
  -- most once every 10 minutes. The comment's words never go into the notice (push-dispatch
  -- writes the text in their language, and keeps the lock screen generic unless they chose
  -- otherwise).
  if v_post.author_id <> v_uid
     and (v_post.comment_notified_at is null or v_post.comment_notified_at < now() - interval '10 minutes')
     and exists (select 1 from public.circle_members m join public.circles c on c.id = m.circle_id
                 where m.circle_id = v_post.circle_id and m.user_id = v_post.author_id and c.status = 'active') then
    select coalesce((select s.notif_comments from public.user_settings s where s.user_id = v_post.author_id), true)
      into v_wanted;
    if v_wanted then
      update public.cooks set comment_notified_at = now() where id = p_cook_id;
      perform public.notify(v_post.author_id, 'cook_comment',
        jsonb_build_object('cook_id', p_cook_id, 'circle_id', v_post.circle_id,
          'circle', (select name from public.circles where id = v_post.circle_id),
          'name', (select display_name from public.profiles where id = v_uid)),
        true, true, false,
        'New comment on your post', 'New comment on your post', 'New comment on your post', false);
    end if;
  end if;

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;
revoke all on function public.cook_comment_add(uuid, text, uuid) from public, anon;
grant execute on function public.cook_comment_add(uuid, text, uuid) to authenticated;

-- Your own comment, gone for good.
create function public.cook_comment_delete(p_comment_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fingerprint text := 'cook_comment_delete:' || p_comment_id::text;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  delete from public.cook_comments where id = p_comment_id and author_id = v_uid and removed_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('deleted', true));
end;
$$;
revoke all on function public.cook_comment_delete(uuid, uuid) from public, anon;
grant execute on function public.cook_comment_delete(uuid, uuid) to authenticated;

-- A host removes a post: hidden from everyone but its author, who is told. Audited. Removing it
-- again is a no-op (one notice, one audit row).
create function public.circle_post_remove(p_cook_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.cooks%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_post from public.cooks where id = p_cook_id and removed_at is null for update;
  if not found or not public.circle_active_member(v_post.circle_id)
     or public.hidden_by_block(v_post.author_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Permission first, so a member learns nothing about what a host already removed.
  if not public.circle_can_remove(v_post.circle_id, v_post.author_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_post.host_removed_at is not null then
    return jsonb_build_object('removed', true);
  end if;
  update public.cooks set host_removed_at = now(), host_removed_by = v_uid where id = p_cook_id;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, subject_id)
  values (v_uid, 'host', 'circle.remove_post', 'cook', p_cook_id, v_post.author_id);
  perform public.notify(v_post.author_id, 'circle_post_removed',
    jsonb_build_object('cook_id', p_cook_id, 'circle_id', v_post.circle_id, 'what', 'post',
      'circle', (select name from public.circles where id = v_post.circle_id)),
    true, true, false, 'A host removed your post',
    'It no longer shows in the Circle.', 'A host removed your post', false);
  return jsonb_build_object('removed', true);
end;
$$;
revoke all on function public.circle_post_remove(uuid) from public, anon;
grant execute on function public.circle_post_remove(uuid) to authenticated;

create function public.circle_comment_remove(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_comment public.cook_comments%rowtype;
  v_post public.cooks%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_comment from public.cook_comments where id = p_comment_id and removed_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_post from public.cooks where id = v_comment.cook_id;
  -- Under a post the host can see (membership, blocks, removals), by someone they have not blocked.
  if not exists (select 1 from public.cook_cards where id = v_comment.cook_id and not host_removed)
     or public.hidden_by_block(v_comment.author_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.circle_can_remove(v_post.circle_id, v_comment.author_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_comment.host_removed_at is not null then
    return jsonb_build_object('removed', true);
  end if;
  update public.cook_comments set host_removed_at = now(), host_removed_by = v_uid where id = p_comment_id;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id, subject_id)
  values (v_uid, 'host', 'circle.remove_comment', 'cook_comment', p_comment_id, v_comment.author_id);
  perform public.notify(v_comment.author_id, 'circle_post_removed',
    jsonb_build_object('cook_id', v_post.id, 'circle_id', v_post.circle_id, 'what', 'comment',
      'circle', (select name from public.circles where id = v_post.circle_id)),
    true, true, false, 'A host removed your comment',
    'It no longer shows in the Circle.', 'A host removed your comment', false);
  return jsonb_build_object('removed', true);
end;
$$;
revoke all on function public.circle_comment_remove(uuid) from public, anon;
grant execute on function public.circle_comment_remove(uuid) to authenticated;

-- ---------------------------------------------------------------- what counts

-- Cooking weeks: what you cooked, not questions or tips; not posts a host removed.
create or replace function public.cook_streak()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_this date := date_trunc('week', now() at time zone 'UTC')::date;
  v_current integer := 0;
  v_best integer := 0;
  v_run integer := 0;
  v_total integer := 0;
  v_prev date;
  v_week date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  for v_week in
    select distinct date_trunc('week', created_at at time zone 'UTC')::date
    from public.cooks
    where author_id = v_uid and removed_at is null and host_removed_at is null and kind = 'cooked'
    order by 1
  loop
    v_total := v_total + 1;
    v_run := case when v_prev is not null and v_week = v_prev + 7 then v_run + 1 else 1 end;
    v_best := greatest(v_best, v_run);
    v_prev := v_week;
  end loop;
  if v_prev is not null and v_prev >= v_this - 7 then
    v_current := v_run;
  end if;
  return jsonb_build_object('current', v_current, 'best', v_best, 'weeks', v_total);
end;
$$;

-- The posts that count towards hosting: what you cooked, still up.
create function public.cook_post_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.cooks
  where author_id = p_user_id and removed_at is null and host_removed_at is null and kind = 'cooked';
$$;
revoke all on function public.cook_post_count(uuid) from public, anon, authenticated;

create or replace function public.host_level_of(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_posts integer;
  v_days integer;
  v_row public.host_levels%rowtype;
  v_level integer := 0;
begin
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_verified_host) then
    return (select max(level) from public.host_levels);
  end if;
  v_posts := public.cook_post_count(p_user_id);
  select greatest(0, extract(day from now() - created_at))::int into v_days
  from public.profiles where id = p_user_id;
  for v_row in select * from public.host_levels order by level loop
    exit when v_posts < v_row.posts or coalesce(v_days, 0) < v_row.account_days;
    v_level := v_row.level;
  end loop;
  return v_level;
end;
$$;

create or replace function public.host_level()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p_user_id uuid := (select auth.uid());
  v_recipes integer;
  v_hosted integer;
  v_followers integer;
  v_upvotes integer;
  v_posts integer;
  v_days integer;
  v_level public.host_levels%rowtype;
  v_next public.host_levels%rowtype;
  v_current integer := 0;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select c.recipes, c.hosted, c.followers, c.upvotes
    into v_recipes, v_hosted, v_followers, v_upvotes from public.host_counts(p_user_id) c;
  v_posts := public.cook_post_count(p_user_id);
  select greatest(0, extract(day from now() - created_at))::int into v_days
  from public.profiles where id = p_user_id;

  v_current := public.host_level_of(p_user_id);
  select * into v_level from public.host_levels where level = v_current;
  select * into v_next from public.host_levels where level = v_current + 1;

  return jsonb_build_object(
    'level', v_current,
    'recipes', v_recipes, 'hosted', v_hosted, 'followers', v_followers, 'upvotes', v_upvotes,
    'posts', v_posts, 'account_days', coalesce(v_days, 0),
    'max_capacity', coalesce(v_level.max_capacity, 0),
    'in_person', coalesce(v_level.in_person, false),
    'group_orders', coalesce(v_level.group_orders, false),
    -- Level 3 is verification only, so it is never shown as the next step.
    'next', case when v_next.level is null or v_next.level = 3 then null else jsonb_build_object(
      'level', v_next.level, 'recipes', v_next.recipes, 'hosted', v_next.hosted,
      'followers', v_next.followers, 'upvotes', v_next.upvotes,
      'posts', v_next.posts, 'account_days', v_next.account_days,
      'max_capacity', v_next.max_capacity, 'in_person', v_next.in_person,
      'group_orders', v_next.group_orders) end);
end;
$$;

-- This week's challenge: entries are Cooked posts still up.
create or replace function public.circle_challenge(p_circle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week date;
  v_tz text;
begin
  if not public.circle_active_member(p_circle_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  v_tz := public.circle_tz(p_circle_id);
  v_week := public.circle_week_start(p_circle_id, now());
  return jsonb_build_object(
    'week_start', v_week,
    'ends_at', ((v_week + 7)::timestamp at time zone v_tz),
    'theme', (select theme from public.circle_challenges where circle_id = p_circle_id and week_start = v_week),
    'can_set', public.circle_role(p_circle_id) in ('owner', 'moderator'),
    'entrants', (select count(distinct k.author_id)::int from public.cook_cards k
                 where k.circle_id = p_circle_id and k.challenge_week = v_week
                   and k.kind = 'cooked' and not k.host_removed),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'photo_path', e.photo_path, 'caption', e.caption,
        'author_name', e.author_name) order by e.created_at desc)
      from (select k.id, k.photo_path, k.caption, k.author_name, k.created_at from public.cook_cards k
            where k.circle_id = p_circle_id and k.challenge_week = v_week
              and k.kind = 'cooked' and not k.host_removed
            order by k.created_at desc limit 4) e), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- reports and staff

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('person', 'plan', 'circle', 'recipe', 'message', 'order', 'app', 'cook',
                         'cook_comment'));

create or replace function public.report_target_exists(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    -- The app itself (an accessibility problem, say): always reportable by a member.
    when 'app' then (select auth.uid()) is not null
    -- A person you could have met: a shared active Circle, a direct conversation or request, or a
    -- Plan one of you hosts and the other is in.
    when 'person' then p_id <> (select auth.uid()) and exists (select 1 from public.profiles where id = p_id) and (
      public.share_active_circle((select auth.uid()), p_id)
      or exists (select 1 from public.conversations c where c.kind = 'direct'
                 and c.user_low = least((select auth.uid()), p_id) and c.user_high = greatest((select auth.uid()), p_id))
      or exists (select 1 from public.message_requests r
                 where (r.from_id = p_id and r.to_id = (select auth.uid())) or (r.from_id = (select auth.uid()) and r.to_id = p_id))
      or exists (select 1 from public.plans p join public.rsvps r on r.plan_id = p.id
                 where (p.host_id = p_id and r.user_id = (select auth.uid())) or (p.host_id = (select auth.uid()) and r.user_id = p_id))
      or exists (select 1 from public.plans p where p.host_id = p_id and p.status <> 'draft'))
    when 'plan' then exists (select 1 from public.plans where id = p_id and status <> 'draft')
    when 'order' then exists (select 1 from public.group_orders o join public.plans p on p.id = o.plan_id
                              where o.plan_id = p_id and p.status <> 'draft')
    when 'circle' then exists (select 1 from public.circle_cards where id = p_id)
    when 'recipe' then exists (select 1 from public.recipe_cards where id = p_id)
    when 'message' then exists (
      select 1 from public.messages m where m.id = p_id and public.conversation_member(m.conversation_id))
    -- A post you can see and did not write.
    when 'cook' then exists (select 1 from public.cook_cards where id = p_id and author_id <> (select auth.uid()))
    -- A comment you can see and did not write.
    when 'cook_comment' then exists (select 1 from public.cook_comment_cards
                                     where id = p_id and author_id <> (select auth.uid()))
    else false end;
$$;

create or replace function public.report_target_user(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'person' then p_id
    when 'plan' then (select host_id from public.plans where id = p_id)
    when 'order' then (select host_id from public.plans where id = p_id)
    when 'circle' then (select created_by from public.circles where id = p_id)
    when 'recipe' then (select author_id from public.recipes where id = p_id)
    when 'message' then (select sender_id from public.messages where id = p_id)
    when 'cook' then (select author_id from public.cooks where id = p_id)
    when 'cook_comment' then (select author_id from public.cook_comments where id = p_id)
    else null end;
$$;

create or replace function public.report_target_label(p_type text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'person' then (select display_name from public.profiles where id = p_id)
    when 'plan' then (select title from public.plans where id = p_id)
    when 'order' then (select title from public.plans where id = p_id)
    when 'circle' then (select name from public.circles where id = p_id)
    when 'recipe' then (select title from public.recipes where id = p_id)
    -- Never a message body: private messages are read only through staff_view_messages, with a reason.
    when 'message' then null
    when 'cook' then (select caption from public.cooks where id = p_id)
    when 'cook_comment' then (select left(body, 140) from public.cook_comments where id = p_id)
    else null end;
$$;

-- Staff "remove content" hides a post or a comment; a reversed appeal shows it again while no
-- other removal of it stands. Independent of a host's removal, which stays.
create or replace function public.cooks_remove_on_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'remove_content' then
    update public.cooks k set removed_at = now()
    from public.reports r
    where r.id = new.report_id and r.target_type = 'cook' and k.id = r.target_id and k.removed_at is null;
    update public.cook_comments c set removed_at = now()
    from public.reports r
    where r.id = new.report_id and r.target_type = 'cook_comment' and c.id = r.target_id
      and c.removed_at is null;
  end if;
  return new;
end;
$$;

create or replace function public.cooks_restore_on_appeal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_target uuid;
begin
  if new.status = 'reversed' and old.status is distinct from 'reversed' then
    select r.target_type, r.target_id into v_type, v_target
    from public.moderation_actions a join public.reports r on r.id = a.report_id
    where a.id = new.action_id and a.action = 'remove_content' and r.target_type in ('cook', 'cook_comment');
    if v_target is null then
      return new;
    end if;
    -- Two appeals reversed at once wait on the row, so the second sees the first and restores it.
    if v_type = 'cook' then
      perform 1 from public.cooks where id = v_target for update;
    else
      perform 1 from public.cook_comments where id = v_target for update;
    end if;
    -- Shown again only when no other removal of the same item still stands.
    if not exists (
        select 1 from public.moderation_actions a2 join public.reports r2 on r2.id = a2.report_id
        where a2.id <> new.action_id and a2.action = 'remove_content' and r2.target_type = v_type
          and r2.target_id = v_target
          and not exists (select 1 from public.appeals ap where ap.action_id = a2.id and ap.status = 'reversed')) then
      if v_type = 'cook' then
        update public.cooks set removed_at = null where id = v_target;
      else
        update public.cook_comments set removed_at = null where id = v_target;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Staff see a reported post or comment (its text and, for a post, the photo's path). Logged.
create or replace function public.staff_cook(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_report public.reports%rowtype;
begin
  v_uid := public.require_staff();
  select * into v_report from public.reports where id = p_report_id;
  if not found or v_report.target_type not in ('cook', 'cook_comment') then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id)
  values (v_uid, 'staff', 'staff.view_cook', 'report', p_report_id);
  if v_report.target_type = 'cook_comment' then
    return (select jsonb_build_object('caption', c.body, 'photo_path', null, 'photo_alt', null,
              'removed', c.removed_at is not null, 'comment', true)
            from public.cook_comments c where c.id = v_report.target_id);
  end if;
  return (select jsonb_build_object('caption', k.caption, 'photo_path', k.photo_path,
            'photo_alt', k.photo_alt, 'removed', k.removed_at is not null, 'comment', false)
          from public.cooks k where k.id = v_report.target_id);
end;
$$;

-- ---------------------------------------------------------------- deletion and cleanup

-- A deleted account takes its posts, comments, reactions and unused uploads with it.
create or replace function public.cooks_remove_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cooks where author_id = new.id;
  delete from public.cook_comments where author_id = new.id;
  delete from public.cook_reactions where user_id = new.id;
  insert into public.cook_photo_deletions (photo_path)
  select photo_path from public.cook_uploads where user_id = new.id
  on conflict do nothing;
  delete from public.cook_uploads where user_id = new.id;
  return new;
end;
$$;

-- Unused uploads after a day; posts and comments staff or a host removed after 90 days; the logs
-- after two days.
create or replace function public.cooks_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cook_photo_deletions (photo_path)
  select photo_path from public.cook_uploads
  where used_at is null and created_at < now() - interval '24 hours'
  on conflict do nothing;
  delete from public.cook_uploads where used_at is null and created_at < now() - interval '24 hours';
  delete from public.cooks where removed_at < now() - interval '90 days'
    or host_removed_at < now() - interval '90 days';
  delete from public.cook_comments where removed_at < now() - interval '90 days'
    or host_removed_at < now() - interval '90 days';
  delete from public.cook_post_log where created_at < now() - interval '2 days';
  delete from public.cook_upload_log where created_at < now() - interval '2 days';
  delete from public.cook_comment_log where created_at < now() - interval '2 days';
end;
$$;

-- ---------------------------------------------------------------- the switch

alter table public.user_settings add column notif_comments boolean not null default true;
-- Members who turned off group chats hear nothing new either until they choose otherwise.
update public.user_settings set notif_comments = notif_chats;

create or replace function public.settings_get()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.user_settings%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  insert into public.user_settings (user_id) values (v_uid) on conflict do nothing;
  select * into v_row from public.user_settings where user_id = v_uid;
  return jsonb_build_object(
    'analytics_consent', v_row.analytics_consent,
    'personalisation_consent', v_row.personalisation_consent,
    'consent_decided_at', v_row.consent_decided_at,
    'notif_reminders', v_row.notif_reminders,
    'notif_waitlist', v_row.notif_waitlist,
    'notif_direct', v_row.notif_direct,
    'notif_chats', v_row.notif_chats,
    'notif_comments', v_row.notif_comments,
    'quiet_hours', v_row.quiet_hours,
    'quiet_start', v_row.quiet_start,
    'quiet_end', v_row.quiet_end,
    'lock_screen_text', v_row.lock_screen_text,
    'notif_prompt_dismissed_at', v_row.notif_prompt_dismissed_at,
    'language', v_row.language,
    'export_requested_at', (select max(created_at) from public.data_requests
                            where user_id = v_uid and kind = 'export' and status = 'requested'));
end;
$$;

create or replace function public.settings_update(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.user_settings%rowtype;
  v_bool boolean;
  v_key text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  perform public.settings_get();
  select * into v_old from public.user_settings where user_id = v_uid for update;

  -- Only known keys, and JSON booleans and integers (no text that happens to cast).
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key in ('analytics_consent', 'personalisation_consent', 'notif_reminders', 'notif_waitlist',
                 'notif_direct', 'notif_chats', 'notif_comments', 'quiet_hours', 'lock_screen_text',
                 'notif_prompt_dismissed') then
      if jsonb_typeof(p_patch -> v_key) <> 'boolean' then
        raise exception 'invalid_settings' using errcode = 'P0001';
      end if;
    elsif v_key in ('quiet_start', 'quiet_end') then
      if jsonb_typeof(p_patch -> v_key) <> 'number' or (p_patch ->> v_key) !~ '^[0-9]+$' then
        raise exception 'invalid_settings' using errcode = 'P0001';
      end if;
    elsif v_key = 'language' then
      if jsonb_typeof(p_patch -> v_key) <> 'string'
         or (p_patch ->> v_key) not in ('en', 'de', 'es', 'pt', 'fr', 'pl', 'it', 'nl') then
        raise exception 'invalid_settings' using errcode = 'P0001';
      end if;
    else
      raise exception 'invalid_settings' using errcode = 'P0001';
    end if;
  end loop;

  if p_patch ? 'analytics_consent' then
    v_bool := (p_patch ->> 'analytics_consent')::boolean;
    if v_bool is distinct from v_old.analytics_consent or v_old.consent_decided_at is null then
      insert into public.consent_events (user_id, kind, value) values (v_uid, 'analytics', v_bool);
    end if;
  end if;
  if p_patch ? 'personalisation_consent' then
    v_bool := (p_patch ->> 'personalisation_consent')::boolean;
    if v_bool is distinct from v_old.personalisation_consent or v_old.consent_decided_at is null then
      insert into public.consent_events (user_id, kind, value) values (v_uid, 'personalisation', v_bool);
    end if;
  end if;

  update public.user_settings set
    analytics_consent = coalesce((p_patch ->> 'analytics_consent')::boolean, analytics_consent),
    personalisation_consent = coalesce((p_patch ->> 'personalisation_consent')::boolean, personalisation_consent),
    consent_decided_at = case when p_patch ? 'analytics_consent' or p_patch ? 'personalisation_consent'
                              then now() else consent_decided_at end,
    notif_reminders = coalesce((p_patch ->> 'notif_reminders')::boolean, notif_reminders),
    notif_waitlist = coalesce((p_patch ->> 'notif_waitlist')::boolean, notif_waitlist),
    notif_direct = coalesce((p_patch ->> 'notif_direct')::boolean, notif_direct),
    notif_chats = coalesce((p_patch ->> 'notif_chats')::boolean, notif_chats),
    notif_comments = coalesce((p_patch ->> 'notif_comments')::boolean, notif_comments),
    quiet_hours = coalesce((p_patch ->> 'quiet_hours')::boolean, quiet_hours),
    quiet_start = coalesce((p_patch ->> 'quiet_start')::smallint, quiet_start),
    quiet_end = coalesce((p_patch ->> 'quiet_end')::smallint, quiet_end),
    lock_screen_text = coalesce((p_patch ->> 'lock_screen_text')::boolean, lock_screen_text),
    language = coalesce(p_patch ->> 'language', language),
    notif_prompt_dismissed_at = case when (p_patch ->> 'notif_prompt_dismissed')::boolean then now()
                                     else notif_prompt_dismissed_at end,
    updated_at = now()
  where user_id = v_uid;
  return public.settings_get();
end;
$$;

-- Cooked it (docs/superpowers/specs/2026-11-15-cooked-it-design.md): a member shares a photo of
-- something they cooked with one of their Circles. Only that Circle's active members see it,
-- blocks hide it both ways, and it can be reported.
--
-- Photos: the app sends the JPEG to the `cook-upload` edge function, which strips every metadata
-- segment, decodes it to be sure it is a picture, reserves the upload here (30 a day), stores
-- `<author>/<uuid>.jpg` and `<author>/<uuid>.thumb.jpg` in the private bucket `cook-photos`, and
-- marks the upload stored. cook_create then turns a stored upload into a post. Members cannot
-- read the bucket themselves: `cook-photo-urls` checks what they may see and signs it for 10
-- minutes. Every photo that goes (author delete, account deletion, removal after a staff
-- decision, uploads never used or never finished) is queued and removed through the Storage API
-- by the `cook-photo-cleanup` worker.

-- ---------------------------------------------------------------- tables

-- An upload, written only by the cook-upload function (service role).
create table public.cook_uploads (
  photo_path text primary key check (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  created_at timestamptz not null default now(),
  -- Set once both files are in Storage. A reservation that never gets here is cleaned up.
  stored_at timestamptz,
  used_at timestamptz
);
create index cook_uploads_user_recent on public.cook_uploads (user_id, created_at desc);
alter table public.cook_uploads enable row level security;
revoke all on public.cook_uploads from anon, authenticated;

-- Uploads made, kept two days whatever happens to them, for the daily upload limit.
create table public.cook_upload_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index cook_upload_log_user on public.cook_upload_log (user_id, created_at);
alter table public.cook_upload_log enable row level security;
revoke all on public.cook_upload_log from anon, authenticated;

create table public.cooks (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  circle_id uuid not null references public.circles (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete set null,
  caption text not null check (char_length(caption) between 1 and 140),
  photo_path text not null unique references public.cook_uploads (photo_path),
  photo_alt text check (char_length(photo_alt) between 1 and 200),
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now(),
  -- Set by a staff decision: hidden from everyone but staff, kept 90 days for an appeal.
  removed_at timestamptz
);
create index cooks_circle_recent on public.cooks (circle_id, created_at desc, id desc);
create index cooks_author_recent on public.cooks (author_id, created_at desc, id desc);
alter table public.cooks enable row level security;
revoke all on public.cooks from anon, authenticated;
create trigger cooks_active before insert on public.cooks
  for each row execute function public.refuse_when_suspended();
create trigger cooks_not_deleted before insert on public.cooks
  for each row execute function public.refuse_when_deleted();

-- Posts made, kept two days, so deleting a post does not give a post back.
create table public.cook_post_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index cook_post_log_user on public.cook_post_log (user_id, created_at);
alter table public.cook_post_log enable row level security;
revoke all on public.cook_post_log from anon, authenticated;

create table public.cook_reactions (
  cook_id uuid not null references public.cooks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cook_id, user_id)
);
create index cook_reactions_user on public.cook_reactions (user_id);
alter table public.cook_reactions enable row level security;
revoke all on public.cook_reactions from anon, authenticated;
create trigger cook_reactions_active before insert on public.cook_reactions
  for each row execute function public.refuse_when_suspended();
create trigger cook_reactions_not_deleted before insert on public.cook_reactions
  for each row execute function public.refuse_when_deleted();

-- Photos to remove from Storage (the photo and its thumbnail). Only the worker reads it.
create table public.cook_photo_deletions (
  photo_path text primary key,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0
);
alter table public.cook_photo_deletions enable row level security;
revoke all on public.cook_photo_deletions from anon, authenticated;

-- A post that goes takes its upload with it, and the photo is queued.
create function public.cooks_queue_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cook_uploads where photo_path = old.photo_path;
  insert into public.cook_photo_deletions (photo_path) values (old.photo_path)
  on conflict do nothing;
  return old;
end;
$$;
revoke all on function public.cooks_queue_photo() from public, anon, authenticated;
create trigger cooks_queue_photo after delete on public.cooks
  for each row execute function public.cooks_queue_photo();

-- ---------------------------------------------------------------- what members see

-- Whether the caller is a member of an active Circle. Views check function privileges as the
-- caller, so members may run it; it reveals only their own membership.
create function public.circle_active_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.circle_members m join public.circles c on c.id = m.circle_id
    where m.circle_id = p_circle_id and m.user_id = (select auth.uid()) and c.status = 'active');
$$;
revoke all on function public.circle_active_member(uuid) from public, anon;
grant execute on function public.circle_active_member(uuid) to authenticated;

-- Posts in the caller's active Circles by active members, never across a block, never removed.
-- The recipe's title only when the caller can see that recipe.
create view public.cook_cards
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
  exists (select 1 from public.cook_reactions r where r.cook_id = k.id and r.user_id = auth.uid()) as reacted
from public.cooks k
join public.circles c on c.id = k.circle_id
join public.profiles p on p.id = k.author_id and p.status = 'active'
left join public.recipe_cards rc on rc.id = k.recipe_id
where k.removed_at is null
  and public.circle_active_member(k.circle_id)
  and not public.hidden_by_block(k.author_id);
revoke all on public.cook_cards from public, anon, authenticated;
grant select on public.cook_cards to authenticated;

-- Your own posts, wherever they are (including Circles you left), so you can always delete them.
create view public.my_cooks
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
  (select count(*)::int from public.cook_reactions r where r.cook_id = k.id) as reactions
from public.cooks k
join public.circles c on c.id = k.circle_id
where k.author_id = auth.uid() and k.removed_at is null;
revoke all on public.my_cooks from public, anon, authenticated;
grant select on public.my_cooks to authenticated;

-- ---------------------------------------------------------------- writes

-- Turn an upload into a post.
create function public.cook_create(
  p_circle_id uuid,
  p_recipe_id uuid,
  p_caption text,
  p_photo_path text,
  p_photo_alt text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_caption text := public.text_trim(p_caption);
  v_alt text := nullif(public.text_trim(p_photo_alt), '');
  v_fingerprint text;
  v_replay jsonb;
  v_upload public.cook_uploads%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  v_fingerprint := 'cook_create:' || jsonb_build_object(
    'circle', p_circle_id, 'recipe', p_recipe_id, 'caption', v_caption, 'path', p_photo_path,
    'alt', v_alt)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  if not public.circle_active_member(p_circle_id) then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  if char_length(coalesce(v_caption, '')) not between 1 and 140
    or char_length(coalesce(v_alt, '')) > 200 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- A recipe shared in the same Circle, so everyone who sees the post can open it.
  if p_recipe_id is not null and not exists (
    select 1 from public.recipes r where r.id = p_recipe_id and r.circle_id = p_circle_id) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- The caller's own upload, recent and not used: an older one may already be queued for removal.
  select * into v_upload from public.cook_uploads
  where photo_path = p_photo_path and user_id = v_uid for update;
  if not found or v_upload.stored_at is null or v_upload.used_at is not null
    or v_upload.created_at < now() - interval '12 hours' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- One member's posts are serialised, so the daily count and the insert see each other.
  perform pg_advisory_xact_lock(hashtext('cook_create:' || v_uid::text));
  if (select count(*) from public.cook_post_log
      where user_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  update public.cook_uploads set used_at = now() where photo_path = p_photo_path;
  insert into public.cooks (author_id, circle_id, recipe_id, caption, photo_path, photo_alt, width, height)
  values (v_uid, p_circle_id, p_recipe_id, v_caption, p_photo_path, v_alt, v_upload.width, v_upload.height)
  returning id into v_id;
  insert into public.cook_post_log (user_id) values (v_uid);

  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;
revoke all on function public.cook_create(uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.cook_create(uuid, uuid, text, text, text, uuid) to authenticated;

-- The author takes a post down, wherever it is. Allowed while paused: it harms nobody.
-- A post staff removed stays as evidence until its 90 days are up.
create function public.cook_delete(p_cook_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fingerprint text := 'cook_delete:' || p_cook_id::text;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- A retry after a lost response finds the first answer.
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;
  delete from public.cooks where id = p_cook_id and author_id = v_uid and removed_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return public.idempotent_store(p_idempotency_key, v_fingerprint, jsonb_build_object('deleted', true));
end;
$$;
revoke all on function public.cook_delete(uuid, uuid) from public, anon;
grant execute on function public.cook_delete(uuid, uuid) to authenticated;

-- "Yum": one per member per post, never your own. Taking it back needs no access any more.
create function public.cook_react(p_cook_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_on then
    select author_id into v_author from public.cook_cards where id = p_cook_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_author = v_uid then
      raise exception 'own_post' using errcode = 'P0001';
    end if;
    insert into public.cook_reactions (cook_id, user_id) values (p_cook_id, v_uid)
    on conflict do nothing;
  else
    delete from public.cook_reactions where cook_id = p_cook_id and user_id = v_uid;
  end if;
  -- The count only for a post the caller can see; taking a reaction back reveals nothing else.
  return jsonb_build_object(
    'reacted', p_on,
    'reactions', coalesce((select k.reactions from public.cook_cards k where k.id = p_cook_id), 0));
end;
$$;
revoke all on function public.cook_react(uuid, boolean) from public, anon;
grant execute on function public.cook_react(uuid, boolean) to authenticated;

-- A deleted account takes its posts, reactions and unused uploads with it.
create function public.cooks_remove_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cooks where author_id = new.id;
  delete from public.cook_reactions where user_id = new.id;
  insert into public.cook_photo_deletions (photo_path)
  select photo_path from public.cook_uploads where user_id = new.id
  on conflict do nothing;
  delete from public.cook_uploads where user_id = new.id;
  return new;
end;
$$;
revoke all on function public.cooks_remove_on_account_delete() from public, anon, authenticated;
create trigger profiles_deleted_remove_cooks after update of status on public.profiles
  for each row when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.cooks_remove_on_account_delete();

-- ---------------------------------------------------------------- reports

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('person', 'plan', 'circle', 'recipe', 'message', 'order', 'app', 'cook'));

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
    else null end;
$$;
revoke all on function public.report_target_exists(text, uuid) from public, anon, authenticated;
revoke all on function public.report_target_user(text, uuid) from public, anon, authenticated;
revoke all on function public.report_target_label(text, uuid) from public, anon, authenticated;

-- Staff "remove content" on a post hides it (staff_decide handles the older target types); a
-- reversed appeal shows it again while it is still kept.
create function public.cooks_remove_on_decision()
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
  end if;
  return new;
end;
$$;
revoke all on function public.cooks_remove_on_decision() from public, anon, authenticated;
create trigger moderation_actions_remove_cook after insert on public.moderation_actions
  for each row execute function public.cooks_remove_on_decision();

create function public.cooks_restore_on_appeal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'reversed' and old.status is distinct from 'reversed' then
    -- Shown again only when no other removal of the same post still stands.
    update public.cooks k set removed_at = null
    from public.moderation_actions a join public.reports r on r.id = a.report_id
    where a.id = new.action_id and a.action = 'remove_content' and r.target_type = 'cook'
      and k.id = r.target_id
      and not exists (
        select 1 from public.moderation_actions a2 join public.reports r2 on r2.id = a2.report_id
        where a2.id <> a.id and a2.action = 'remove_content' and r2.target_type = 'cook'
          and r2.target_id = k.id
          and not exists (select 1 from public.appeals ap where ap.action_id = a2.id and ap.status = 'reversed'));
  end if;
  return new;
end;
$$;
revoke all on function public.cooks_restore_on_appeal() from public, anon, authenticated;
create trigger appeals_restore_cook after update of status on public.appeals
  for each row execute function public.cooks_restore_on_appeal();

-- Staff see a reported post (its caption and the photo's path, to sign). Every view is logged.
create function public.staff_cook(p_report_id uuid)
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
  if not found or v_report.target_type <> 'cook' then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  insert into public.audit_events (actor_id, actor_role, action, target_type, target_id)
  values (v_uid, 'staff', 'staff.view_cook', 'report', p_report_id);
  return (select jsonb_build_object('caption', k.caption, 'photo_path', k.photo_path,
            'photo_alt', k.photo_alt, 'removed', k.removed_at is not null)
          from public.cooks k where k.id = v_report.target_id);
end;
$$;
revoke all on function public.staff_cook(uuid) from public, anon;
grant execute on function public.staff_cook(uuid) to authenticated;

-- Whether the caller may sign a photo URL: a post they can see, or staff. Used by Storage.
-- Which of these photo paths the caller may see: in a post they can see, their own (so posts in
-- Circles they left stay manageable), or any for staff. The cook-photo-urls function asks this
-- as the member, then signs the answer itself with a fixed lifetime.
create function public.cook_photos_readable(p_paths text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.path from unnest(p_paths) as p(path)
  where (select auth.uid()) is not null
    and (public.is_staff()
      or split_part(p.path, '/', 1) = (select auth.uid())::text
      or exists (select 1 from public.cook_cards k
                 where k.photo_path = p.path or k.photo_path = replace(p.path, '.thumb.jpg', '.jpg')));
$$;
revoke all on function public.cook_photos_readable(text[]) from public, anon;
grant execute on function public.cook_photos_readable(text[]) to authenticated;

-- Reserves an upload for the cook-upload function (service role): 30 a day per member, counted
-- under a per-member lock, so parallel uploads cannot slip past the limit.
create function public.cook_upload_reserve(p_user_id uuid, p_path text, p_width integer, p_height integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cook_upload:' || p_user_id::text));
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
  if split_part(p_path, '/', 1) <> p_user_id::text then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cook_upload_log
      where user_id = p_user_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.cook_upload_log (user_id) values (p_user_id);
  insert into public.cook_uploads (photo_path, user_id, width, height)
  values (p_path, p_user_id, p_width, p_height);
end;
$$;
revoke all on function public.cook_upload_reserve(uuid, text, integer, integer) from public, anon, authenticated;

-- Both files are in Storage: the upload can become a post.
create function public.cook_upload_stored(p_path text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.cook_uploads set stored_at = now() where photo_path = p_path;
$$;
revoke all on function public.cook_upload_stored(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the worker and cleanup

-- The cleanup worker claims photos to remove. A claim older than 10 minutes is retried.
create function public.cook_photo_deletions_claim(p_limit integer)
returns setof text
language sql
security definer
set search_path = ''
as $$
  update public.cook_photo_deletions d set claimed_at = now(), attempts = d.attempts + 1
  where d.photo_path in (
    select photo_path from public.cook_photo_deletions
    where claimed_at is null or claimed_at < now() - interval '10 minutes'
    order by created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked)
  returning d.photo_path;
$$;
revoke all on function public.cook_photo_deletions_claim(integer) from public, anon, authenticated;

-- Unused uploads after a day; posts staff removed after 90 days; the post log after two days.
create function public.cooks_cleanup()
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
  delete from public.cooks where removed_at < now() - interval '90 days';
  delete from public.cook_post_log where created_at < now() - interval '2 days';
  delete from public.cook_upload_log where created_at < now() - interval '2 days';
end;
$$;
revoke all on function public.cooks_cleanup() from public, anon, authenticated;

create or replace function public.notifications_enqueue_due_and_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.plans_changed_due();
  perform public.plans_complete_due();
  perform public.web_rsvp_cleanup();
  perform public.host_featured_refresh_all();
  perform public.weekly_digest_enqueue();
  perform public.cooks_cleanup();
  return public.notifications_enqueue_due();
end;
$$;
revoke all on function public.notifications_enqueue_due_and_cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------- real projects only

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, delete on public.cook_photo_deletions to service_role;
    grant execute on function
      public.cook_photo_deletions_claim(integer),
      public.cook_upload_reserve(uuid, text, integer, integer),
      public.cook_upload_stored(text)
    to service_role;
  end if;
end;
$$;

-- The private bucket. Reads and writes go through the service role only.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('cook-photos', 'cook-photos', false, 2097152, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg'];
  -- No policy for members: they cannot read or sign these files themselves (a member-made
  -- signature could outlive a block). cook-photo-urls signs for them, for 10 minutes.
  drop policy if exists cook_photos_select on storage.objects;
end;
$$;

-- The cleanup worker every 10 minutes, like push-dispatch (20261112003000_workers.sql).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'plantcircle-cook-photo-cleanup';
  perform cron.schedule(
    'plantcircle-cook-photo-cleanup',
    '*/10 * * * *',
    $job$
      select net.http_post(
        url := s.url || '/functions/v1/cook-photo-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || s.key),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)
      from (
        select
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'plantcircle_project_url') as url,
          (select decrypted_secret from vault.decrypted_secrets
            where name = 'plantcircle_service_role_key') as key
      ) s
      where s.url is not null and s.key is not null
    $job$);
end;
$$;

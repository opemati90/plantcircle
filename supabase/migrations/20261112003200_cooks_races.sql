-- Two races in Cooked it (20261112003100), found by the Codex review after it reached staging:
--
-- 1. Two removal appeals for the same post reversed at the same moment each saw the other's
--    removal as still standing, so neither restored the post. They now wait on the post's row.
-- 2. An upload marked stored after its reservation was gone (the account deleted, or the cleanup
--    took it) succeeded silently, leaving files nothing points at. It now fails, and cook-upload
--    removes the files.

create or replace function public.cooks_restore_on_appeal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cook uuid;
begin
  if new.status = 'reversed' and old.status is distinct from 'reversed' then
    select r.target_id into v_cook
    from public.moderation_actions a join public.reports r on r.id = a.report_id
    where a.id = new.action_id and a.action = 'remove_content' and r.target_type = 'cook';
    if v_cook is null then
      return new;
    end if;
    -- Two appeals reversed at once wait on the post, so the second sees the first and restores it.
    perform 1 from public.cooks where id = v_cook for update;
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

create or replace function public.cook_upload_stored(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cook_uploads set stored_at = now() where photo_path = p_path;
  -- Gone meanwhile (the account was deleted, or the cleanup took it): cook-upload removes the files.
  if not found then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.cook_upload_stored(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.cook_upload_stored(text) to service_role;
  end if;
end;
$$;

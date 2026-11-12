-- Recipes (C2). A recipe is shared into one Circle and read by that Circle's members.
-- Allergens come from the poster: either a confirmed list (use 'none' for none) or not confirmed.
-- The allergen list here and in the mobile app must stay the same.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  circle_id uuid not null references public.circles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  cuisine text check (cuisine is null or char_length(cuisine) <= 40),
  serves integer not null default 4 check (serves between 1 and 50),
  minutes integer check (minutes is null or minutes between 1 and 1440),
  intro text check (intro is null or char_length(intro) <= 500),
  allergens text[] not null default '{}',
  allergens_confirmed boolean not null default false,
  -- v1 recipes are Circle-only. 'public' is kept for the Explore browse that comes later.
  visibility text not null default 'circle' check (visibility in ('public', 'circle')),
  created_at timestamptz not null default now(),
  constraint recipes_allergens_known check (
    allergens <@ array['none','gluten','crustaceans','eggs','fish','peanuts','soy','milk',
      'nuts','celery','mustard','sesame','sulphites','lupin','molluscs']::text[]),
  constraint recipes_allergens_confirmed check (
    allergens_confirmed = false or cardinality(allergens) > 0),
  -- 'none' is a complete answer on its own: "none" plus an allergen contradicts itself.
  constraint recipes_allergens_none_alone check (
    not ('none' = any(allergens)) or cardinality(allergens) = 1)
);

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null check (position > 0),
  name text not null check (char_length(name) between 1 and 120),
  qty numeric(10, 2) check (qty is null or qty >= 0),
  unit text check (unit is null or char_length(unit) <= 20),
  primary key (recipe_id, position)
);

create table public.recipe_steps (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null check (position > 0),
  body text not null check (char_length(body) between 1 and 1000),
  primary key (recipe_id, position)
);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy recipes_read on public.recipes for select to anon, authenticated
  using (visibility = 'public' or public.circle_role(circle_id) is not null);
create policy recipe_ingredients_read on public.recipe_ingredients for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy recipe_steps_read on public.recipe_steps for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));

revoke all on public.recipes, public.recipe_ingredients, public.recipe_steps from anon, authenticated;
grant select on public.recipes, public.recipe_ingredients, public.recipe_steps to anon, authenticated;

-- Recipe cards for lists and the top of a recipe. The view applies the same visibility rule as
-- the table and adds the Circle and author names, which the table does not expose.
create view public.recipe_cards
with (security_invoker = false)
as
select
  r.id,
  r.circle_id,
  c.name as circle_name,
  r.author_id,
  p.display_name as author_name,
  r.title,
  r.cuisine,
  r.serves,
  r.minutes,
  r.intro,
  r.allergens,
  r.allergens_confirmed,
  r.created_at,
  r.title || ' ' || coalesce(r.cuisine, '') || ' ' || coalesce(r.intro, '') as search_text
from public.recipes r
join public.circles c on c.id = r.circle_id
left join public.profiles p on p.id = r.author_id
where r.visibility = 'public' or public.circle_role(r.circle_id) is not null;

revoke all on public.recipe_cards from anon, authenticated;
grant select on public.recipe_cards to anon, authenticated;

-- Sharing a recipe. Members of the Circle only. Ingredients and steps are validated by the table
-- checks; allergens must be a confirmed list or explicitly not confirmed.
create function public.recipe_create(
  p_circle_id uuid,
  p_title text,
  p_cuisine text,
  p_serves integer,
  p_minutes integer,
  p_intro text,
  p_allergens text[],
  p_allergens_confirmed boolean,
  p_ingredients jsonb,
  p_steps jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_fingerprint text;
  v_replay jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if public.circle_role(p_circle_id) is null then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_ingredients) is distinct from 'array'
    or jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'invalid_recipe' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_ingredients) not between 1 and 40
    or jsonb_array_length(p_steps) not between 1 and 30 then
    raise exception 'invalid_recipe' using errcode = 'P0001';
  end if;
  if p_allergens_confirmed and coalesce(cardinality(p_allergens), 0) = 0 then
    raise exception 'allergens_required' using errcode = 'P0001';
  end if;

  v_fingerprint := 'recipe_create:' || jsonb_build_object(
    'circle', p_circle_id, 'title', p_title, 'cuisine', p_cuisine, 'serves', p_serves,
    'minutes', p_minutes, 'intro', p_intro, 'allergens', p_allergens,
    'confirmed', p_allergens_confirmed, 'ingredients', p_ingredients, 'steps', p_steps)::text;
  v_replay := public.idempotent_replay(p_idempotency_key, v_fingerprint);
  if v_replay is not null then
    return v_replay;
  end if;

  insert into public.recipes
    (author_id, circle_id, title, cuisine, serves, minutes, intro, allergens, allergens_confirmed)
  values (
    v_uid, p_circle_id, p_title, nullif(p_cuisine, ''), p_serves, p_minutes, nullif(p_intro, ''),
    case when p_allergens_confirmed then p_allergens else '{}' end, p_allergens_confirmed)
  returning id into v_id;

  insert into public.recipe_ingredients (recipe_id, position, name, qty, unit)
  select v_id, ord::integer, item->>'name', nullif(item->>'qty', '')::numeric,
    nullif(item->>'unit', '')
  from jsonb_array_elements(p_ingredients) with ordinality as t(item, ord);

  insert into public.recipe_steps (recipe_id, position, body)
  select v_id, ord::integer, body
  from jsonb_array_elements_text(p_steps) with ordinality as t(body, ord);

  return public.idempotent_store(
    p_idempotency_key, v_fingerprint, jsonb_build_object('id', v_id));
end;
$$;

revoke all on function public.recipe_create(
  uuid, text, text, integer, integer, text, text[], boolean, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.recipe_create(
  uuid, text, text, integer, integer, text, text[], boolean, jsonb, jsonb, uuid) to authenticated;

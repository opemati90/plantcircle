-- Seed data (run by `supabase db reset`, not a migration). Starter city list, pre-added so people can pick a home city (and browse other cities).
-- Placeholder chosen by the engineer, not confirmed by the owner: replace with the launch list.
-- Sources disagree on the launch footprint (product docs: Berlin; PRD: pilot chapters across
-- Africa and the Americas). The city table is data, so changing the list needs no code change.
insert into public.cities (name, country_code, tz) values
  ('Berlin', 'DE', 'Europe/Berlin'),
  ('Hamburg', 'DE', 'Europe/Berlin'),
  ('Munich', 'DE', 'Europe/Berlin'),
  ('Cologne', 'DE', 'Europe/Berlin'),
  ('Lisbon', 'PT', 'Europe/Lisbon'),
  ('Porto', 'PT', 'Europe/Lisbon'),
  ('London', 'GB', 'Europe/London'),
  ('Amsterdam', 'NL', 'Europe/Amsterdam'),
  ('Paris', 'FR', 'Europe/Paris'),
  ('Milan', 'IT', 'Europe/Rome'),
  ('Rome', 'IT', 'Europe/Rome'),
  ('Warsaw', 'PL', 'Europe/Warsaw'),
  ('Toronto', 'CA', 'America/Toronto'),
  ('New York', 'US', 'America/New_York'),
  ('Mexico City', 'MX', 'America/Mexico_City'),
  ('São Paulo', 'BR', 'America/Sao_Paulo'),
  ('Lagos', 'NG', 'Africa/Lagos'),
  ('Nairobi', 'KE', 'Africa/Nairobi'),
  ('Accra', 'GH', 'Africa/Accra'),
  ('Johannesburg', 'ZA', 'Africa/Johannesburg')
on conflict (name, country_code) do nothing;

-- ---------------------------------------------------------------- demo content
-- The people, Plans, group order and Circles the prototype shows (prototype-source/screens:
-- Home, Explore, MyPlans, GroupBuy, Circle). Local and staging only: dates are relative to
-- today so the content stays "this week", and every id is fixed so re-running is idempotent.
-- Never run against production.
do $$
declare
  v_berlin uuid;
  v_ama uuid := 'a0000000-0000-4000-8000-000000000001';
  v_jonas uuid := 'a0000000-0000-4000-8000-000000000002';
  v_mia uuid := 'a0000000-0000-4000-8000-000000000003';
  v_lena uuid := 'a0000000-0000-4000-8000-000000000004';
  v_efo uuid := 'b0000000-0000-4000-8000-000000000001';
  v_brunch uuid := 'b0000000-0000-4000-8000-000000000002';
  v_budget uuid := 'b0000000-0000-4000-8000-000000000003';
  v_order uuid := 'b0000000-0000-4000-8000-000000000004';
  v_past uuid := 'b0000000-0000-4000-8000-000000000005';
  v_kitchen uuid := 'c0000000-0000-4000-8000-000000000001';
  v_newbies uuid := 'c0000000-0000-4000-8000-000000000002';
  v_recipe_efo uuid := 'd0000000-0000-4000-8000-000000000001';
  v_recipe_hummus uuid := 'd0000000-0000-4000-8000-000000000002';
  v_item_chickpeas uuid := 'e0000000-0000-4000-8000-000000000001';
  v_item_lentils uuid := 'e0000000-0000-4000-8000-000000000002';
  v_item_oats uuid := 'e0000000-0000-4000-8000-000000000003';
  v_slot_main uuid := 'f0000000-0000-4000-8000-000000000001';
  v_slot_side uuid := 'f0000000-0000-4000-8000-000000000002';
  -- Next Saturday (strictly in the future) at local Berlin time; the other days hang off it.
  v_sat date := current_date + coalesce(nullif((6 - extract(dow from current_date)::int + 7) % 7, 0), 7);
  v_sat17 timestamptz := (v_sat + time '17:00') at time zone 'Europe/Berlin';
  v_sun13 timestamptz := (v_sat + 1 + time '13:00') at time zone 'Europe/Berlin';
  v_wed19 timestamptz := (v_sat - 3 + time '19:00') at time zone 'Europe/Berlin';
  v_thu18 timestamptz := (v_sat - 2 + time '18:00') at time zone 'Europe/Berlin';
  v_last_sun timestamptz := (v_sat - 13 + time '13:00') at time zone 'Europe/Berlin';
  v_person record;
begin
  select id into v_berlin from public.cities where name = 'Berlin' and country_code = 'DE';

  for v_person in
    select * from (values
      (v_ama, 'ama@example.com', 'Ama O.', true),
      (v_jonas, 'jonas@example.com', 'Jonas K.', true),
      (v_mia, 'mia@example.com', 'Mia S.', false),
      (v_lena, 'lena@example.com', 'Lena C.', false)
    ) as p (id, email, name, host)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user)
    values (
      v_person.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_person.email, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '', false)
    on conflict (id) do nothing;
    insert into public.profiles (id, display_name, city_id, is_verified_host, people_visible)
    values (v_person.id, v_person.name, v_berlin, v_person.host, true)
    on conflict (id) do nothing;
  end loop;

  -- Plans. "Sat 17:00 · Neukölln · hosted by Ama O. · 4 spots left" on Home.
  insert into public.plans (id, host_id, kind, format, title, description, city_id, area_label, starts_at, ends_at, tz, capacity, allergens)
  values
    (v_efo, v_ama, 'cooking_night', 'in_person', 'Efo Riro with Smoked Tofu',
     'A Nigerian classic, cooked together from scratch. We shop in the morning, cook from five and eat around seven. Bring an apron.',
     v_berlin, 'Neukölln', v_sat17, v_sat17 + interval '3 hours', 'Europe/Berlin', 8, 'Contains soy. No nuts.'),
    (v_brunch, v_mia, 'potluck', 'in_person', 'Plant-Based Brunch Club',
     'Potluck brunch. Choose a dish to bring from the list, we sort drinks and bread.',
     v_berlin, 'Kreuzberg', v_sun13, v_sun13 + interval '3 hours', 'Europe/Berlin', 12, null),
    (v_budget, v_ama, 'online_class', 'online', 'Budget Plant Cooking',
     'Beginners welcome. Three weeknight meals under five euros a portion, cooked live. You cook along or just watch.',
     v_berlin, 'Online', v_wed19, v_wed19 + interval '90 minutes', 'Europe/Berlin', 40, null),
    (v_order, v_jonas, 'group_order', 'in_person', 'Bulk grocery order',
     'Bulk chickpeas, lentils and oats from the organic farm shop. Not a purchase: you pay Jonas directly at pickup.',
     v_berlin, 'Neukölln', v_sat + time '10:00', v_sat + time '13:00', 'Europe/Berlin', 30, null),
    (v_past, v_ama, 'potluck', 'in_person', 'Autumn potluck',
     'Soups, breads and whatever the market had.',
     v_berlin, 'Neukölln', v_last_sun, v_last_sun + interval '3 hours', 'Europe/Berlin', 10, null)
  on conflict (id) do nothing;
  update public.plans set status = 'completed' where id = v_past and status = 'published';

  insert into public.plan_private (plan_id, address, reveal_at) values
    (v_efo, 'Weserstraße 1, 12047 Berlin', v_sat17 - interval '24 hours'),
    (v_brunch, 'Oranienstraße 10, 10999 Berlin', v_sun13 - interval '24 hours'),
    (v_budget, null, v_wed19),
    (v_order, 'Richardplatz 3, 12055 Berlin', v_sat17 - interval '24 hours'),
    (v_past, 'Weserstraße 1, 12047 Berlin', v_last_sun - interval '24 hours')
  on conflict (plan_id) do nothing;
  insert into public.plan_meeting_links (plan_id, meeting_url) values (v_budget, 'https://meet.google.com/abc-defg-hij')
  on conflict (plan_id) do nothing;

  -- Who is going: 4 of 8 at Efo Riro ("4 spots left"); Lena attended the past potluck.
  insert into public.rsvps (plan_id, user_id, state, checked_in_at, checked_in_by) values
    (v_efo, v_jonas, 'going', null, null), (v_efo, v_mia, 'going', null, null), (v_efo, v_lena, 'going', null, null),
    (v_brunch, v_ama, 'going', null, null), (v_brunch, v_lena, 'going', null, null),
    (v_budget, v_mia, 'going', null, null), (v_budget, v_jonas, 'going', null, null),
    (v_past, v_lena, 'checked_in', v_last_sun + interval '5 minutes', v_ama),
    (v_past, v_mia, 'checked_in', v_last_sun + interval '12 minutes', v_ama),
    (v_past, v_jonas, 'no_show', null, null)
  on conflict (plan_id, user_id) do nothing;
  insert into public.contribution_slots (id, plan_id, label, needed, position) values
    (v_slot_main, v_brunch, 'A main or a big salad', 4, 0),
    (v_slot_side, v_brunch, 'Bread, spread or fruit', 4, 1)
  on conflict (id) do nothing;
  insert into public.contribution_claims (slot_id, user_id) values (v_slot_main, v_ama)
  on conflict do nothing;

  -- Group order: 68 of 100 kg, closes Thursday, pickup Saturday 10:00–13:00.
  insert into public.group_orders (plan_id, supplier_name, supplier_area, closes_at, pickup_start, pickup_end, pickup_address, pickup_note)
  values (v_order, 'Organic farm shop', 'Brandenburg', v_thu18, v_sat + time '10:00', v_sat + time '13:00',
          'Richardplatz 3, 12055 Berlin', 'Bring your own jars or bags.')
  on conflict (plan_id) do nothing;
  insert into public.order_items (id, plan_id, position, name, unit, target, est_price_minor) values
    (v_item_chickpeas, v_order, 1, 'Chickpeas', 'kg', 40, 320),
    (v_item_lentils, v_order, 2, 'Red lentils', 'kg', 30, 290),
    (v_item_oats, v_order, 3, 'Oats', 'kg', 30, 180)
  on conflict (id) do nothing;
  insert into public.order_interests (item_id, user_id, quantity) values
    (v_item_chickpeas, v_ama, 20), (v_item_chickpeas, v_mia, 10), (v_item_chickpeas, v_lena, 3),
    (v_item_lentils, v_ama, 10), (v_item_lentils, v_lena, 5),
    (v_item_oats, v_mia, 10), (v_item_oats, v_jonas, 10)
  on conflict do nothing;

  -- Circles: a local one with two hosts, and a global one you ask to join.
  insert into public.circles (id, name, tagline, city_id, is_global, access, created_by, join_question) values
    (v_kitchen, 'Neukölln Plant Kitchen', 'Cooking nights, potlucks · EN/DE', v_berlin, false, 'open', v_ama, null),
    (v_newbies, 'New to Plant-Based', 'Questions welcome, no judgement', null, true, 'request', v_mia,
     'What made you curious about plant-based food?')
  on conflict (id) do nothing;
  insert into public.circle_members (circle_id, user_id, role) values
    (v_kitchen, v_ama, 'owner'), (v_kitchen, v_jonas, 'moderator'), (v_kitchen, v_mia, 'member'), (v_kitchen, v_lena, 'member'),
    (v_newbies, v_mia, 'owner'), (v_newbies, v_lena, 'member')
  on conflict do nothing;
  insert into public.circle_requests (circle_id, user_id, answer) values
    (v_newbies, v_jonas, 'I cook for a flatshare and want more ideas.')
  on conflict do nothing;

  -- Recipes shared in the Kitchen ("Ama O. · Recipe · 2d").
  insert into public.recipes (id, author_id, circle_id, title, cuisine, serves, minutes, intro, allergens, allergens_confirmed, visibility, created_at) values
    (v_recipe_efo, v_ama, v_kitchen, 'Efo Riro with Smoked Tofu', 'Nigerian', 4, 45,
     'The spinach stew we cook on Saturday, with smoked tofu instead of fish.', '{soy}', true, 'public', now() - interval '2 days'),
    (v_recipe_hummus, v_jonas, v_kitchen, 'Five-minute hummus board', 'Levantine', 6, 5,
     'Hummus, three toppings, warm bread. The fastest thing to bring to a potluck.', '{sesame}', true, 'public', now() - interval '6 days')
  on conflict (id) do nothing;
  insert into public.recipe_ingredients (recipe_id, position, name, qty, unit) values
    (v_recipe_efo, 1, 'Spinach', 500, 'g'), (v_recipe_efo, 2, 'Smoked tofu', 200, 'g'),
    (v_recipe_efo, 3, 'Red bell pepper', 2, null), (v_recipe_efo, 4, 'Scotch bonnet', 1, null),
    (v_recipe_efo, 5, 'Palm or sunflower oil', 3, 'tbsp'),
    (v_recipe_hummus, 1, 'Chickpeas, cooked', 400, 'g'), (v_recipe_hummus, 2, 'Tahini', 3, 'tbsp'),
    (v_recipe_hummus, 3, 'Lemon', 1, null)
  on conflict do nothing;
  insert into public.recipe_steps (recipe_id, position, body) values
    (v_recipe_efo, 1, 'Blend the peppers and chilli, then fry the paste in oil until it darkens.'),
    (v_recipe_efo, 2, 'Add the tofu cubes and simmer ten minutes.'),
    (v_recipe_efo, 3, 'Fold in the spinach, season, and serve with rice or yam.'),
    (v_recipe_hummus, 1, 'Blend chickpeas, tahini, lemon and a splash of water until smooth.'),
    (v_recipe_hummus, 2, 'Spread on a board, add toppings, serve with warm bread.')
  on conflict do nothing;
  insert into public.recipe_votes (recipe_id, user_id) values
    (v_recipe_efo, v_jonas), (v_recipe_efo, v_mia), (v_recipe_efo, v_lena), (v_recipe_hummus, v_ama)
  on conflict do nothing;
  insert into public.follows (follower_id, followed_id) values (v_lena, v_ama), (v_mia, v_ama), (v_jonas, v_ama)
  on conflict do nothing;
end $$;

# 05 — Data model (Postgres / Supabase)

Conventions: `uuid` PKs (`gen_random_uuid()`), `timestamptz` in UTC, money in **minor units** (`integer`) + ISO `currency char(3)`, quantities `numeric(10,2)` + `unit text`. Every table has `created_at`, most `updated_at`. RLS **on** for every table. Enum names are lowercase snake_case.

## v1 schema (migration `0001_core.sql`)

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- Places (global; seeded from GeoNames/OSM; user-selectable)
create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null, country_code char(2) not null, tz text not null,     -- IANA tz
  centroid geography(point) not null, emergency_number text not null default '112'
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  handle citext unique, avatar_path text, bio text,
  city_id uuid references cities, area_label text,                         -- e.g. "Neukölln" — free text, never GPS
  languages text[] not null default '{en}',
  locale text not null default 'en',
  diet text check (diet in ('vegan','vegetarian','exploring','other')),    -- optional, private (see RLS)
  profile_visibility text not null default 'circles' check (profile_visibility in ('circles','nobody')),
  show_city boolean not null default true,
  age_confirmed_at timestamptz not null,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  suspended_until timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table user_settings (
  user_id uuid primary key references profiles on delete cascade,
  analytics_consent boolean not null default false,
  personalisation_consent boolean not null default false,
  notify_reminders boolean default true, notify_waitlist boolean default true,
  notify_dms boolean default true, notify_chats boolean default true,
  quiet_hours boolean default true, quiet_start time default '22:00', quiet_end time default '08:00',
  lockscreen_text boolean default false,
  notif_prompt_snoozed_until timestamptz
);
create table consent_events (id bigserial primary key, user_id uuid references profiles, kind text, value boolean, created_at timestamptz default now());
create table policy_acceptances (user_id uuid references profiles, policy text, version text, accepted_at timestamptz default now(), primary key (user_id, policy, version));

-- Circles
create type circle_access as enum ('open','request','invite');
create table circles (
  id uuid primary key default gen_random_uuid(),
  name text not null, tagline text, cover_path text,
  city_id uuid references cities, is_global boolean not null default false,
  languages text[] default '{en}', access circle_access not null default 'open',
  join_question text, created_by uuid references profiles, status text default 'active',
  created_at timestamptz default now()
);
create table circle_members (circle_id uuid references circles on delete cascade, user_id uuid references profiles on delete cascade,
  role text not null default 'member' check (role in ('member','moderator','owner')), joined_at timestamptz default now(), primary key (circle_id, user_id));
create table circle_requests (id uuid primary key default gen_random_uuid(), circle_id uuid references circles, user_id uuid references profiles,
  answer text check (char_length(answer) <= 300), status text default 'pending' check (status in ('pending','approved','declined')),
  decided_by uuid references profiles, decided_at timestamptz, created_at timestamptz default now(), unique (circle_id, user_id, status));

-- Plans
create type plan_kind as enum ('cooking_night','potluck','workshop','meetup','online_class','group_order','food_swap','volunteering','global_table');
create type plan_status as enum ('draft','published','changed','on_hold','cancelled','completed');
create table plans (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles, circle_id uuid references circles,
  kind plan_kind not null, title text not null check (char_length(title) <= 80), description text,
  cover_path text, starts_at timestamptz not null, ends_at timestamptz not null, tz text not null,
  city_id uuid references cities, area_label text, transit_hint text,
  is_online boolean not null default false,
  capacity int check (capacity between 2 and 500),
  price_minor int not null default 0, currency char(3),                    -- v1: always 0
  allergens text[] not null,                                               -- '{none}' allowed; publish requires non-empty
  language text not null default 'en', visibility text default 'public' check (visibility in ('public','circle','link')),
  status plan_status not null default 'draft', ai_drafted boolean default false,
  global_edition_id uuid,                                                  -- v1.1
  published_at timestamptz, cancelled_reason text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check (ends_at > starts_at)
);
create table plan_private (                                                -- exact address / meeting link, separate table for RLS
  plan_id uuid primary key references plans on delete cascade,
  address text, meeting_url text, reveal_at timestamptz not null
);
create type rsvp_state as enum ('going','waitlisted','offered','cancelled','checked_in','no_show');
create table rsvps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans on delete cascade, user_id uuid references profiles,
  guest_email citext, guest_name text,                                     -- web RSVP without account
  state rsvp_state not null, waitlist_position int, offer_expires_at timestamptz,
  checked_in_at timestamptz, checked_in_by uuid references profiles,
  source text default 'app' check (source in ('app','link','circle','invite')),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (plan_id, user_id), unique (plan_id, guest_email),
  check (user_id is not null or guest_email is not null)
);
create table contribution_slots (id uuid primary key default gen_random_uuid(), plan_id uuid references plans on delete cascade, label text not null, needed int not null default 1);
create table contribution_claims (slot_id uuid references contribution_slots on delete cascade, user_id uuid references profiles, created_at timestamptz default now(), primary key (slot_id, user_id));
create table plan_feedback (plan_id uuid references plans, user_id uuid references profiles, rating int check (rating between 1 and 5), tags text[], comment text, created_at timestamptz default now(), primary key (plan_id, user_id));

-- Group orders (no money held)
create table group_orders (
  plan_id uuid primary key references plans on delete cascade,
  supplier_name text not null, supplier_area text, shop_id uuid,           -- shop_id v1.1
  closes_at timestamptz not null, pickup_window tstzrange not null, pickup_note text,
  state text not null default 'collecting' check (state in ('collecting','below_target','extended','locked','ready','completed','cancelled'))
);
create table order_items (id uuid primary key default gen_random_uuid(), plan_id uuid references group_orders on delete cascade,
  name text not null, unit text not null default 'kg', target numeric(10,2) not null, est_price_minor int, currency char(3) not null);
create table order_interests (item_id uuid references order_items on delete cascade, user_id uuid references profiles, quantity numeric(10,2) not null check (quantity >= 0),
  confirmed boolean default false, collected_at timestamptz, updated_at timestamptz default now(), primary key (item_id, user_id));

-- Messaging
create table conversations (id uuid primary key default gen_random_uuid(), kind text check (kind in ('plan','circle','direct')),
  plan_id uuid references plans, circle_id uuid references circles, pinned_message_id uuid, created_at timestamptz default now());
create table conversation_members (conversation_id uuid references conversations on delete cascade, user_id uuid references profiles, last_read_at timestamptz, muted_until timestamptz, primary key (conversation_id, user_id));
create table messages (id uuid primary key default gen_random_uuid(), conversation_id uuid references conversations on delete cascade,
  sender_id uuid references profiles, body text check (char_length(body) <= 4000), media_path text, kind text default 'text' check (kind in ('text','image','system','recipe_share')),
  client_id uuid unique,                                                   -- idempotent sends
  deleted_at timestamptz, created_at timestamptz default now());
create table message_requests (id uuid primary key default gen_random_uuid(), from_id uuid references profiles, to_id uuid references profiles,
  first_message text not null, status text default 'pending' check (status in ('pending','accepted','declined')), created_at timestamptz default now(), unique (from_id, to_id));
create table connections (a uuid references profiles, b uuid references profiles, status text check (status in ('requested','accepted')), created_at timestamptz default now(), primary key (a, b));

-- Recipes
create table recipes (id uuid primary key default gen_random_uuid(), author_id uuid references profiles, circle_id uuid references circles,
  title text not null, cuisine text, serves int default 4, minutes int, intro text, cover_path text,
  allergens text[], allergens_confirmed boolean not null default false, ai_written boolean default false, plan_id uuid references plans,
  visibility text default 'circle' check (visibility in ('public','circle')), created_at timestamptz default now());
create table recipe_ingredients (recipe_id uuid references recipes on delete cascade, position int, name text, qty numeric(10,2), unit text, primary key (recipe_id, position));
create table recipe_steps (recipe_id uuid references recipes on delete cascade, position int, body text, primary key (recipe_id, position));
create table saves (user_id uuid references profiles, target_type text, target_id uuid, created_at timestamptz default now(), primary key (user_id, target_type, target_id));

-- Safety
create table blocks (blocker_id uuid references profiles, blocked_id uuid references profiles, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create type report_status as enum ('open','triaged','actioned','dismissed','appealed','closed');
create table reports (id uuid primary key default gen_random_uuid(), case_ref text unique not null,          -- e.g. PC-3107
  reporter_id uuid references profiles, target_type text not null, target_id uuid not null,
  category text not null, details text, accuracy_confirmed boolean not null,
  severity text check (severity in ('urgent','high','routine')), ai_suggestion jsonb,
  status report_status not null default 'open', assigned_to uuid, sla_due_at timestamptz, created_at timestamptz default now());
create table report_evidence (report_id uuid references reports on delete cascade, media_path text);
create table moderation_actions (id uuid primary key default gen_random_uuid(), report_id uuid references reports, actor_id uuid not null,
  action text not null check (action in ('warn','freeze_messages','remove_content','suspend','ban','no_action','verify_host','decline_host')),
  reason text not null, target_user_id uuid, until timestamptz, created_at timestamptz default now());
create table appeals (id uuid primary key default gen_random_uuid(), action_id uuid references moderation_actions, user_id uuid references profiles,
  statement text, status text default 'open' check (status in ('open','upheld','reversed')), decided_by uuid, decided_at timestamptz, created_at timestamptz default now());
create table audit_events (id bigserial primary key, actor_id uuid, actor_role text, action text not null, target_type text, target_id uuid,
  reason text, meta jsonb, created_at timestamptz default now());               -- append-only (no update/delete grants)

-- Platform
create table push_tokens (user_id uuid references profiles on delete cascade, token text primary key, platform text, updated_at timestamptz default now());
create table notifications (id uuid primary key default gen_random_uuid(), user_id uuid references profiles on delete cascade, type text not null,
  payload jsonb not null, read_at timestamptz, created_at timestamptz default now());
create table idempotency_keys (key uuid primary key, user_id uuid, rpc text, response jsonb, created_at timestamptz default now());
create table feature_flags (key text primary key, enabled boolean default false, rollout int default 0, countries char(2)[]);
create table media (path text primary key, owner_id uuid references profiles, alt text, scanned boolean default false, created_at timestamptz default now());
```

### Indexes (minimum)
`plans (status, starts_at)`, `plans (city_id, starts_at) where status='published'`, `plans (circle_id)`, `rsvps (plan_id, state)`, `rsvps (user_id, state)`, `messages (conversation_id, created_at desc)`, `reports (status, severity, created_at)`, GIST on `cities.centroid`.

## Row Level Security (summary — write each as a policy + test)
- `plans`: public + published readable by `anon`; `circle` visibility readable by members; host full access to own; staff read all.
- `plan_private`: readable only by host, co-hosts, and users with `rsvps.state in ('going','checked_in')` **and** `now() >= reveal_at`.
- `profiles`: `diet` column never exposed via public views — use `public_profiles` view without `diet`, `age_confirmed_at`, `status`. Blocked users can’t read each other’s profile.
- `rsvps`: user sees own; host sees first name + contribution for their Plan only (view `plan_guests`), **no email**.
- `messages`: members of the conversation only; blocked pairs hidden; staff access only through an audited RPC with a reason.
- `reports`: reporter sees own case status; target never sees reporter; staff role reads/writes.
- `audit_events`: insert via security-definer functions only; no update/delete for anyone.

## v1.1 tables (migration `0002`)
`shops` (name, kind, city_id, location geography, ships_to char(2)[], bulk boolean, source 'osm'|'member'|'shop', osm_id, claimed_by, partner boolean) · `shop_items` · `global_editions` (recipe_id, host_id, window tstzrange, linkup_at, linkup_url) · `impact_estimates` (plan_id, per_plate_kg, baseline_kg, method_version, reviewed_by) · `leftovers` (plan_id, outcome, kg) · `habit_responses` (anonymous: cohort_month, bucket — no user_id) · `translations` (target_type, target_id, lang, text, model, created_at) · `ai_requests` (user_id, feature, tokens_in, tokens_out, cost_minor, created_at).

## Later tables
`host_profiles` (trader_status, tax_id_encrypted, stripe_account_id, level) · `tickets` · `payments` · `refunds` · `payouts` · `subscriptions` · `memberships` · `seeds_ledger` (append-only) · `store_partners`.

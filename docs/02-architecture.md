# 02 — Architecture

## Overview

```
Expo app (iOS, Android)        Web (Next.js)                       Staff console (web)
  expo-router, TS                - Plan public pages + web RSVP      - queue, cases, audit
  TanStack Query (+persist)      - host dashboard (Later)            - SSO + MFA
  expo-sqlite offline cache      - store dashboard (Later)
          │                               │                                   │
          └──────────────┬────────────────┴───────────────┬───────────────────┘
                         ▼                                ▼
                 Supabase (EU region)              Edge Functions (Deno, TS)
                 - Postgres + PostGIS              - RPC wrappers needing secrets
                 - Auth (Apple, Google, email OTP) - AI calls (Anthropic API)
                 - Storage (images, scanned)       - push fan-out (Expo push)
                 - Realtime (chat, live counts)    - email (transactional provider)
                 - Row Level Security              - scheduled jobs (reminders, waitlist expiry)
```

- **Region:** host data in the EU (Supabase EU region). Process-level data transfer assessment needed for US-based processors (Anthropic, Expo push, Sentry, PostHog — prefer EU hosting where offered).
- **Transactional logic** (RSVP, waitlist promotion, check-in, claims, order quantities) lives in **Postgres functions** (`security definer`, one transaction each) called via `supabase.rpc()`. Edge Functions only when secrets or third-party calls are involved.
- **Idempotency:** every mutating RPC takes `p_idempotency_key uuid`; store in `idempotency_keys(key, user_id, rpc, response, created_at)` and return the stored response on replay.

## Repo layout (monorepo, pnpm workspaces)

```
apps/
  mobile/            Expo app
    app/             expo-router routes (see docs/04-screens.md for the route map)
    src/components/  design-system components (docs/03)
    src/features/    plans, circles, rsvp, chat, orders, recipes, safety, account, impact, stores
    src/lib/         supabase client, query client, i18n, analytics, offline
  web/               Next.js: /p/[id] public Plan + web RSVP, /console (staff), later /host, /store
packages/
  tokens/            design tokens (from design/tokens.ts)
  types/             generated Supabase types + shared zod schemas
  copy/              i18n catalogs (en, de)
supabase/
  migrations/        SQL (docs/05-data-model.md)
  functions/         edge functions
  seed.sql           sample data matching the prototype (Ama, Jonas, Mia…)
e2e/                 Maestro flows
```

## Key libraries

expo-router · @tanstack/react-query + persist-client (MMKV or SQLite storage) · expo-sqlite · expo-secure-store · expo-notifications · expo-image · react-hook-form + zod · i18next + react-i18next · date-fns + date-fns-tz · @sentry/react-native · posthog-react-native · @supabase/supabase-js. Check current versions before installing; pin exact versions.

## Auth

- Providers: Sign in with Apple, Google, email one-time code (no passwords).
- Anonymous browsing allowed: public Plans, Circles, recipes and Explore are readable without a session (RLS policies for `anon`).
- On first commitment (Join, Book, Post, Message) show the sign-up sheet; after auth, **resume the action** that triggered it.
- Store `policy_acceptances(user_id, policy, version, accepted_at)` at sign-up and on Terms updates.
- 18+ is self-declared (`age_confirmed_at`). The “Under 18” path stores nothing.

## Offline

- Persist query cache for: My Plans, each joined Plan (incl. unlocked address), tickets (Later), saved recipes, the active group order, online-class steps.
- Mutations while offline: show “Can’t change your RSVP — reconnect” for RSVP/claims (no queued RSVP writes in v1, to avoid races); chat messages may queue and send on reconnect with idempotency keys.

## Media

- Upload to Storage via signed URLs; resize to max 2048 px, strip EXIF location; generate 3 sizes.
- Moderation scan before public (provider TBD — see open questions). Alt text required for host uploads (AI suggests, author confirms).

## Environments

`local` (supabase start) · `staging` · `production`. Feature flags in a `feature_flags` table (key, enabled, rollout %, country allowlist for legal/payment-gated features).

## Observability

Sentry for crashes/errors (strip PII), PostHog for product analytics with consent (docs/12), Postgres logs + `audit_events` for staff actions.

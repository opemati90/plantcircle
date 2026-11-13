# PlantCircle

A mobile-first community app where people cook, eat and buy food together, in person and
online. Global by default.

**Start with `CLAUDE.md`** (rules and stack) and `HANDOVER.md` (state, decisions, next steps).
The step-by-step record of what was built, decided and left open is
`docs/superpowers/plans/2026-11-12-remaining-work.md`.

Status: **v1 feature-complete against the dev fixture backend and an in-process Postgres;
not yet run against a Supabase project.** See [Verified and not verified](#verified-and-not-verified).

## Layout

```
apps/mobile/            Expo app (iOS, Android, web renderer), expo-router, TypeScript
  app/                  routes (thin re-exports)
  src/components/       design-system components (docs/03)
  src/features/         one folder per area (see below)
  src/lib/              backend contract + Supabase adapter + dev fixtures, offline cache, i18n, dates
  e2e/                  Playwright journeys (web renderer) + maestro/ (device flows)
packages/copy/          i18n catalogues: en, de, es, pt, fr, pl, it, nl (key parity tested)
packages/tokens/        design tokens
supabase/migrations/    schema, RLS, RPCs (one file per area)
supabase/tests/         database tests on PGlite (real Postgres, in process)
supabase/functions/     Edge Functions: push-dispatch, cron-reminders, web-rsvp
```

Feature areas: onboarding · auth · home · explore (search, filters) · plans (detail, RSVP,
waitlist) · create (Plan wizard) · hosting (manage, check-in, feedback) · circles · learn
(recipes) · people · chat (Plan, Circle, direct) · inbox (chats + updates) · orders (group
orders) · safety (report, block, suspension, staff console) · account (privacy choices,
notifications, data, delete, accessibility) · legal (Terms versions, under-18) · profile ·
notifications (push, prompt) · web (shared-link RSVP).

## Getting started

```bash
pnpm install
pnpm dev
```

Without environment variables a development build uses the **dev fixture backend**: an
in-app fake backend, labelled on screen, with the prototype's sample data (email code
`000000`). To use a real backend, copy `apps/mobile/.env.example` to `apps/mobile/.env`. A
release build without those variables refuses to start, and its bundle contains no fixture
data or test hooks (checked on a production web export).

```bash
pnpm check                                        # format, lint, typecheck, unit, database tests
pnpm --filter @plantcircle/mobile web:smoke       # Playwright journeys + axe scans (web renderer)
pnpm e2e                                          # Maestro flows on a simulator dev build
```

Last results (14 November 2026): database **171**, unit and component **80**, browser
journeys **74**, all passing.

## Verified and not verified

- **Verified:** every check above; screenshots compared side by side with the design canvas
  export (`prototype-source/screens/*.dc.html`) at 390×844; each feature audited by Codex
  (read-only) with every confirmed finding fixed; Maestro offered-spot and My Plans flows on
  the iOS simulator (offered-spot also on Android).
- **Not verified:** a Supabase project (schema, RLS and RPCs run on PGlite only), the Edge
  Functions (written, not deployed), real push delivery and email, Sign in with Apple/Google,
  screen readers on devices, concurrent sessions.

## Before launch (owner)

- A Supabase project in an EU region; apply `supabase/migrations`; deploy the three Edge
  Functions; schedule `cron-reminders` (15 min) and `push-dispatch` (1 min); give staff the
  `staff` role with the service role.
- Apple Developer account, Google OAuth client, an email provider (magic links, `email-send`).
- Publish real Terms, Community Rules and Privacy Policy (versions `2026-11` are seeded).
- A native-speaker review of the seven translated catalogues.

Open questions and placeholders introduced by this work are listed in the plan document above,
row by row.

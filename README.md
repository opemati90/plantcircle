# PlantCircle

A mobile-first community app where people cook, eat and buy food together — in person and
online. Global by default.

**Start with `CLAUDE.md`** (rules and stack) and `docs/01-mvp-scope.md` (what ships in v1).
This README describes what exists in the repository today.

Status: **early v1 work — not production-ready.** One journey is built; see
[Not built yet](#not-built-yet) and [Blockers](#blockers).

## Layout

```
apps/mobile/         Expo app (iOS, Android), expo-router, TypeScript
  app/               routes
  src/components/    design-system components (docs/03)
  src/features/      onboarding · auth · home · plans
  src/lib/           backend contract + adapters, storage, dates
  e2e/               interim web smoke tests (Playwright)
packages/tokens/     design tokens (re-exports design/tokens.ts)
packages/copy/       i18n catalogues (en, de)
supabase/            SQL migrations + access tests (in-process Postgres)
docs/, design/       provided project documents and tokens
```

Not created yet: `apps/web` (public Plan page, web RSVP, staff console), `packages/types`,
`supabase/functions`, `supabase/seed.sql`, Maestro flows.

## Getting started

```bash
pnpm install
```

```bash
pnpm dev
```

Without environment variables a development build uses **development fixtures**: an in-app
fake backend, labelled on screen, with the sample data from the prototype (email code
`000000`). To use a real backend, copy `apps/mobile/.env.example` to `apps/mobile/.env`. A
release build without those variables refuses to start rather than serving fixture data.

```bash
pnpm check
```

runs formatting, lint, typecheck, unit tests and the database access tests.

## What works today

Welcome → what brings you here → choose a city (or skip) → Home → Plan → sign up
(Apple / Google / 6-digit email code) → the Join that triggered sign-up is resumed →
bring something → cancel.

| #   | Behaviour                                                                                                                                                                                                                       | Verified by                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Browse Home and a Plan without an account; sign up only at the first Join, then resume it                                                                                                                                       | `e2e/journey.spec.ts`                                                              |
| 2   | Cities are data; nothing is preselected; skipping shows Plans everywhere                                                                                                                                                        | `e2e/journey.spec.ts`, `supabase/tests`                                            |
| 3   | Capacity can never be exceeded; joins, cancels and claims run in one transaction                                                                                                                                                | `supabase/tests`                                                                   |
| 4   | Every mutating RPC takes an idempotency key and replays the stored response                                                                                                                                                     | `supabase/tests`                                                                   |
| 5   | Exact address readable only by the host, or by confirmed guests after `reveal_at`                                                                                                                                               | `supabase/tests`                                                                   |
| 6   | Members cannot read each other's profiles, RSVPs or policy acceptances                                                                                                                                                          | `supabase/tests`                                                                   |
| 7   | A failed RSVP says so, holds no spot, and Retry re-sends the same key                                                                                                                                                           | `e2e/journey.spec.ts`                                                              |
| 8   | Unconfirmed allergens are never shown as "none" or "safe"                                                                                                                                                                       | `planCopy.test.ts`                                                                 |
| 9   | English and German from one code path; device language by default, changeable on the welcome screen and remembered; dates follow the language                                                                                   | `e2e/i18n.spec.ts`, `catalogs.test.ts`, `dates.test.ts`                            |
| 10  | Waitlist: first in, first out; a freed spot is offered to the first person for 2 hours, then passes on; inside the last 6 hours it is offered to everyone and the first to confirm wins; confirmed guests never exceed capacity | `supabase/tests/waitlist.test.ts`, `e2e/waitlist.spec.ts`                          |
| 11  | No automatically detectable WCAG A/AA/AAA-contrast violations on these screens                                                                                                                                                  | `e2e/a11y.spec.ts`                                                                 |
| 12  | My Plans lists the viewer's own Plans: upcoming Going and waitlisted (with place in line or a held spot), and Past Plans attended in the last 90 days; signed out it asks the visitor to sign in                                | `e2e/myPlans.spec.ts`, `myPlanRules.test.ts` (Past list: not run against Supabase) |

## How it was verified — and what was not

- **Run:** `pnpm check` (unit, component and database tests) and the Playwright tests that
  drive the app through **Expo's web renderer** at the prototype size (390×844), plus a
  side-by-side comparison with the prototype screens.
- **Never run on a device.** No iOS simulator or Android emulator was available. Nothing
  here has been seen in a native build: blur, safe areas, keyboard behaviour, the system
  sign-in sheet, secure storage, VoiceOver/TalkBack, Dynamic Type and Reduce Motion are all
  unverified.
- **Never run against Supabase.** The adapter is type-checked only. Schema, RLS and RPCs are
  tested on PGlite (real Postgres semantics), not on a Supabase project.
- Expo and Supabase documentation could not be reached from the build environment; native
  APIs were written against the installed packages' type definitions. Review the OAuth
  deep-link flow and session storage against current docs before relying on them.
- Date formatting uses `Intl` with time zones; `docs/02` names date-fns-tz. Check on Hermes.

## Security and data handling

| Asset              | Risk                                                     | Control                                                                                               |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Exact Plan address | Read by non-guests                                       | Separate table; RLS via `can_see_address` and `reveal_at`; never in public views                      |
| Who attends what   | Tracking a person                                        | RSVP rows readable only by their owner; public views expose counts and up to three initials           |
| Profile            | Cross-user reads; self-verifying as a host               | Own-row RLS; column grants exclude `is_verified_host`                                                 |
| Capacity, claims   | Over-booking by concurrent or repeated requests          | Row lock + count inside each RPC; idempotency keys                                                    |
| Session            | Token theft; data leaking between accounts on one device | Keychain/Keystore storage (chunked); query cache cleared on user change; post-sign-in paths validated |
| Secrets            | Service-role key in the app                              | Only the anon key is an `EXPO_PUBLIC_` variable; `.env*` and signing files are git-ignored            |

Personal data stored: email (Supabase Auth), display name (first name + last initial), chosen
city, onboarding goals, policy acceptances, RSVPs and claims. No location is collected.
Nothing is sent to analytics yet.

## Deviations from the prototype

| Where             | Prototype                                                                                            | Built                                                               | Why                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Welcome           | "…plant-based people in Berlin."                                                                     | "…near you."                                                        | Rule 1: never hard-code a city                                                           |
| City step         | One row "Berlin" with a chevron                                                                      | Radio list of cities from the backend, none preselected             | The picker behind the chevron was not in the files provided                              |
| Home (signed out) | Bell + avatar                                                                                        | "Sign in" chip                                                      | Prototype only shows the signed-in header                                                |
| Home              | City chevron, invitation dot, Save, group-order card                                                 | Omitted                                                             | Those features are not built                                                             |
| Plan              | Share, Add to calendar, Message host, footprint chip                                                 | Omitted                                                             | Share needs the public web page; calendar and messaging not built; footprint is v1.1     |
| Plan              | Tapping "You're going" cancels                                                                       | Confirmation sheet first                                            | Prevents losing a spot by accident                                                       |
| Waitlist          | “We’ll tell you by notification and email the moment it’s your turn”; “You’re 4th · we’ll alert you” | Those promises are left out; an offer shows on Home and on the Plan | Notifications and email are not built, so the app must not promise them                  |
| Waitlist offer    | “Confirm my spot” → My Plans                                                                         | → the Plan                                                          | The spot is confirmed on the Plan, where it is held                                      |
| Sign up           | Field border `#E5E5EA`; Terms/Privacy/Under-18 links                                                 | `borderControl` token; plain text                                   | Control boundary contrast; documents and age screen not built                            |
| Verify email      | "Open mail app"                                                                                      | Omitted                                                             | Not built                                                                                |
| My Plans          | "We’ll alert you"                                                                                    | Omitted                                                             | Notifications are not built                                                              |
| My Plans          | "Choose a dish to bring", "Saved for offline", group-order card, feedback and recipe chips           | Omitted                                                             | Bring lists on My Plans, offline cache, group orders, feedback and recipes are not built |
| My Plans          | Hosting tab: "Host your first Plan" with Start a Plan                                                | Always shown; no hosted Plans are listed                            | Plan creation is not built, so no hosted Plans can exist yet                             |
| My Plans          | Card corner radius 22                                                                                | `radius.card` token (20)                                            | Use the token; reconcile with the design tokens                                          |

## Open questions introduced by this work

To merge into `docs/16-open-questions.md` when it is added to the repository:

- Colours used by the prototype but missing from `design/tokens.json`: avatar tints, map
  tile, body text `#3A3A3C`, sheet handle, card border `#E5E5EA`
  (`apps/mobile/src/components/theme.ts`).
- Display name for email sign-ups is derived from the first word of the address and cannot be
  edited until Profile exists.
- Policy version string is the placeholder `2026-11`.
- German strings that are not in the prototype's German screens are first-pass translations
  and need review by a native speaker (`packages/copy/src/de.ts`). The prototype's German
  Plan screen uses a different layout from the English one; the English layout is built.
- Plurals rely on `Intl.PluralRules`; confirm it is available on Hermes for both platforms.
- Bundle identifiers `app.plantcircle.mobile` and the `plantcircle://` scheme are placeholders.
- Schema alignment with `docs/05-data-model.md` and `docs/07-state-machines.md` is done for
  profiles, cities, Plans, RSVPs with the waitlist, and contributions. Names, states and RPCs
  follow the spec (`rsvp_join`, `rsvp_cancel`, `waitlist_respond`, `slot_claim`); the read
  views keep the app's column names. Still open:
  - `allergens` is free text; the spec has a text array with `{none}` as a confirmed answer.
  - `reveal_at <= starts_at` is not enforced in SQL.
  - Guest RSVPs (web, without an account), check-in and `plan_end`, Plan creation and
    changes, and the remaining spec tables (circles, messaging, recipes, reports, notifications,
    group orders) are not built.
  - Errors for a Plan that is not open are still `plan_not_found`; the spec's `PLAN_NOT_OPEN`
    code is not mapped yet.
  - A full Plan now puts the member in line (the spec's `rsvp_join` rule); the old "Plan full"
    error no longer exists in the database.

## Not built yet

Of the 60 v1 screens in `docs/01-mvp-scope.md`, these are implemented: Welcome & onboarding,
Home, Loading skeleton, Plan detail & RSVP (with sign-up sheet), RSVP failed, Create account,
Verify email, Plan full → waitlist, Waitlist spot offered, My Plans (Going, Hosting, Past tabs),
and the server-error layout. Routes follow the map in `docs/04-screens.md`. Explore, Inbox,
Profile (sign-out only) and Start a Plan are honest "isn't built yet" screens. Everything else in v1 is not started, including the
items `CLAUDE.md` calls non-negotiable for launch: report/block and the staff console,
offline cache, notifications, web RSVP.

## Waitlist: what it still needs before launch

- **A scheduler.** Overdue offers are expired whenever anyone touches the Plan, so an expired
  offer can never be confirmed. But passing the spot on _promptly_ needs
  `select public.expire_waitlist_offers();` run every minute with the service role (pg_cron or
  a scheduled Edge Function). That job is not set up.
- **Notifications.** Nobody is told when a spot is offered to them; they only see it on Home or
  on the Plan if they open the app within the 2 hours. Push and email are required before the
  waitlist is usable in practice.
- Rules were taken from the design canvas notes and `docs/04-screens.md`;
  `docs/07-state-machines.md` has not been provided.

## Blockers

- **Missing documents.** `CLAUDE.md` refers to `docs/05`–`docs/16` and `prototype-source/`;
  only `docs/00`–`04` and the tokens were provided. The data model, API, state machines,
  backlog order and Definition of Done are needed to build to spec.
- **No Supabase project** (EU region) and no Apple/Google sign-in configuration.
- **No device verification** — needs a simulator/emulator or EAS builds, and Maestro flows.
- Legal documents (Terms, Privacy, Community Rules) and compliance review.

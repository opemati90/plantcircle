# PlantCircle — handover

Read this first if you are picking up the project, whether you're a person or a coding
agent. It covers what the project is, the owner's instructions, what has been decided and
built, how to check it, and what is next.

_Last updated: 14 November 2026 · branch `expo-mobile` · repository
`github.com/opemati90/plantcircle`_

---

## 1. The project in one minute

PlantCircle is a **cross-platform mobile app (iOS and Android)** where people cook, eat and buy
food together, mostly plant-based: cooking nights, potlucks, group orders, and online
cook-alongs. It is **global by default**: it launches in one city, but nothing may be limited
to a city, country, currency or language.

- **Stack (decided by the owner):** Expo (React Native, TypeScript, Expo Router), Supabase
  (Postgres, Auth, Storage, Realtime, row-level security), Edge Functions, TanStack Query,
  i18next. The full list is in `CLAUDE.md`.
- **Status:** v1 features built end to end against the dev fixture backend and an in-process
  Postgres (PGlite): Plans, waitlist, creation, hosting, Circles, recipes, People, chats and
  direct messages, Inbox, group orders, safety (report, block, suspension, staff console),
  account and privacy, Terms versions and the under-18 gate, notifications, offline, the
  shared-link web RSVP, Explore filters, and the designed loading/empty/error states.
  **Not yet run against a real Supabase project**; Maestro flows have run on the iOS
  simulator.

---

## 2. Where everything is

| What                                | Where                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Code (current work)                 | branch **`expo-mobile`**                                                                              |
| Old web prototype (superseded)      | branch `main`. See [§10](#10-open-decisions-for-the-owner)                                            |
| Rules for coding agents             | `CLAUDE.md` (owner's, authoritative) · `AGENTS.md` (conventions in this code base)                    |
| Product docs provided so far        | `docs/00`–`docs/04`, `design/tokens.json`, `design/tokens.ts`                                         |
| Visual design (all ~95 screens)     | design canvas "PlantCircle MVP": https://claude.ai/code/artifact/f0958fbc-7918-4447-8d11-a970818987c4 |
| What is built, verified, deviations | `README.md`                                                                                           |
| This handover                       | `HANDOVER.md`                                                                                         |

**Inputs that arrived late.** `docs/05`–`16`, `prototype-source/` and `source-docs/` were
added on 14 November 2026 from the owner's handoff bundle, after most of the implementation.
A gap analysis against them is recorded in `docs/superpowers/plans/2026-11-12-remaining-work.md`
(section "Gap analysis against the full handoff"). The brand kit (`design/brand/`) is wired into
`apps/mobile/app.json` (icon, adaptive icon, splash, notification icon, favicon).

---

## 3. The owner's instructions

### 3.1 Authoritative project rules: `CLAUDE.md`

Read the whole file. The nine non-negotiable rules, in short:

1. **Global by default.** Never hard-code a city, country, currency or language.
2. **Accessibility.** WCAG 2.2 AA everywhere, AAA where feasible: text contrast ≥ 7:1, touch
   targets ≥ 44 pt, every control has a name, role and state, Dynamic Type to 200%, and
   Reduce Motion is respected.
3. **The server is the source of truth.** Capacity, waitlists, check-ins, claims and order
   quantities change only inside one database transaction, and every state-changing call
   takes an idempotency key.
4. **Privacy.** No exact location; diet is optional and private; exact addresses are shown
   only to confirmed guests at `reveal_at`; no contact export for hosts.
5. **Safety ships with v1.** Report and block everywhere, a staff console, and an audit log.
6. **AI is optional and labelled.** There is always a "do it myself" path, a person confirms
   before anything is published, and AI never sets allergens.
7. **No in-app payments in v1.** Every money screen says that payment happens outside the app.
8. **Every primary button responds.** There are no dead ends.
9. **Copy is plain, short, second person, with typographic apostrophes (’).** The
   prototype's strings are the source of truth.

How to work, also from `CLAUDE.md`:

- Build only what is marked **v1** in `docs/01-mvp-scope.md`, in the sprint order of
  `docs/15-backlog.md`.
- Use the design-system components (`docs/03`) and match the prototype screens. Don't port
  their HTML.
- Run the Definition of Done in `docs/14-testing.md` before calling a story done.

### 3.2 The owner's standing brief: how to work

The owner opened with a long brief for a senior product engineer and tech lead. Its intent,
condensed:

- **Build a real, maintainable product, not a demo.** Take responsibility for architecture,
  security, design fidelity, testing, performance, accessibility and running costs.
- **Understand before changing.** Inspect what exists and preserve working functionality. Ask
  only questions that affect safety, architecture, cost or correctness; for reversible
  details, state an assumption and proceed.
- **Work in small increments.** Complete one journey end to end (UI, real data, authorisation,
  errors, tests) before spreading out.
- **Keep the architecture simple:** a modular app with few deployables and no speculative
  infrastructure. Separate presentation, business rules, data access and integrations.
- **Code quality:** strict types, runtime validation at trust boundaries, readable names, no
  type escapes or empty catches. Review files over about 250–300 lines, and keep line width
  around 90–100.
- **Design fidelity:** the design is the source of truth. Use tokens, never invent styles, and
  implement loading, empty, error, disabled, focus, success and offline states. Render and
  compare against the design and record deviations. Never claim pixel-perfect without
  evidence.
- **Accessibility is part of the work**, checked automatically and by hand.
- **Security and privacy:** deny by default and enforce on the server or database; test
  cross-user access. Keep secrets out of the app, and collect the minimum data.
- **Data integrity:** transactions, idempotency, and no fake success. Distinguish loading,
  empty, failed and permission-denied states.
- **Costs:** use lean, verified pricing with dates, give a cost comparison before committing
  to infrastructure, and **never buy or enable billable services without the owner's
  approval.**
- **Tests:** unit tests for rules, integration tests for data and authorisation (not mocked
  away), end-to-end tests for key journeys, plus failure and abuse cases. Never weaken tests to
  get a green run.
- **Releases:** separate environments, CI, safe migrations, backups with a tested restore.
  Never touch production, force-push or delete data without explicit permission.
- **Handover every increment.** Report what changed, the exact checks and their results,
  what is unverified or blocked, and the next step. Separate implemented, verified, assumed
  and blocked work. Never claim something ran without evidence.

### 3.3 Things the owner said during the work (they override defaults)

- **"The platform is a cross-platform mobile app, not web."** The first version was a web
  app; it was rebuilt in Expo.
- **"Just follow instructions and build it right."** Follow `CLAUDE.md` and the docs
  literally. Where they're silent, say so and pick the closest reading.
- **"Are you sure Supabase is right? Don't be stupid."** The owner wants decisions justified
  with real reasons and honest trade-offs, not confidence. (Supabase was then confirmed by the
  stack in `CLAUDE.md`.)
- **"Go ahead with the waitlist."** Done; see [§6](#6-what-is-built).

---

## 4. Decisions made and why

| Decision                                                                                                                                           | Why                                                                                               | Status                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Expo + Supabase, pnpm monorepo (`apps/mobile`, `packages/*`, `supabase/`)                                                                          | Specified by `CLAUDE.md` and `docs/02`                                                            | Decided by owner                                        |
| Business rules in Postgres functions (`security definer`, one transaction, row lock)                                                               | Rule 3, and `docs/02`                                                                             | Implemented                                             |
| Idempotency table + `p_idempotency_key` on every mutating RPC; retries resend the same key                                                         | Rule 3                                                                                            | Implemented and tested                                  |
| Cities are rows, chosen in onboarding; skipping shows Plans everywhere                                                                             | Rule 1                                                                                            | Implemented                                             |
| Exact address in a separate table, readable only by the host or confirmed guests after `reveal_at`                                                 | Rule 4                                                                                            | Implemented and tested                                  |
| Copy in `packages/copy` (English + German); a test enforces identical keys and placeholders                                                        | Rule 1 and v1 languages                                                                           | Implemented                                             |
| Screens depend on one `Backend` interface; a labelled **dev fixture backend** runs without Supabase; release builds refuse to start without config | Lets the UI be built and tested before a Supabase project exists, without ever shipping fake data | Implemented                                             |
| Session in Keychain/Keystore (chunked); OAuth through the system browser and a deep link                                                           | Security                                                                                          | Written; **not run on a device**                        |
| Routes follow `docs/04-screens.md`                                                                                                                 | Spec                                                                                              | Implemented for built screens                           |
| Tab layout uses `Slot` + a custom floating `TabBar` instead of Expo Router `Tabs`                                                                  | `Tabs` rendered a blank screen in the web renderer here                                           | Revisit on a device; tab state is not kept between tabs |
| The confirmation sheet before cancelling a spot                                                                                                    | Prevents losing a spot by one tap                                                                 | Deviation; owner can overrule                           |
| No copy promising notifications                                                                                                                    | Notifications are not built, so the promise would be false                                        | Deviation until notifications exist                     |

---

## 5. How to run and check it

See `README.md` (Getting started). Last results, 14 November 2026, on macOS:

| Check                                                              | Result   |
| ------------------------------------------------------------------ | -------- |
| Format, lint (strict type-checked), typecheck                      | pass     |
| Database tests (PGlite: real Postgres, in process)                 | 171 pass |
| Unit + component tests (Jest, Testing Library, catalogue parity)   | 80 pass  |
| Browser journeys incl. axe WCAG scans (Expo web renderer, 390×844) | 74 pass  |
| Production web export contains no fixture data or test hooks (F5)  | pass     |

---

## 6. What is built

Everything is recorded row by row, with decisions and what was left for later, in
`docs/superpowers/plans/2026-11-12-remaining-work.md` (C1–C18, D1–D6, E, F). In short:

- **Migrations** (`supabase/migrations`, one per area): core and waitlist, circles, recipes,
  people, Plan creation, hosting, bring items, chat, direct messages, inbox, group orders,
  safety, account, policies, profile stats, notifications, web RSVP, Circle owner. Every table
  has RLS with revoked defaults; every state change is an RPC in one transaction with an
  idempotency key; tests in `supabase/tests`.
- **Edge Functions** (`supabase/functions`): `push-dispatch`, `cron-reminders`, `web-rsvp`
  (see its README).
- **App:** the areas listed in `README.md`, built to the design canvas export
  (`prototype-source/screens`), in eight languages.

---

## 7. Verified, unverified, blocked

**Verified:** every check in §5; screenshots against the design export; a read-only Codex
audit per feature with each confirmed finding fixed; Maestro offered-spot (iOS and Android)
and My Plans (iOS) flows.

**Not verified:** a Supabase project (RLS and RPCs on PGlite only); the Edge Functions
(written, not deployed); push delivery and email; Sign in with Apple/Google; VoiceOver and
TalkBack on devices; concurrent sessions; translations by native speakers (E2).

**Blocked on the owner:** Supabase project and accounts (F4), native-speaker review (E2).

---

## 8. Known gaps and risks

- **Email:** magic links go through Supabase Auth; other emails (offers, address, cancellations)
  are queued with `email = true` and wait for an `email-send` function.
- **Push copy is English** (the in-app Updates rows are localised); per-language push needs a
  language on the profile.
- **Not built (v1.1 or Later by scope):** monetisation, impact, global editions and online
  classes, shops, host program, AI features, Circle cover photos, the language filter, saved
  searches, Realtime (the Inbox polls every 15 s).
- **Placeholders:** policy version `2026-11`; bundle id `app.plantcircle.mobile` and scheme
  `plantcircle://`; legal URLs under `plantcircle.app/legal/*`; store links; the accessibility
  statement's “last checked” date.

---

## 9. Recommended next steps, in order

1. **Supabase project (EU):** apply the migrations, deploy and schedule the Edge Functions,
   configure email OTP, Apple and Google; run the journeys for real (F4).
2. **`email-send`** for the queued email rows, then the address-day-before email.
3. **Devices:** run every Maestro flow on iOS and Android (Explore F3, plurals E3), with
   VoiceOver/TalkBack and Dynamic Type at 200%.
4. **Native-speaker review** of de, es, pt, fr, pl, it, nl (E2).
5. **Merge decision** for `expo-mobile` → `main` (§10), so CI runs.

---

## 10. Open decisions for the owner

1. **Send the missing documents** listed in §2.
2. **Supabase:** may a project be created in an EU region (free tier for development)?
   Nothing billable has been created.
3. **Accounts:** an Apple Developer account and a Google OAuth client for sign-in, and an
   email provider for login codes.
4. **`main` branch:** open a pull request from `expo-mobile`, or replace `main` (which holds
   the abandoned web version)?
5. **Priority:** notifications first (makes the waitlist usable), or report/block first (a
   launch blocker)?
6. **Sign-up:** add a "your name" step, or keep deriving it from the email address?
7. **Confirm the deviations** in `README.md`, especially the cancel-confirmation sheet.

---

## 11. Notes for the next coding agent

- **Package manager:** pnpm with `node-linker=hoisted` and exact version pins. Expo SDK 58,
  React Native 0.88, React 19.3. Install Expo packages at the versions in
  `node_modules/expo/bundledNativeModules.json`.
- **Playwright** is pinned to 1.63.0 via `overrides` so axe and Playwright share one version.
  In sandboxed images, set `PW_CHROMIUM_PATH` to a pre-installed Chromium.
- **Dev fixture test hooks** (dev builds only; absent from release bundles):
  - `globalThis.__pcFixtures.failNext(op)` simulates a network failure.
  - `globalThis.__pcFixtures.freeSpot(planId)` simulates another guest cancelling.
  - `suspend()`, `makeStaff()`, `publishTerms()` walk the safety and Terms flows.
  - `__pcFixtureFailures` simulates failures from the first call after load (set it with
    `page.addInitScript` before a navigation).
- **Specs that join a Plan** dismiss the notifications prompt with `dismissNotificationPrompt`
  from `e2e/support.ts`; first sign-in answers the privacy choices in `signInWithEmail`.
- **Database tests:** `supabase/tests/harness.ts` recreates the parts of Supabase the
  migrations need (`anon`/`authenticated` roles, `auth.uid()`, default grants). Every new
  table needs RLS, revoked defaults, minimal grants and a test.
- **No user-facing strings in components.** Add them to both catalogues and read them with
  `useTranslation()`. Store stable ids, never labels.
- Use `aria-*` props for control state (`aria-checked`, `aria-selected`, `aria-disabled`);
  they work on native and web. Decorative photos go through `<Photo>` without `alt`.
- `docs/`, `design/` and `CLAUDE.md` are the owner's files; Prettier ignores them on purpose.
  Don't reformat them.
- **Git:** work on `expo-mobile` or a branch from it. Commit messages are plain English. Never
  force-push.

---

## 12. History

1. Built first as a responsive **web** app (React + Vite + Supabase). Now on `main` and
   superseded.
2. The owner clarified the platform is **cross-platform mobile**, and provided `CLAUDE.md`,
   `docs/00`–`03` and the tokens. The app was rebuilt in **Expo** in the specified monorepo
   layout, with schema updates for cities, `reveal_at`, policy acceptances and idempotency.
3. Added **English and German** copy and removed every hard-coded string.
4. Received `docs/04-screens.md`; aligned the routes and built the **waitlist**.
5. Received the full documents and the design canvas export; built C1–C18 in order with a
   Codex audit per step (Circles, recipes, People, Plan creation, hosting, chats, Inbox, group
   orders, safety, account, policies, profile, notifications, offline, web RSVP, Explore
   filters), then the designed states and the Circle request screen (13–14 November 2026).

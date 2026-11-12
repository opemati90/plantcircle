# PlantCircle — handover

Read this first if you are picking up the project, whether you're a person or a coding
agent. It covers what the project is, the owner's instructions, what has been decided and
built, how to check it, and what is next.

_Last updated: 12 November 2026 · branch `expo-mobile` · repository
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
- **Status:** early v1. One end-to-end journey is built and tested, plus the waitlist. About
  12 of the 60 v1 screens exist. **Nothing has run on a phone or against a real Supabase
  project yet.**

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

**Missing inputs.** `CLAUDE.md` refers to these files, but they have not been provided yet:
`docs/05-data-model.md`, `06-api.md`, `07-state-machines.md`, `08-flows.md`,
`09-accessibility.md`, `10-compliance.md`, `11-ai-features.md`,
`12-notifications-analytics.md`, `13-i18n-copy.md`, `14-testing.md`, `15-backlog.md`,
`16-open-questions.md`, plus the folders `prototype-source/` and `source-docs/`. Without
`15-backlog.md`, work has not followed the owner's sprint order. Without `05`/`06`/`07`, the
database schema is provisional.

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

Requirements: Node 22+ and pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

With no environment variables, a development build uses the **dev fixture backend**: sample
data from the prototype, labelled "Dev fixtures" on screen, email code `000000`. To use a
real backend, copy `apps/mobile/.env.example` to `apps/mobile/.env` and set
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Only the anon key belongs in
the app.

Run everything that checks the code (format, lint, typecheck, unit + component tests,
database tests):

```bash
pnpm check
```

Browser smoke and accessibility tests through Expo's web renderer:

```bash
pnpm --filter @plantcircle/mobile web:smoke
```

Device flows (Maestro, needs a simulator and a development build; never run so far):

```bash
pnpm e2e
```

Last results, 12 November 2026, in a Linux cloud container:

| Check                                                                  | Result  |
| ---------------------------------------------------------------------- | ------- |
| Format, lint (strict type-checked), typecheck                          | pass    |
| Database tests (PGlite: real Postgres, in process)                     | 35 pass |
| Unit + component tests (Jest, Testing Library)                         | 29 pass |
| Browser tests incl. axe WCAG A/AA/AAA-contrast scans, German, waitlist | 28 pass |

---

## 6. What is built

**Journey:** Welcome → goals → city (or skip) → Home → Plan → sign up (Apple / Google /
6-digit email code) → the action that triggered sign-up is resumed → bring something →
cancel.

**Waitlist (AC-17/18/19):**

- First in, first out.
- A freed spot is offered to the first person for 2 hours. If they decline or it expires, it
  passes on.
- Inside the last 6 hours before the start, the spot is offered to everyone in line and the
  first to confirm wins.
- Confirmed guests can never exceed capacity.
- Screens: Plan full → "Join waitlist" with your place in line, the waitlist-offer screen
  with its countdown, and an offer card on Home.

**Screens from the v1 list that exist:** Welcome & onboarding, Home, Loading skeleton, Plan
detail & RSVP (with sign-up sheet), RSVP failed, Plan full → waitlist, Waitlist spot offered,
Create account, Verify email, Server error layout. Explore, My Plans, Inbox, Profile and Start
a Plan are honest "isn't built yet" screens; Profile has sign-out.

**Database** (`supabase/migrations`):

- **Tables:** `cities`, `profiles`, `policy_acceptances`, `idempotency_keys`, `plans`,
  `plan_private`, `rsvps`, `bring_items`, `bring_claims`.
- **Views:** `plan_cards`, `bring_item_cards`, `my_rsvps`.
- **RPCs:** `join_plan`, `cancel_rsvp`, `claim_bring_item`, `join_waitlist`,
  `confirm_waitlist_offer`, and `expire_waitlist_offers` (scheduler only).
- RLS is on everywhere and default grants are revoked.

**Code map:**

```
apps/mobile/app/            routes (expo-router), thin
apps/mobile/src/components/ design-system components (Button, TabBar, BottomSheet, Toast, …)
apps/mobile/src/features/   onboarding · auth · home · plans (screens + pure, tested rules)
apps/mobile/src/lib/        backend contract + Supabase adapter + dev fixtures, i18n, dates, storage
apps/mobile/e2e/            Playwright (web renderer) + maestro/ (device flows)
packages/tokens, copy       design tokens; en/de catalogues
supabase/                   migrations + database tests
```

---

## 7. Verified, unverified, blocked

**Verified here:** every check in §5, and side-by-side screenshots of 6 screens against the
prototype at 390×844 (Expo web).

**Not verified:**

- **No native run at all.** iOS and Android builds, blur, safe areas, the keyboard, Sign in
  with Apple/Google, secure storage, deep links, VoiceOver/TalkBack, Dynamic Type at 200% and
  Reduce Motion are all untested on devices.
- **Never run against Supabase.** It has only been tested on PGlite.
- Native and OAuth code was written against the installed packages' types, because the Expo
  and Supabase docs were blocked in the build environment. Review `supabaseBackend.ts` and
  `storage.ts` against current docs.
- **CI** (`.github/workflows/ci.yml`) only runs on `main` and on pull requests, so it has
  **never run** for the mobile code.
- German strings not taken from the prototype's German screens need a native speaker.

**Blocked on the owner:** see §10.

---

## 8. Known gaps and risks

- **Waitlist.** Without notifications nobody is told a spot was offered, and without a
  per-minute job calling `expire_waitlist_offers()` offers are only passed on when someone
  opens that Plan.
- **Launch requirements not started:** report/block + staff console + audit log, privacy
  choices, account export and deletion, Terms/Privacy, offline cache, notifications, web RSVP
  (Next.js `apps/web`), Sentry, PostHog.
- **Schema is provisional** until `docs/05`, `06` and `07` arrive.
- **Placeholders introduced:**
  - Policy version `2026-11`.
  - Bundle id `app.plantcircle.mobile` and scheme `plantcircle://`.
  - Display name for email sign-ups comes from the email address (no name step yet).
  - Some prototype colours are not tokens yet (`extra` in `src/components/theme.ts`).

  All of these belong in `docs/16-open-questions.md` once that file exists.

- **Deviations from the prototype** are listed in `README.md` with reasons.

---

## 9. Recommended next steps, in order

1. **Get the missing docs into the repo** (`docs/05`–`16`, `prototype-source/`), then
   reconcile the schema with `05`/`06`/`07` and follow `15-backlog.md`.
2. **Run it on devices:** an EAS development build or local simulators. Run the Maestro flow,
   fix native issues, and check the `Slot` tab layout.
3. **Create the Supabase project (EU region)** once the owner approves. Configure email OTP,
   Apple and Google, apply the migrations, schedule `expire_waitlist_offers()`, and run the
   journey for real.
4. **Notifications** (Expo push + email), so the waitlist actually works.
5. **Safety:** report sheet → details → done, block, the staff console, the audit log.
6. **Account:** privacy choices, notification settings, export and delete, Terms update.
7. **Remaining v1 tabs and flows:** My Plans, Explore/search, Start a Plan, Circles, chat,
   group orders, recipes.
8. **Merge decision** for `expo-mobile` → `main` (§10), so CI starts running.

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
- **Dev fixture test hooks:**
  - `globalThis.__pcFixtures.failNext(op)` simulates a network failure.
  - `globalThis.__pcFixtures.freeSpot(planId)` simulates another guest cancelling.
  - `__pcFixtureFailures` simulates failures from the first call after load.
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

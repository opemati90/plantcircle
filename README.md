# PlantCircle

Cook, eat and buy food together with plant-based people nearby. Launch city: Berlin.

Status: **milestone 1 of the MVP** — the first end-to-end journey. Not production-ready;
see [Release blockers](#release-blockers).

## What works today

Welcome → what brings you here → city → Home (this week's Plans) → Plan details →
sign up (Apple / Google / 6-digit email code, no passwords) → Join → bring something →
cancel.

Acceptance criteria (each covered by an automated test):

| #   | Criterion                                                                                         | Verified by               |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | A visitor can browse Home and a Plan before creating an account                                   | `e2e/journey.spec.ts`     |
| 2   | Joining requires an account; after sign-up the visitor lands back on the Plan, joined             | `e2e/journey.spec.ts`     |
| 3   | A Plan can never have more confirmed guests than its capacity; joining is idempotent              | `tests/db/access.test.ts` |
| 4   | The exact address is readable only by the host, or by confirmed guests from 24 h before the start | `tests/db/access.test.ts` |
| 5   | Members cannot read each other's profiles or RSVPs, or write RSVPs directly                       | `tests/db/access.test.ts` |
| 6   | A failed RSVP says so, holds no spot, and can be retried                                          | `e2e/journey.spec.ts`     |
| 7   | Cancelling frees the spot and releases anything the member said they'd bring                      | both                      |
| 8   | Unconfirmed allergens are never shown as "none" or "safe"                                         | `planCopy.test.ts`        |
| 9   | No automatically detectable WCAG 2.2 A/AA violations; sheet traps focus; keyboard works           | `e2e/a11y.spec.ts`        |

## Getting started

```bash
npm install
npm run dev
```

With no environment variables the dev server uses **development fixtures** (an in-browser
fake backend, labelled on screen; the email code is `000000`). To use a real backend, copy
`.env.example` to `.env` and fill in the Supabase URL and anon key. A production build
without those variables refuses to start rather than serving fixture data.

Supabase project setup (not done yet — needs an account and your approval):

1. Create a project in an **EU region** (Frankfurt) and apply `supabase/migrations`.
2. Auth → enable Email with OTP; put `{{ .Token }}` in the email template (6 digits, 10 min
   expiry). Enable Apple and Google providers. Add `<site>/auth/callback` to redirect URLs.
3. Keep Supabase's built-in auth rate limits on; configure custom SMTP before launch.

## Architecture

One static single-page app plus a managed backend. No custom server.

- **Client:** React 19 + TypeScript (strict) + Vite, React Router, TanStack Query, zod,
  plain CSS modules with design tokens. Built as a responsive web app sized for phones
  (the design's 390×844 artboards), centred in a 430px column on larger screens.
- **Backend:** Supabase (Postgres, Auth). The client talks to the database directly;
  authorisation is enforced by row-level security and `SECURITY DEFINER` functions, not by
  the UI.
- **`src/data/backend.ts`** is the only contract screens depend on. `supabase/` is the real
  adapter; `fixtures/` is a dev/test stand-in and is not included in production bundles.

Why this stack (proposed — there was no existing repository): it is the smallest thing that
serves the design's own growth loop ("RSVP from a shared link, no install"), it can be
rendered and tested here, and it can be wrapped for the app stores later with Capacitor
without a rewrite. Native iOS/Android builds are **not** part of this milestone.

```
src/app          router, providers, not-built placeholder
src/design       tokens.css, base.css, icons, shared UI
src/features     onboarding · auth · home · plans (screens + pure rules + tests)
src/data         types, Backend contract, supabase adapter, dev fixtures
supabase         SQL migrations (schema, RLS, functions)
tests/db         migration + access-policy tests on in-process Postgres (PGlite)
e2e              Playwright journeys, accessibility, visual baselines
```

## Security and data handling

Threat model (lightweight):

| Asset                                               | Risk                                                                          | Control                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Exact Plan address (people's homes)                 | Scraped by non-guests                                                         | Separate table; RLS via `can_see_address`; never in public views, share links or calendar files unless already unlocked for that viewer |
| RSVPs / who attends what                            | Enumerating a person's whereabouts                                            | RSVP rows readable only by their owner; public views expose counts and up to three first initials                                       |
| Profile (email is in Supabase Auth, not `profiles`) | Cross-user reads, self-promotion to verified host                             | Own-row RLS; column-level grants exclude `is_verified_host` and acceptance timestamps                                                   |
| Capacity / claims                                   | Over-booking by concurrent or repeated requests                               | Row lock + count inside `join_plan` / `claim_bring_item`; idempotent                                                                    |
| Session                                             | Open redirect after sign-in; data leaking between accounts on a shared device | `safeNextPath`; query cache cleared when the user changes                                                                               |
| Secrets                                             | Service-role key in the bundle                                                | Only the anon key is a `VITE_` variable; `.env*` is git-ignored                                                                         |

Personal data collected: email (Auth), display name (first name + last initial, derived),
city, onboarding goals, accepted terms version + timestamp, RSVPs and claims. Nothing is
sent to analytics or third parties. Controls drawn from OWASP ASVS (access control, input
validation, session handling); no certification is claimed.

## Design fidelity

Screens implemented from the canvas: Welcome (3 steps), Home, Home loading, Plan, Plan
sign-up sheet, RSVP failed, Sign up, Verify email, server-error layout. Verified by
rendering the design markup and the app at 390×844 in Chromium and comparing side by side;
`npm run test:visual` keeps baselines. **Not verified:** Safari/iOS, Android Chrome,
Firefox, and real SF Pro rendering (Linux Chromium falls back to another sans-serif for
both the design and the app).

Deliberate deviations:

| Where             | Design                                                                      | Built                                             | Why                                                                                   |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Welcome           | Language chip "English"                                                     | Omitted                                           | German is not built; a dead control is worse than none                                |
| City step         | City picker chevron, "Skip for now", "online classes and worldwide circles" | Static Berlin, no skip, "More cities will follow" | One launch city; online/global features don't exist yet                               |
| Home (signed out) | Bell + avatar                                                               | "Sign in" chip                                    | The design only shows the signed-in header                                            |
| Home              | City chevron, invitation dot, Save bookmark, group-order card               | Omitted                                           | City switching, invitations, saving and group orders are not built                    |
| Home              | "Up next" opens My Plans                                                    | Opens the Plan                                    | My Plans is not built                                                                 |
| Plan              | "Message" host, footprint chip                                              | Omitted                                           | Messaging must ship with request/block/report; impact has no data source              |
| Plan              | Tapping "You're going" cancels immediately                                  | Confirmation sheet first                          | Prevents losing a spot by accident                                                    |
| Plan (full)       | Waitlist                                                                    | Disabled "Full" button                            | Waitlist offers/notifications are not built; a list that never promotes would be fake |
| Sign up           | Email field border `#E5E5EA`, prefilled address                             | Border `#8A8A8E`, empty with placeholder          | Field boundary needs 3:1 contrast (WCAG 1.4.11)                                       |
| Sign up           | Terms / Privacy / "Under 18?" links                                         | Plain text                                        | The documents and the age-blocked screen don't exist yet                              |
| Verify email      | "Open mail app"                                                             | Omitted                                           | No reliable way to open an inbox from the web                                         |
| Type              | Sizes in px                                                                 | Same sizes in rem                                 | Respects the reader's browser font size                                               |

## Costs (unverified — check before committing)

Pricing below is from memory, **not checked against the vendors' pages**; verify before
creating anything billable. Nothing has been purchased or provisioned.

| Need                              | Recommendation                                                                                    | Expected cost                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Database + auth                   | Supabase, EU region. Free tier for development (pauses when idle, no backups); Pro for production | about US$25/month at launch         |
| Static hosting                    | Cloudflare Pages or Netlify free tier                                                             | €0                                  |
| Transactional email (login codes) | Resend or Postmark via Supabase custom SMTP                                                       | free tier to roughly US$15–20/month |
| Apple sign-in                     | Apple Developer Program                                                                           | US$99/year                          |
| Domain                            | —                                                                                                 | about €15/year                      |

Cost drivers are login emails (one per email sign-in) and database size, not user count;
at 1,000–10,000 monthly users this journey stays inside the Pro plan's included usage.
Supabase has a spend cap toggle on Pro (a real cap for over-usage); email providers only
alert. Data export is a standard `pg_dump`.

## Not built yet

Routes that exist only as an honest "isn't built yet" screen: Explore, My Plans, Inbox,
Profile (sign-out only), Start a Plan. Everything else on the canvas (circles, group
orders, chat, recipes, online Plans, payments, hosting tools, AI features, German,
web RSVP without an account, staff console, notifications, offline) is not started.

## Release blockers

- No Supabase project yet: the Supabase adapter is type-checked and its error mapping is
  unit-tested, but it has **never run against a real project**. Schema, RLS and functions
  are tested on real Postgres semantics (PGlite), not on Supabase itself.
- Reporting, blocking and moderation (the design marks these as a ship blocker).
- Terms, Privacy Policy and Community Rules; data export and account deletion; the
  post-sign-up privacy choices screen. Needs legal review (GDPR/TDDDG/DSA) — not assessed here.
- Members cannot edit their display name yet (Profile).
- Plan creation (Plans can currently only be inserted by an administrator).
- Production monitoring/error reporting, backups and a restore drill, staging environment.
- Cross-browser and real-device checks; manual screen-reader pass (VoiceOver, TalkBack).

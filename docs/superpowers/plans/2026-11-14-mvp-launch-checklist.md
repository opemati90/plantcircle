# MVP launch checklist (2026-11-14)

State of `expo-mobile` after the 2026-11-14 sessions. Every row in the gap analysis
(`2026-11-14-gap-analysis.md`) is either closed, listed below as remaining build work, or
listed as needing the owner.

## Verified today

| Gate | Result |
| --- | --- |
| Format, lint, typecheck | clean |
| Unit and component tests (jest) | 221 passed |
| Database tests (PGlite, all migrations + seed) | 198 passed |
| Browser journeys (Playwright, fixture backend) | 95 passed |
| Maestro flows on the iOS simulator | 5 flows, last full run before this session's UI changes |

The app has only been run against the fixture backend and the in-memory database. It has never
run against a real Supabase project. That is the first thing to do once the project exists.

## Launch scope (2026-11-15)

The owner narrowed the launch to one rhythm: every Circle is a weekly cook club
(`docs/superpowers/specs/2026-11-15-lean-core-design.md`). Four tabs (This week, Circles,
Inbox, Profile); a weekly challenge per Circle; Cooked it posts; the table (a cook-together Plan).
Hidden at launch but kept in code and tests (`apps/mobile/src/lib/features.ts`): group orders,
recipes as a section, People and connecting, the bring list, hosting levels in the interface.
Hosting: 3 posts open online Plans, a 2-week-old account opens in-person ones.
Known and accepted: the group order RPCs and their push notifications still exist on the
server; nothing in the launch app can create an order, so they stay silent. Switching group
orders back on needs no database change.

## What the MVP does

- Onboarding with goals and a typed city (global, no prebuilt list); skip lands on online Plans.
- Home, Explore (Circles, Plans, Learn, People), filters, country/city browsing.
- Plans: in person and online (Google Meet link), join, waitlist with timed offers, bring list,
  address revealed at `reveal_at`, link 15 minutes before start, offline copy.
- Hosting earned through recipes and levels; create, manage, check-in, end, edit time or place
  (guests re-confirm), cancel with a message, feedback once per guest.
- Group orders paid outside the app; Circles with join requests, leave, cooldown, audit.
- People with a profile shown before you connect or answer a message request; direct chat.
- Safety: report and block everywhere, blocks hide content both ways, staff console, appeals,
  suspended hosts' Plans held; audit log.
- Notifications in app and push in 8 languages, quiet hours, weekly digest.
- Cooked it (2026-11-15, `docs/superpowers/specs/2026-11-15-cooked-it-design.md`): members share
  a photo of what they cooked with one Circle; Home shows the latest from your Circles, each
  Circle's Posts tab is its feed, Yum, Ask how (editable direct message), report, block, delete,
  Your posts. Photos are stripped of metadata on the server (`cook-upload`), private, signed for
  10 minutes, and removed by `cook-photo-cleanup`.

## Needs the owner before launch

1. **Supabase project: created 2026-11-15** (`qxzbjkpggoekagvinazn`, EU, free plan, linked).
   Done: all 31 migrations applied, the three edge functions deployed, public URL and anon key in
   `apps/mobile/.env.staging` (git-ignored; `pnpm start:staging` and `pnpm smoke:staging` load
   it). The staging smoke test passes: onboarding, typed city, Home, Explore.
   Also done (2026-11-15, audited by Codex): service-role grants, reminders scheduled inside the
   database every 15 minutes, push-dispatch scheduled every minute, both workers refuse anything
   but a POST with the service-role key (verified live: anon 403, GET 405, no key 401), seed
   split into `seed.sql` (cities) and `seed.demo.sql` (local only, never on this project).
   Cooked it needs, after `supabase db push` and deploying `cook-upload`, `cook-photo-urls`
   and `cook-photo-cleanup`: nothing more from the owner. The migration creates the private
   `cook-photos` bucket, its read policy and the 10-minute cleanup job (same Vault secrets as
   push).
   Owner steps left, in the dashboard:
   - Vault: add `plantcircle_project_url` = `https://qxzbjkpggoekagvinazn.supabase.co` and
     `plantcircle_service_role_key` = the service_role key. Push stays off until both exist.
   - Integrations → Cron: confirm `plantcircle-reminders` and `plantcircle-push-dispatch` exist.
   - Authentication → Email Templates: Magic Link and Confirm signup contain `{{ .Token }}` and
     keep `{{ .ConfirmationURL }}` (the web RSVP email uses the link). Email OTP length 6,
     expiry 600 s.
   - Authentication → SMTP: your email provider (built-in email only reaches team members,
     two an hour).
   - Authentication → URL Configuration: Site URL = the web origin; redirect URLs
     `plantcircle://auth/callback` and `https://<web host>/p/*`. Then set the function secret
     `APP_WEB_URL`.
   - Optional: run `seed.sql` for the starter cities (members can also type any city).
   - Pro plan before real users.
2. **Email provider** (for example Postmark or Resend, EU): API key and a verified sending
   domain. Waitlist offers, changes, cancellations and moderation notices queue email rows that
   nothing sends yet.
3. **Expo account and store accounts.** EAS project id, Apple Developer team, Google Play
   console, APNs key and FCM credentials for push.
4. **Sentry DSN and PostHog (EU) project key**, if crash reporting and analytics ship in v1.
   Analytics must stay behind the consent choice that already exists.
5. **Photos.** The images in `apps/mobile/assets/images` are cropped stand-ins from an
   inspiration screenshot and are not licensed. Replace them before any public build.
6. **Legal texts.** Terms, privacy notice, community rules and imprint are placeholders.
7. **Translations.** Seven non-English locales are machine-quality and need a native-speaker
   pass. German first for a Berlin launch.
8. **Launch city list** in `supabase/seed.sql` is the engineer's placeholder.

## Remaining build work, in order

| # | Item | Blocks launch? | Notes |
| --- | --- | --- | --- |
| 1 | First run against the real Supabase project; fix what breaks | Yes | Needs owner item 1 |
| 2 | `email-send` edge function | Yes | Needs owner item 2 |
| 3 | Sentry + consent-gated PostHog with the 23 core events | Owner's call | Needs owner item 4; native rebuild |
| 4 | Physical-device pass: VoiceOver, TalkBack, 200% text, low-end Android cold start | Yes | Simulator checks done; devices not. At the largest iOS text size the sign-up screen's Email field could not be reached by Maestro (found 2026-11-15, not yet investigated) |
| 5 | Universal links for `plantcircle.app/p/{id}` | Recommended | Needs the domain |
| 6 | Realtime for chat instead of 5–15 s polling | No | Polling works |
| 7 | Plan drafts, Circle-scoped Plans, invites, moderator removal | No | v1.1 candidates |
| 8 | AI Plan draft (Anthropic, server-side, labelled) | No | v1 lists it; app works without it |
| 9 | Server full-text search and language filter | No | Client search works at launch scale |
| 10 | Report evidence upload, staff host verification, AI triage | No | Manual staff flow exists |

## Decisions made by the engineer (open for the owner)

- A time or place change asks going guests to re-confirm; title, description and capacity do not.
- Capacity can only drop to the number of people already going.
- A changed Plan is published again after 48 hours whatever is unanswered.
- A person's profile shows name, home city, joined month, shared Circles, hosting level,
  recipes, Plans hosted, upvotes and Plans together. Never diet, goals, location or contact.
- Someone hidden from People becomes visible to you only while they have a pending connection
  or message request to you.

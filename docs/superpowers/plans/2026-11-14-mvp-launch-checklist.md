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

## Needs the owner before launch

1. **Supabase project (EU region).** URL, anon key, service-role key, and database password.
   Then: run migrations, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as
   EAS environment variables, schedule the reminders cron, deploy the edge functions.
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
| 4 | Physical-device pass: VoiceOver, TalkBack, 200% text, low-end Android cold start | Yes | Simulator checks done; devices not |
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

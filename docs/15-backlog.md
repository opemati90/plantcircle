# 15 — Backlog by sprint (v1)

Two-week sprints. Each story lists acceptance criteria (AC). Build in this order; don’t start a sprint’s stories before the previous sprint’s DoD is met.

## Sprint 0 — Foundation (1 week)
- **S0-1 Monorepo & CI.** AC: pnpm workspaces (mobile, web, packages); lint, typecheck, test, Maestro smoke in CI; EAS build profiles (dev, preview, prod).
- **S0-2 Supabase.** AC: local + staging projects (EU); migration `0001_core.sql`; generated types in `packages/types`; seed data matching prototype (Ama, Jonas, Mia, Lena, 3 Plans, 1 group order, 2 Circles).
- **S0-3 Design system v1.** AC: tokens package; Button, IconButton, Chip, SegmentedControl, FactRow (+ DateTile, MapTile, IconTile, AvatarStack, CapacityBar), PosterHero, Section, FloatingActionBar, BottomSheet, Switch, RadioCard, Stepper, Toast, Skeleton, EmptyState, StatusPill, TabBar — each with a11y props and a Storybook/preview screen.
- **S0-4 i18n, analytics (consent-gated), Sentry, feature flags.**

## Sprint 1 — Accounts & browsing
- **S1-1 Onboarding (Welcome, goals, city).** AC: works without account; city search any country; skip lands on Explore with online Plans; no location permission.
- **S1-2 Auth sheet + resume action.** AC: Apple, Google, email OTP; 18+ confirmation stored; policy acceptance stored; triggering action resumes after sign-in (T-01 safe).
- **S1-3 Privacy choices + consent events.** AC: defaults off; equal buttons; analytics SDK only after consent.
- **S1-4 Tabs shell + Home (anon & signed-in).** AC: Up next when joined; featured; near you; EmptyCity for zero Plans; HomeLoading skeleton.
- **S1-5 Settings: notifications, account & data (export request, two-step delete), Terms update modal, accessibility statement, under-18.**

## Sprint 2 — Plans & RSVPs
- **S2-1 Plan detail + variants.** AC: facts, sections, private address per RLS (T-06), signed-out Join → sign-up → going.
- **S2-2 RSVP engine.** AC: `rsvp_join/cancel`, waitlist, `promote_waitlist`, offers 2 h, cron expiry, all-at-once within 6 h (T-01, T-02, T-17).
- **S2-3 Waitlist offer screen, Plan full, changed, cancelled, on hold, offline, RSVP error.**
- **S2-4 My Plans (Going, Hosting, Past) + offline cache.** AC: T-13.
- **S2-5 Notifications pipeline.** AC: push tokens, `push-dispatch`, quiet hours, lock-screen setting, reminders cron, in-app inbox rows; prompt after first RSVP.

## Sprint 3 — Hosting
- **S3-1 Create flow (type → details 4 steps).** AC: date strip, start/duration, private address, capacity, allergens required (T-10).
- **S3-2 AI draft.** AC: edge function, schema validation, detected ticks, fallback (T-18), rate limit, AI badge.
- **S3-3 Published + share (universal link) + web RSVP page (Next.js).** AC: T-16; guest RSVP counts toward capacity; email confirmation.
- **S3-4 Manage guests + check-in + End Plan + feedback.** AC: window rules; audit; participation metric server-side.
- **S3-5 Contributions (bring slots, claims).** AC: atomic claims.

## Sprint 4 — Community & messaging
- **S4-1 Circles (open/request/invite), approvals, create, Circle page tabs.** AC: T-05.
- **S4-2 Explore (Circles, Plans, Learn, People) + search + filters + no results.** AC: full-text EN/DE; filters persist per session.
- **S4-3 Messaging: Plan/Circle chats, DMs, message requests, chat actions.** AC: Realtime; idempotent sends; mute; T-07.
- **S4-4 Recipes: detail (servings scaling), create (allergens or “not confirmed”).**

## Sprint 5 — Group orders & safety
- **S5-1 Group orders end to end** (create, interest, below-target decision, pickup, collected). AC: T-09; pay-at-pickup notice on every money screen.
- **S5-2 Report/block everywhere + case receipt + suspension notice + appeal.** AC: T-07, T-08.
- **S5-3 Staff console (web): queue, case, AI triage suggestion, decisions with reasons, audit log, host verification, appeals.** AC: SSO+MFA; T-15.

## Sprint 6 — Hardening & beta
- Accessibility pass (T-11, T-12), performance (cold start < 2.5 s on low-end Android), load test, security review (RLS audit, rate limits), store listings, privacy labels, beta with Founding Hosts.

## After pilot gate → v1.1 epics
Online class journey · Global editions · AI translation, recipe card, shopping list, alt text · Impact (estimate, leftovers, dashboard, habit check-in) · Shop directory (OSM import, add a shop, store profile, supplier picker).

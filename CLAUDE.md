# PlantCircle — instructions for Claude Code

PlantCircle is a mobile-first community app where people cook, eat and buy food together, mostly plant-based: in person (cooking nights, potlucks, group orders) and online (live cook-alongs, global editions). It is **global by default** and launches with a first city, but nothing may be limited to one city or country.

Read this file first, then `docs/01-mvp-scope.md`. Build only what is marked **v1** unless told otherwise.

## Where everything is

| Need | File |
| --- | --- |
| What we’re building and why | `docs/00-product-brief.md` |
| What ships in v1 vs later (every screen) | `docs/01-mvp-scope.md` |
| Stack, repo layout, environments | `docs/02-architecture.md` |
| Design tokens and components | `docs/03-design-system.md`, `design/tokens.json`, `design/tokens.ts` |
| Every screen: route, data, states, actions | `docs/04-screens.md` |
| Database schema and row-level security | `docs/05-data-model.md` |
| API / RPC contracts | `docs/06-api.md` |
| State machines (Plan, RSVP, waitlist, order, report) | `docs/07-state-machines.md` |
| End-to-end flows and edge cases | `docs/08-flows.md` |
| Accessibility rules and checks | `docs/09-accessibility.md` |
| Privacy, safety, legal rules for code | `docs/10-compliance.md` |
| AI features (prompts, schemas, guardrails) | `docs/11-ai-features.md` |
| Notifications and analytics events | `docs/12-notifications-analytics.md` |
| Copy, i18n, formatting | `docs/13-i18n-copy.md` |
| Tests, QA, definition of done | `docs/14-testing.md` |
| Backlog by sprint with acceptance criteria | `docs/15-backlog.md` |
| Open decisions and placeholders | `docs/16-open-questions.md` |
| Visual reference for every screen | `prototype-source/` (see its README) |
| Founder strategy and original PRD | `source-docs/` |

## Stack (decided)

Expo (React Native, TypeScript, Expo Router) · Supabase (Postgres + PostGIS, Auth, Storage, Realtime, Row Level Security) · Supabase Edge Functions for transactional logic · TanStack Query with persisted cache + expo-sqlite for offline · i18next · Sentry · PostHog (EU hosting) · Anthropic API for AI features (server-side only) · Stripe Connect later (not v1).

## Non-negotiable rules

1. **Global by default.** Never hard-code a city, country, currency or language. City is user-chosen data. Features gated by law/payments show a plain message and an alternative — they never block the person.
2. **Accessibility: WCAG 2.2 AA everywhere, AAA where feasible.** Text contrast ≥ 7:1 using the tokens; every touch target ≥ 44×44 pt; every control has an accessible name, role and state; support Dynamic Type / font scale to 200%; respect Reduce Motion. See `docs/09-accessibility.md`.
3. **Server is the source of truth.** Capacity, waitlists, check-ins, claims and order quantities change only inside one database transaction (RPC). Every state-changing call takes an `Idempotency-Key`.
4. **Privacy.** No exact location collection (user picks a city/area). Diet preference is optional, private by default, and never sent to analytics or used for ads. Exact Plan addresses are revealed only to confirmed guests at `reveal_at`. No contact-detail export for hosts.
5. **Safety ships with v1.** Report and block on every person, Plan, post, message and group order; staff console; audit log.
6. **AI is optional and labelled.** Every AI step has a “do it myself” path, output is labelled “Written with AI” / “Translated by AI”, a person confirms before anything publishes, and AI never sets allergens or safety facts.
7. **Money.** v1 has no in-app payments. Group orders are paid to the organizer outside the app, and every money screen says so.
8. **Every primary button responds** (state change, navigation, or an error with Retry). No dead ends: every end screen offers a next step.
9. **Copy** is plain, short, friendly, second person. Use the strings in the prototype as the source of truth until a copy deck exists. Typographic apostrophes (’) in UI text.

## How to work

- Build in the sprint order in `docs/15-backlog.md`. Each story has acceptance criteria — write tests for them first where practical.
- Use the components in `docs/03-design-system.md`; don’t invent new visual styles. If a screen needs something new, add it to the design system first.
- Match the prototype screens in `prototype-source/` for layout, hierarchy and copy. They are HTML references, **not** production code — don’t port their markup.
- Keep `[bracketed]` values as placeholders and list any you introduce in `docs/16-open-questions.md`.
- Before marking a story done, run the Definition of Done in `docs/14-testing.md`.

## Commands (once scaffolded)

```
pnpm install
pnpm dev            # expo start
pnpm test           # unit + component tests (jest, @testing-library/react-native)
pnpm e2e            # maestro flows in /e2e
pnpm db:reset       # supabase db reset (local) + seed
pnpm lint && pnpm typecheck
```

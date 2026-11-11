# PlantCircle — instructions for coding agents

**`CLAUDE.md` is the source of truth.** Read it first, then `docs/01-mvp-scope.md`.
This file only adds what the current code base does that `CLAUDE.md` does not yet say.

## Commands that exist today

```bash
pnpm install
pnpm dev                                        # expo start (apps/mobile)
pnpm check                                      # format, lint, typecheck, unit + database tests
pnpm --filter @plantcircle/mobile web:smoke     # Playwright through Expo's web renderer
pnpm --filter @plantcircle/db test              # migration + access tests on in-process Postgres
```

`pnpm e2e` (Maestro) and `pnpm db:reset` from `CLAUDE.md` are not set up yet.

## Conventions in this code base

- Screens talk to the `Backend` interface (`apps/mobile/src/lib/backend/backend.ts`) only.
  Supabase is imported only under `src/lib/backend/supabase`. Without Supabase env vars a dev
  build uses the labelled fixture backend; a release build refuses to start.
- Copy and derivation rules are pure and unit-tested (`planCopy.ts`, `dates.ts`, `authRules.ts`).
- Every mutating call takes an idempotency key: create it with `newIdempotencyKey()` per user
  action and re-send the same key on retry.
- Tokens come from `@plantcircle/tokens` (re-exports `design/tokens.ts`). Colours the prototype
  uses that are not tokens yet live in `src/components/theme.ts` (`extra`) — do not add more
  without listing them as an open question.
- Use `aria-*` props (`aria-checked`, `aria-selected`, `aria-disabled`) for control state: they
  work on iOS, Android and web. Decorative photos go through `<Photo>` without `alt`.
- New tables: enable RLS, revoke default grants, grant the minimum, add a test in
  `supabase/tests`.
- Never commit secrets. Only `EXPO_PUBLIC_SUPABASE_URL` and the anon key may reach the app.
- `docs/`, `design/` and `CLAUDE.md` are provided documents: do not reformat them.

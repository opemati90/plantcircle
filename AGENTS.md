# PlantCircle — instructions for coding agents

Read `README.md` first: it holds scope, architecture, security rules and what is not built.

## Commands

- `npm run dev` — dev server; without Supabase env vars it uses the labelled fixture backend
- `npm run check` — format check, lint, typecheck, unit + database tests, production build
- `npm run test:e2e` — Playwright journeys + accessibility (starts the dev server itself)
- `npm run test:visual` — screenshots at 390×844; `-- -u` to update after an intended change

## Rules

- **Design source of truth:** the "PlantCircle MVP" design canvas. Match it; do not restyle.
  Use tokens from `src/design/tokens.css`; never hard-code a colour, radius or shadow that
  has a token. Font sizes are `rem` (design px ÷ 16). Record any deliberate deviation in the
  README table.
- **Structure:** `src/features/<feature>` (screens + their rules), `src/design` (tokens, shared
  UI), `src/data` (backend contract and adapters), `src/lib` (pure helpers). Screens talk to
  the `Backend` interface only — never import Supabase outside `src/data/supabase`.
- **Business rules live in SQL** (`supabase/migrations`), enforced by RLS and
  `SECURITY DEFINER` functions. The UI only mirrors them. New tables: enable RLS, revoke
  default grants, grant the minimum, and add a test in `tests/db`.
- **Copy/derivation logic is pure and tested** (`planCopy.ts`, `dates.ts`, `authRules.ts`);
  keep it out of components.
- Never show success before the server confirms. Every screen needs loading, error and
  empty states. No dead buttons: unbuilt destinations route to `NotBuiltScreen`.
- Accessibility: real `<button>`/`<a>`/`<input>` elements, 44px targets, visible focus, text
  contrast ≥ 4.5:1; new screens get an axe check in `e2e/a11y.spec.ts`.
- Never commit secrets. Only `VITE_SUPABASE_URL` and the anon key may reach the client.
- Do not weaken or delete tests to get a green run.

## Definition of done

Acceptance criteria work end to end · permissions enforced in the database and tested ·
loading/empty/error states exist · `npm run check` and `npm run test:e2e` pass · screenshots
compared with the design · README updated if scope, deviations or setup changed.

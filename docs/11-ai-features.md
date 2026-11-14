# 11 — AI features (Anthropic API, server-side only)

Never call the API from the app; use Edge Functions with the key in secrets. Check current model names in Anthropic’s docs before shipping; the plan is a fast model for drafts/translation/lists (e.g. `claude-haiku-5-5`) and a stronger one for safety triage (e.g. `claude-sonnet-5-5`).

## Shared rules
- Output **JSON only**, validated with zod; on invalid JSON retry once, then fall back to “Fill it in myself”.
- Never output or infer allergens, medical, legal or safety facts. Allergens always come from the person.
- Label results in UI (`AIBadge`) and store `ai_written=true`.
- Log `ai_requests` (feature, tokens, cost) without message bodies or diet data. Rate limits: free hosts 3 drafts/month (Later: unlimited for Host Pro); translation cached per (target, lang).
- Timeouts 15 s; show a friendly retry.

## 1. Plan draft (v1) — `ai-draft-plan`
Input: `{ text, plan_kind, city_name, locale, now_iso, user_tz }`.
System prompt (summary): “You turn a host’s one-sentence description of a food gathering into a draft Plan. Return JSON only. Do not invent allergens, prices or addresses. If information is missing, leave it null.”
Output schema:
```json
{ "title": "string ≤ 60", "description": "string ≤ 280", "starts_at": "ISO|null", "duration_minutes": "int|null",
  "capacity": "int|null", "area": "string|null", "bring_slots": [{"label": "string", "needed": 1}],
  "detected": { "when": true, "where": true, "how_many": true, "what_to_bring": true } }
```
The “what we picked up” ticks come from `detected`. User reviews → `CreateDetails` pre-filled (allergens still empty → required).

## 2. Report triage (v1, staff only) — `ai-triage-report`
Input: category, reporter text, scoped history (counts, not raw messages). Output: `{ severity: "urgent|high|routine", category, rationale ≤ 300 chars }`. Stored in `reports.ai_suggestion`; staff decide. Urgent keywords (threats, stalking, self-harm, child safety) page on-call immediately regardless of the model.

## 3. Translation (v1.1) — `ai-translate`
Translate posts/Plan descriptions to the viewer’s language. Exclude allergen and safety fields — always show them in the original. Banner: “Translated by AI · See original”.

## 4. Recipe card from notes (v1.1) — `ai-recipe-card`
Notes → `{ title, serves, minutes, ingredients:[{name, qty, unit}], steps:[string] }`. Allergens left unconfirmed; Send disabled until the host confirms allergens.

## 5. Shopping list adaptation (v1.1) — `ai-shopping-list`
Recipe ingredients + guest country/locale → local names, metric/US units, substitutions with a short reason (“Habanero instead of scotch bonnet”). Never changes allergens; show original list one tap away.

## 6. Alt text suggestion (v1.1)
Image → one-sentence alt text suggestion; author must confirm or edit.

## Evaluation
Keep a small golden set per feature (20–50 examples) and run it in CI on prompt changes; track invalid-JSON rate, edit distance after human review, and refusals.

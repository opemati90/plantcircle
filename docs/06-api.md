# 06 — API contracts

Client calls **Postgres RPCs** via `supabase.rpc(name, params)` (transactional, RLS-checked) or **Edge Functions** via `supabase.functions.invoke(name, { body, headers: { 'Idempotency-Key': uuid } })`. Reads that are plain selects use PostgREST with RLS.

## Error model
Return `{ ok: false, code, message }` with stable codes the UI maps to copy:
`AUTH_REQUIRED` · `SUSPENDED` · `PLAN_FULL` · `PLAN_NOT_OPEN` · `ALREADY_JOINED` · `OFFER_EXPIRED` · `ALLERGENS_REQUIRED` · `NOT_HOST` · `BLOCKED` · `RATE_LIMITED` · `VALIDATION` (+ `fields`) · `COUNTRY_GATED` · `INTERNAL` (+ `request_id`).

## v1 RPCs

| Name | Params | Returns | Rules |
| --- | --- | --- | --- |
| `home_feed` | city_id? | up_next, featured, near_you[], invitations_count | anon allowed (no up_next) |
| `search` | q, filters {when, where, price, languages[]} | plans[], circles[], recipes[] | full-text (Postgres `tsvector`, simple + german configs) |
| `get_plan` | plan_id | plan, host, counts, my_rsvp, slots, private? | private only when allowed (see RLS) |
| `rsvp_join` | plan_id, idem_key | rsvp {state, position?} | locks plan row (`for update`); going if count<capacity else waitlisted; not if blocked by host; not if suspended |
| `rsvp_cancel` | plan_id, idem_key | ok | frees spot → `promote_waitlist(plan_id)` |
| `waitlist_respond` | plan_id, accept bool, idem_key | rsvp | `OFFER_EXPIRED` after `offer_expires_at` |
| `web_rsvp` (edge fn) | plan_id, first_name, email, age_confirmed, captcha | ok | rate-limited per IP/email; magic-link email; same capacity rules |
| `plan_create_draft` | fields | plan_id | status draft |
| `plan_publish` | plan_id | plan | requires title, time, capacity, `allergens` non-empty → else `ALLERGENS_REQUIRED` |
| `plan_update` | plan_id, patch | plan | time/place change → status `changed`, notify going guests, ask re-confirm |
| `plan_cancel` | plan_id, reason | ok | notify, release claims, keep record |
| `slot_claim` / `slot_unclaim` | slot_id | slot | atomic: claims < needed |
| `checkin_toggle` | plan_id, rsvp_id | rsvp | host/co-host; window start−60m…end+120m; audited |
| `plan_end` | plan_id | ok | marks `completed`, unmarked going → `no_show` after window |
| `feedback_submit` | plan_id, rating, tags[], comment? | ok | once per user |
| `order_create` | plan fields + items[] + closes_at + pickup | plan_id | — |
| `order_set_interest` | item_id, quantity, idem_key | totals | non-binding; locked after `closes_at` |
| `order_decide` | plan_id, decision go/extend/cancel | order | organizer only; extend +72 h; go → members re-confirm |
| `order_mark_collected` | plan_id | ok | counts as participation |
| `circle_join` | circle_id | membership or request | open → member; request → needs answer |
| `circle_request_decide` | request_id, approve bool | ok | moderators; decline silent |
| `circle_create` | fields | circle_id | rate limit 3/day |
| `message_send` | conversation_id, body/media, client_id | message | blocked → `BLOCKED`; idempotent by client_id |
| `dm_request` / `dm_request_respond` | to_id, first_message / request_id, accept | — | decline silent |
| `block_user` / `unblock_user` | user_id | ok | hides content both ways, cancels pending requests |
| `report_create` | target_type, target_id, category, details, accuracy_confirmed, evidence[] | case_ref | triggers AI triage (async), urgent keywords page on-call |
| `appeal_create` | action_id, statement | appeal_id | one per action |
| `recipe_create` | fields | recipe_id | allergens or `allergens_confirmed=false` |
| `settings_update`, `consent_update`, `policy_accept` | … | ok | consent changes logged |
| `account_export_request`, `account_delete` | — | ok | delete: anonymise content, release RSVPs/claims, schedule purge |

## Staff (console, role `staff`)
`staff_queue(filters)` · `staff_case(report_id)` · `staff_view_messages(report_id, reason)` (logs to `audit_events`) · `staff_decide(report_id, action, reason, until?)` · `staff_appeal_decide(appeal_id, uphold bool, reason)` · `staff_host_verify(user_id, approve bool, reason)`.

## Edge functions
`ai-draft-plan` · `ai-translate` (v1.1) · `ai-recipe-card` (v1.1) · `ai-shopping-list` (v1.1) · `ai-triage-report` · `push-dispatch` (respects quiet hours, lock-screen setting) · `email-send` · `cron-reminders` (every 15 min) · `cron-waitlist-expiry` (every 5 min) · `cron-order-close` (every 15 min) · `media-scan`.

## Realtime channels
`conversation:{id}` (messages), `plan:{id}` (counts, check-ins for host), `user:{id}` (notifications).

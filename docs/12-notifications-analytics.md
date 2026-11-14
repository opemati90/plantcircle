# 12 — Notifications and analytics

## Notification catalog
Delivery: push (Expo) + in-app inbox (`notifications` table); email where noted. Respect quiet hours except **urgent safety** and **waitlist offers within 2 h** (still quiet-hours aware: send email; push at quiet end if offer still valid). Lock-screen text off by default → generic text (“New message”). Addresses never in push text.

| Type | Trigger | Channels | Copy (EN) |
| --- | --- | --- | --- |
| `rsvp_confirmed` | rsvp → going | in-app | “You’re going to {plan}.” |
| `reminder_day_before` | starts_at − 24 h | push, in-app | “Tomorrow {time} · {plan}. {todo?}” |
| `reminder_2h` | starts_at − 2 h | push | “{plan} starts at {time}.” |
| `address_unlocked` | reveal_at | push, in-app | “The address for {plan} is ready.” |
| `waitlist_offer` | rsvp → offered | push, email, in-app | “A spot opened at {plan} — confirm within 2 hours.” |
| `plan_changed` | plan → changed | push, email, in-app | “{plan} has a new time: {time}. Still going?” |
| `plan_cancelled` | plan → cancelled | push, email, in-app | “{plan} was cancelled. {host}: “{reason}”” |
| `plan_on_hold` | plan → on_hold | push, in-app | “{plan} is on hold. We’ll update you by {time}.” |
| `new_message` | message in joined convo | push (respect mute) | “{sender}: {text}” or “New message” |
| `message_request` | dm request | push, in-app | “{name} wants to message you.” |
| `circle_approved` | request approved | push, in-app | “You’re in {circle}.” |
| `order_closing` | closes_at − 24 h | push | “{order} closes tomorrow — {kg} to go.” |
| `order_decision` | organizer decision | push, in-app | “{order}: {decision}. Please re-confirm.” |
| `order_ready` | ready | push, in-app | “Pickup {window} · pay {organizer} {amount}.” |
| `report_update` | report status change | in-app | “Update on case {ref}.” |
| `moderation_notice` | action on user | in-app, email | statement of reasons |
| `habit_checkin` (v1.1) | 90 / 180 days after first check-in | in-app | “Quick question — 3 months in” |

## Analytics (PostHog, only with consent)
Event naming `object_action`, snake_case. Common props: `platform`, `app_version`, `locale`, `city_id` (no area), `signed_in`. **Never** send: diet, message text, addresses, emails, report details.

Core events: `onboarding_step_viewed`, `onboarding_completed`, `signup_started {trigger}`, `signup_completed {method}`, `plan_viewed {kind, source}`, `rsvp_joined {state}`, `rsvp_cancelled`, `waitlist_offer_responded {accepted}`, `web_rsvp_submitted`, `checkin_recorded` (server-side), `plan_create_started {kind}`, `ai_draft_requested`, `ai_draft_accepted {edited}`, `plan_published {kind, ai_drafted}`, `plan_shared {channel}`, `order_interest_set`, `order_completed` (server), `circle_joined {access}`, `message_sent {kind}`, `report_submitted {category}`, `block_created`, `notification_opened {type}`, `search_performed {has_results}`.

North Star (server-side, not client): weekly count of verified participations (`checked_in`, verified online attendance, `order_completed`).

Funnels to build: first visit → first Join → first check-in; host create start → publish → first guest checked in; shared link view → web RSVP → app install.

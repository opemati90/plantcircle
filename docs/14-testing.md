# 14 — Testing and Definition of Done

## Layers
- **Database:** pgTAP (or supabase test) for every RPC and every RLS policy, including negative cases (other user, anon, blocked, suspended).
- **Unit/component:** Jest + @testing-library/react-native; snapshot only for design-system components.
- **E2E:** Maestro flows in `/e2e` on iOS simulator + Android emulator; Playwright for web (`/p/[id]`, `/console`).
- **Accessibility:** per-story checklist (docs/09); axe on web.
- **Load:** k6 against `rsvp_join` (100 concurrent joins on a capacity-8 Plan → exactly 8 going).

## Must-pass matrix (v1)
| ID | Test | Expected |
| --- | --- | --- |
| T-01 | Double-tap Join / network retry | One RSVP, one notification |
| T-02 | Last spot race (2 users) | One going, one waitlisted |
| T-03 | Online Plan viewed from another time zone | Correct “your time” + host time; DST boundary correct |
| T-04 | Location never requested | No location permission prompt anywhere |
| T-05 | Invite-only Circle content as non-member | Not visible via UI or API |
| T-06 | Exact address before reveal_at / as non-guest | Not returned by API |
| T-07 | Block | No DMs, RSVPs to blocker’s Plans, invites, or visible content either way |
| T-08 | Host suspended before Plan | Plan on_hold, join disabled, guests notified |
| T-09 | Group order concurrent quantity edits | Totals consistent |
| T-10 | Publish without allergens | Blocked with message |
| T-11 | German locale, long strings, 200% text | No clipping or overlap |
| T-12 | VoiceOver/TalkBack: join a Plan end to end | Completable without sight |
| T-13 | Offline on Plan day | Time, address (if unlocked), bring item visible |
| T-14 | Delete account with upcoming RSVPs | RSVPs released, waitlist promoted, data purged per policy |
| T-15 | Staff opens messages | Requires reason; audit row written |
| T-16 | Web RSVP without 18+ box | Submit disabled; server rejects |
| T-17 | Waitlist offer expiry | Next person offered; expired user notified |
| T-18 | AI draft returns invalid JSON | Graceful fallback to manual form |

## Devices
Physical: one older iPhone (e.g. SE class), one current iPhone, one low-end Android (2–3 GB RAM), one mid Android. Test on slow 3G profile.

## Definition of Done (every story)
1. Acceptance criteria pass with automated tests (DB + component; E2E for flows).
2. Matches the prototype screen (layout, copy, hierarchy) within design-system components.
3. All standard states implemented: loading, empty, error, offline, signed-out, suspended where relevant.
4. Accessibility checklist passed (labels, roles, 44pt, 200% text, VoiceOver/TalkBack spot-check, contrast tokens only).
5. EN + DE strings via i18n keys (no hard-coded text).
6. Analytics events wired (consent-gated) and documented.
7. RLS policies tested for the data touched.
8. No PII in logs; Sentry clean.
9. Reviewed by a second person (or Claude review + human sign-off).

# 07 — State machines

Implement transitions only inside RPCs. Every transition writes an `audit_events` row when performed by staff or host on someone else.

## Plan
```
draft ──publish (allergens set)──▶ published ──time/place edit──▶ changed ──(48 h or all re-confirmed)──▶ published
  │                                   │  │                                    
  └─delete                            │  └─staff hold──▶ on_hold ──release──▶ published
                                      │                   └──cancel──▶ cancelled
                                      ├─host cancel──▶ cancelled (notify, release claims, refunds Later)
                                      └─end_time+2h or host “End Plan”──▶ completed
```

## RSVP
```
(none) ──join, spots left──▶ going ──host check-in──▶ checked_in
   │                          │  └─cancel──▶ cancelled ──▶ promote_waitlist()
   └─join, full──▶ waitlisted ──spot frees──▶ offered (expires in 2 h)
                                   ├─accept──▶ going
                                   ├─decline / expire──▶ waitlisted(end of line) or cancelled
                                   └─within 6 h of start: offer to all waitlisted at once, first to accept wins
completed Plan: going (not checked in) ──▶ no_show
```
- Offer window: 2 h (configurable). Notification by push + email.
- `promote_waitlist` runs in the same transaction as the cancel.
- Plan `changed`: going guests get `needs_reconfirm=true`; “Can’t make it” → cancelled (+ promotion).

## Group order
```
collecting ──closes_at, target met──▶ locked ──organizer orders──▶ ready (pickup) ──all collected or window end+24h──▶ completed
     │
     └─closes_at, target not met──▶ below_target ──go ahead──▶ locked (members re-confirm quantities)
                                         ├──extend──▶ extended (+72 h) ──▶ collecting rules again
                                         └──cancel──▶ cancelled
```
Members can change quantities only while `collecting`/`extended`. No money moves in the app.

## Circle membership
`none → member` (open) · `none → requested → member | declined (silent, re-request after 30 days)` · `member → left | removed`.

## Message request
`pending → accepted (creates direct conversation) | declined (silent)`; block at any point removes and prevents.

## Report and enforcement
```
open ──AI triage (suggestion only)──▶ triaged ──staff decision + reason──▶ actioned | dismissed
actioned ──user appeal──▶ appealed ──second reviewer──▶ closed (upheld | reversed)
```
- SLA: urgent 1 h (on-call page), high 24 h, routine 72 h.
- Suspension sets `profiles.status='suspended'`, `suspended_until`; the user sees the statement of reasons.

## Online class (v1.1)
`scheduled → lobby_open (start−15 min) → live → ended`; if host not live by start+15 min → `cancelled` (auto-refund Later).

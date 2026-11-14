# 08 — Flows (happy paths + edge cases)

Full illustrated version with flowcharts: the “PlantCircle — User Flows and UX Review” doc (Claude Docs). Summary for implementation:

1. **First visit:** Welcome → goals → city (or skip) → Home (no account) → Plan → Join → sign-up sheet (Apple/Google/email code) → privacy choices → back on Plan, going → after first RSVP: notifications prompt → Up next on Home.
2. **Join and attend:** Plan → Join (or waitlist if full → offer within 2 h → confirm) → claim a dish → address unlocks the day before → host checks in → feedback, connect, join Circle.
3. **Shared link (no app):** WhatsApp link → web page (name, email, 18+) → reserved + email → optional app download; full → waitlist by email.
4. **Host:** + → type → AI draft (optional) → 4 questions (publish locked until allergens) → published + share link → manage guests / check in → End Plan → feedback (v1.1: leftovers → recipe card).
5. **Group order:** organizer creates (supplier, items, close date, pickup) → shares → members set interest → target met? yes → order placed → pickup, pay organizer, “collected” ; no → go ahead / extend / cancel (members re-confirm).
6. **Circles:** open → join; approval → answer one question → moderator approves/declines (silent).
7. **Safety:** danger now? → call local emergency number first → report (reason → details + accuracy → case number, optional block) → staff decide with reasons → appeal.
8. **Online class (v1.1):** join → adapted list the day before → lobby (checklist) → live (external link in v1.1) → after (photo, rating, recipe saved). Host late → auto-cancel at +15 min. Connection lost → steps cached.
9. **Global edition (v1.1):** Explore “Cook with the world” → Global Plan → join a local table or host one → adapted list → cook + 15-min link-up.

## Edge cases that must be handled
- Two people take the last spot at once → one gets it, the other is waitlisted (row lock).
- Double tap / retry on any mutation → no duplicates (idempotency).
- Offline on Plan day → address, time, what to bring still visible.
- Host changes time → guests re-confirm; host cancels → spots and claims released, guests notified.
- Host suspended before event → Plan `on_hold`, RSVPs paused, address withheld, guests told when they’ll hear.
- User blocked → can’t RSVP to the blocker’s Plans, can’t message, content hidden both ways.
- Waitlist offer expires → next person; within 6 h of start → offer to all.
- Group order target missed → organizer decision; members re-confirm.
- Account deleted with upcoming RSVPs → released and waitlists promoted.
- City with no Plans → online Plans + start one; nothing is ever blank.
- Feature not available in a country (Later: paid) → plain message + what works.

# Remaining work — tracked list

Owner: Yemi. Every item below was requested in the conversation. Nothing is dropped
without an explicit owner decision recorded here. Status: `todo` · `doing` · `done` ·
`verified` (passed device or browser test, not just code review).

Working rules from the owner:
- Use the Codex skill (`/codex`) at every step: audit, implementation, guide.
- Match the design canvas pixel-for-pixel where possible; decluttered, well spaced, premium.
- Build the remaining features end to end (UI, data, authorisation, errors, tests).
- Online and in-person Plans must be clearly different. An online Plan is a host-entered
  Google Meet link that guests join; the link is revealed to confirmed guests shortly
  before the start. There is no in-app video in v1.
- All copy in all eight languages: English, German, Spanish, Portuguese, French,
  Polish, Italian, Dutch.
- Supabase project creation waits for the owner's account.

## A. Codex review findings (from 2026-11-12 review of uncommitted work)

| # | Sev | Item | Status |
|---|-----|------|--------|
| A1 | P1 | Outstanding offer stays confirmable after Plan is cancelled or on hold (`promote_waitlist` returns early; `waitlist_respond` sets going). Recheck Plan status and capacity before accepting. | done |
| A2 | P2 | Claim vs cancel race: lock the Plan before checking RSVP and claiming in `slot_claim`. | done |
| A3 | P2 | Confirm can redirect to Plan instead of My Plans (`onSettled` refetch ordering). Set outcome before invalidation, or suppress the competing redirect. | done |
| A4 | P2 | Android keyboard offset applied twice (`adjustResize` already resizes). Offset on iOS only; check Android separately. | done |
| A5 | P2 | RSVP mutations do not invalidate `explorePlans`. | done |
| A6 | P2 | Explore only searches the first 20 Plans. Raised to a bounded 100; server-side search still todo. | partly done |
| A7 | P2 | `checked_in` RSVPs dropped from My Plans and `toRsvpState`. Include and map them. | done |
| A8 | P2 | Idempotency replay ignores RPC name and arguments. Bind keys to a request fingerprint and reject mismatches. | done |
| A9 | P3 | Welcome copy calls people "plant material" in es, pt, it, nl. Rephrase as people who eat mostly plant-based. | done |
| A10 | P3 | fr.ts "reçoive l’adresse" wording. | done |

## B. Online vs in-person Plans (owner asked for clarity)

| # | Item | Status |
|---|------|--------|
| B1 | Add `format` to Plans: `in_person` or `online`, separate from `kind`. Online Plans carry no address. | done |
| B2 | Host enters a Google Meet (https) link on online Plans. Confirmed guests see it from 10 minutes before the start (table plan_meeting_links, time gate from starts_at). Host always sees it. Host entry UI waits for Plan creation (C4). | done (DB + read path) |
| B3 | Plan detail: online Plans show "Online" and the link only when released; in-person Plans show area and address. | done |
| B4 | Home, Explore and My Plans filters use format, not the kind filters, where that is clearer. Home chips stay as in the design for now; each card shows its format. | partly done |

| G1 | Owner decision: which city is shown on Home (home city), and how to browse other cities. Recommendation: Home city is saved and changed from the city chip; Explore browses other cities without saving; "Anywhere" shows every city plus online Plans. | todo |
| G2 | Build the city chip switch: sheet of cities from the backend, saves the profile city. Codex audit (4 findings: zero-row save, unawaited signed-out save, overlapping selections, unscrollable list) fixed. | done |
| G3 | Explore city browsing and "Anywhere" view, without changing the saved home city. Session-scoped choice; waits for the profile; retry on profile failure. Codex audit (4 rounds) fixed all findings. | done |
| G4 | Plan detail for draft Plans, host retrieval of the meeting link (needs Plan creation, C4). | todo |
| G8 | Waitlist order uses a database sequence instead of timestamps (found while fixing a flaky test: PGlite clock ties reordered the queue). | done |
| G5 | Pre-listed cities: a starter list in supabase/seed.sql (20 cities, 15 countries, placeholder chosen by the engineer), grouped by country in the picker with names from the catalogues. Codex audit fixed a crash risk and the missing names on Android. | done (list needs owner confirmation) |
| G6 | Choose country or global: Home and Explore offer "Anywhere" (every city and online Plans), and Explore offers each country ("All in Germany"). Codex audit (2 rounds) fixed city-list failure handling and the loading state. | done |
| G7 | Autocomplete in the city picker: type to filter cities and countries, case and accent-insensitive; search resets on each open; no-match message. Codex audit (3 rounds) fixed the name mismatch and the reset. | done |
| G9 | Arrow-key movement between city options on the web renderer. Deferred on purpose: the product is mobile-first and native uses Tab. Revisit with the web RSVP page (C16). | deferred (decision) |
| G10 | Onboarding city step grouped by country with the picker's grouping and names. Codex audit: sound. | done |
| G11 | Home + button overlaps the featured card's chip. Checked in D1 at 390×844: the button sits below the card, beside the 'Near you' heading, as in the design. | done |

## C. Missing v1 features (from docs/01-mvp-scope.md, v1 list)

Owner asked for Circles, Learn and People, end to end. The rest follow in backlog order.

| # | Feature | Status |
|---|---------|--------|
| C1 | Explore → Circles tab: list, search, join (open / request), Circle page, create Circle (3/day), moderator approvals. Search runs on the server (`search_text` column, escaped LIKE). Visitors are sent to sign-up first. Invite-only Circles are hidden from everyone (owner decision); accepting an invitation and leaving a Circle are not built yet. Codex audited twice; findings fixed (idempotency keys bound to inputs and decisions, errors inside the sheet, back and retry controls, declined requests no longer show as pending). DB 59, browser 42, unit 55 passing. | done (invite acceptance and leave: todo) |
| C2 | Explore → Learn tab: recipes list and recipe detail (servings scaling, allergens or "not confirmed"), create recipe. Recipes are shared into a Circle and read by its members (`recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_cards`, `recipe_create`). Allergens: 14 EU major allergens plus "none", which stands alone; a poster may skip them, and the recipe then shows "not confirmed". Decisions to confirm: v1 recipes are Circle-only (`visibility` defaults to circle; public browse is later); "Save" and "Start a Plan with this recipe" are not built (Save later, Start a Plan with C4). Codex audited twice; fixed: a placeholder list leaking across sign-in, a contradictory allergen answer, rounding to zero, the membership picker reading a capped list, a minutes limit, fixture replay. DB 69, browser 44, unit 62 passing. | done (Save and Start a Plan: todo) |
| C3 | Explore → People tab: members who chose to be visible and share an active Circle; connect. Visibility is off by default and set from a new Profile screen (switch, sign-out). Connecting is a request that becomes mutual when both sides connect (`connections`, `people_in_my_circles`, `person_connect` with a pair lock). Incoming requests show only while the sender is visible. Signed-out visitors are asked to sign in. Codex audited twice; fixed: connect through archived Circles, a stale visibility switch, connection rows after hiding, cached hidden people, the switch's size and roles, names on connect buttons, and fetching before sign-in. DB 82, browser 47, unit 62 passing. | done (requests inbox C8, blocking C10, notifications C14, full Profile C13: todo) |
| C4 | Plan creation: type (cooking night, potluck), name, when (14-day strip, start grid, length), where (in person with area and address, or online with a Meet link), how many (2–30), allergens (required, none exclusive), publish. One RPC creates and publishes in one transaction (drafts come with G4). Start times are in the city’s time zone; the address is revealed the day before unless the host releases it; the Published screen shares the link and offers Manage. Decisions I made: two kinds in v1 (the rest of the enum waits); the day strip shows 14 days instead of 7 plus “Other date”; no Circle destination yet; the link opens the web RSVP page, which is C16 and not built; allergens are stored as comma-joined keys because `plans.allergens` is text. Codex audited twice; fixed: DST day arithmetic, selected days drifting past midnight, stale start times at publish, meeting-link host and length, whitespace and character counting, share failures, fixture rules and host access. DB 94, browser 48, unit 72 passing. | done (drafts G4, AI draft S3-2, Circle destination, public web page C16: todo) |
| C5 | Hosting: manage guests, check-in, End Plan, feedback. Decisions I made: check-in opens 2 hours before the start and closes 2 hours after the end, for live Plans only; only the host checks guests in, with undo inside the window; End Plan works from the start on (going guests not checked in become no-shows, people waiting are cancelled); no removing guests in v1 (a guest cancels); feedback from checked-in guests once the Plan has ended (1–5 and an optional note up to 500 characters); the host sees counts and an average only from three ratings, so one guest's rating cannot be traced. Every host action on a guest, and each guest state End Plan changes, writes an audit row. Codex audited once; fixed: stable keys across retries, the audit per person, a feedback form overwritten by refetches, names on guest buttons, live status (on hold and cancelled Plans), signed-out feedback, clock refresh, and the three-rating rule. Known gap: the web arrow keys and Space on the rating radios (G9, deferred). DB 107, browser 49, unit 75 passing. | done (guest self-cancel and removal: v1 decision; server-side participation metric: later; web radio keys: G9) |
| C6 | Contributions: the host adds, changes and removes bring items while the Plan is live (not after it ends). Guests claim, and now withdraw their own claim until the Plan ends (`slot_unclaim`). A claimed item cannot be removed, and its quantity cannot drop below the claimed count. Text is trimmed the same way in the database and the app (`text_trim`). Retries replay before any check that could now fail. Decisions: host edits are not audited (they change the host's own list, not another person); the sample fixture items stay read-only. Codex audited twice; all findings fixed. DB 120, browser 52, unit 75 passing. | done |
| C7 | Group chats (done): a chat for each Plan (its host and people going, or who went) and each Circle (its members). Posting and reading, names with messages, a 1,000-character limit after trimming, 20 messages a minute per sender (serialised per sender), a client id so a retry never posts twice, chats close when a Plan is cancelled. The Plan, Manage and Circle screens open them; the chat refreshes every five seconds. Codex audited twice; all findings fixed. Not verified at runtime: concurrent sessions, and screen-reader announcements. DB 129, browser 52, unit 75 passing. | done (group chats) |
| C7a | Direct messages: a first-message request to someone who shares an active Circle (10 a day, serialised per sender), accept opens the chat with that message in it, decline is silent and the declined text is no longer readable by the decliner, reciprocal requests join one conversation. Mute (8 hours) and pin per person. Message button on People; requests screen. Codex audited once; all nine findings fixed. Not verified at runtime: concurrent sessions, screen readers. DB 139, browser 53, unit 75. | done |
| C8 | Inbox: All / Plans / Circles / Direct filters, the message-request banner, thread rows with the last message, unread dot and kind; chats a member has not opened yet still appear. Read markers move only up to the newest message shown, never back and never past now. Polled every 15 s; Realtime arrives with C14. Codex audited twice; all eight findings fixed. Not done: paging (the list is unpaginated; the unread count is recalculated per poll). DB 144, browser 54, unit 75. | done |
| C9 | Group orders: non-binding interest, below-target decision, pickup, completion. No payments. | todo |
| C10 | Safety: report and block everywhere, case receipt, suspension notice with appeal, staff console (web), audit log. | todo |
| C11 | Account: onboarding privacy choices, notification settings, data export request, two-step delete. | todo |
| C12 | Under-18 gate and policy versioning screens. | todo |
| C13 | Profile screen (identity, settings group, hosting group, about group). | todo |
| C14 | Notifications: push tokens, reminders, waitlist offers, in-app inbox rows, quiet hours. | todo |
| C15 | Offline cache for confirmed Plans (time, address once unlocked, what you're bringing). | todo |
| C16 | Web RSVP page for shared Plan links (no app needed). | todo |
| C17 | Start a Plan from Home (FAB) and the Create tab; Start a Plan route. | todo |

## D. Design fidelity

| # | Item | Status |
|---|------|--------|
| D1 | Side-by-side check against the design (390×844), verified in screenshots. Done: shared `ScreenHeader` (status-bar clearance, progress segments for flows); Circle page; Profile; recipe; Learn grid; People rows; chat; create wizard (progress bar, 32pt titles, 3-column time grid, segmented duration); Published (centred check, Plan card, link row with inline Copy, share tiles, floating bar with Manage); Manage ("n of total are here" during the window, tappable guest rows with a check ring); My Plans and Home matched already; the + button no longer overlaps the featured card (G11 closed). Placeholders to resolve: no cover photo column for Circles and recipes; Circle Plans tab shows the city's Plans (no circle_id on Plans); Explore's 'Cook with the world' and Filters are v1.1; 'Other date' picker in the wizard replaced by a 14-day strip; Published has no Circle share tile until Plans have a Circle. | done |
| D2 | Card radius: design uses 22; app uses the 20 token. Decide and record. | todo |
| D5 | Android active tab pill had square corners (radius 999 on a 52×30 view). Fixed with radius 15; verified on emulator. | done |
| D3 | Decluttering pass: remove duplicate status text, align spacing to the design's 18/20 rhythm. | todo |
| D4 | Verify all tabs on device (iOS and Android), not only the web renderer. | todo |

## E. Localization

| # | Item | Status |
|---|------|--------|
| E1 | Six new catalogues (es, pt, fr, pl, it, nl) with full key parity. | done |
| E2 | Native speaker review of all first-pass translations (de, es, pt, fr, pl, it, nl). | todo (owner) |
| E3 | Plural and ordinal rules verified on device for Polish and French. | todo |

## F. Verification and release

| # | Item | Status |
|---|------|--------|
| F1 | Offered-spot flow on iOS and Android device (Maestro). | verified (iOS); Android passed (29 steps) |
| F2 | My Plans flow on device. | verified (iOS) |
| F3 | Explore flow on device. | todo |
| F4 | Supabase staging project and migration applied; real RLS tests. | blocked (owner account) |
| F5 | Dev-only free-spot route and fixture hooks excluded from release builds. | todo (verify) |
| F6 | README and handover updated after each increment. | todo |

## Owner decisions still open

- G1: Home city saved, changed from the chip; Explore browses without saving; "Anywhere" shows every city plus online Plans. Built on that basis; you can change it.
- G5: which cities are pre-listed at launch (needed before G5 can be built).

- Hosts always see the Meet link (decided: yes, it is their own link).
- Once shown, the link can't be switched off; the host regenerates it to cut off everyone (decided).

- Google Meet links: host enters the link manually in v1 (no Google API). Confirm.
- Card radius 22 vs token 20 (D2).
- Whether "Confirm my spot" → My Plans stays (spec) — currently implemented.

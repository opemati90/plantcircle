# Prototype source (visual reference)

These are the HTML files behind the clickable prototype (Claude Design canvas: https://claude.ai/artifact/Wi5wegAfP1vQK9J1XTjecs — private to the founder unless shared).

**Use them for:** layout, spacing, hierarchy, copy, states and interactions. **Don’t** port the markup — rebuild with the design-system components in `docs/03`.

- Each `screens/*.dc.html` is one 390×844 phone screen (web dashboards are 1440×900). Inline styles show exact values; the `<script type="text/x-dc">` block at the bottom holds the screen’s interactive state (what changes when you tap).
- `{{name}}` holes are filled by that script; `<sc-if>` / `<sc-for>` are conditionals/loops of the prototype runtime (not needed in production).
- Links between files (`href="Plan.dc.html"`) are the navigation map.
- `canvas.json` lists every screen with its canvas page and title, plus the developer notes (teal stickies) under `notes`.

## Image ids
| `/_blob/` id in the HTML | File |
| --- | --- |
| b9fb496816ae3a83b0f692223b0e24c9 | images/hero.jpg (cooking together) |
| 8158e11caf9d4913049bf3946ebb5bbb | images/potluck.jpg |
| b999cc043f2f043fd5226cf1d032ce63 | images/jars.jpg (bulk grains) |
| e126b3a48441e5d6a48d6a3852b44c7a | images/cover.jpg (cook portrait) |

⚠️ These photos are **stand-ins cropped from an inspiration screenshot and are not licensed** — replace before any public use.

## Screens by canvas page

### Claude AI features
- `AIDraft.dc.html` — Plan assistant
- `AIRecap.dc.html` — Recipe card from notes
- `AITranslate.dc.html` — Translate posts

### Accessibility & compliance
- `AccessibilityStatement.dc.html` — Accessibility statement
- `CancelSub.dc.html` — Cancel Host Pro
- `HostTrader.dc.html` — Host status
- `PrivacyChoices.dc.html` — Privacy choices
- `ReportDetails.dc.html` — Report details
- `Suspended.dc.html` — Statement of reasons
- `TermsUpdate.dc.html` — Terms update

### Flows & edge cases
- `AfterEvent.dc.html` — After the event
- `CreateDetails.dc.html` — Details — validation
- `EmptyCity.dc.html` — No Plans in this city
- `ManageGuests.dc.html` — Manage & check in
- `MessageRequest.dc.html` — Message request
- `Offline.dc.html` — Offline
- `OrderPickup.dc.html` — Pickup & completion
- `OrderShort.dc.html` — Below target at cutoff
- `PlanCancelled.dc.html` — Cancelled by host
- `PlanChanged.dc.html` — Time changed
- `PlanFull.dc.html` — Plan full → waitlist
- `Published.dc.html` — Published + share
- `ReportDone.dc.html` — Report received
- `ReportSheet.dc.html` — Report
- `WaitlistOffer.dc.html` — Waitlist spot offered
- `WebRSVP.dc.html` — Web RSVP — no app needed
- `WebRSVPDone.dc.html` — Web RSVP confirmed

### Account & settings
- `AgeBlocked.dc.html` — Under 18
- `DeleteAccount.dc.html` — Account & data
- `NotifPermission.dc.html` — Notifications prompt
- `NotifSettings.dc.html` — Notifications
- `SignUp.dc.html` — Create account
- `VerifyEmail.dc.html` — Verify email

### Messages & recipes
- `ChatActions.dc.html` — Chat actions
- `ChatDM.dc.html` — Direct message
- `ChatPlan.dc.html` — Plan chat
- `RecipeCreate.dc.html` — New recipe
- `RecipeDetail.dc.html` — Recipe

### Monetization
- `Checkout.dc.html` — Checkout
- `HostPayouts.dc.html` — Earnings & payouts
- `HostPro.dc.html` — Host Pro
- `PaidPlan.dc.html` — Paid Plan
- `TicketConfirmed.dc.html` — Ticket

### App screens
- `Circle.dc.html` — Circle
- `Create.dc.html` — Start a Plan
- `Explore.dc.html` — Explore
- `GroupBuy.dc.html` — Group order (non-binding)
- `Home.dc.html` — Home
- `Inbox.dc.html` — Inbox
- `Main.dc.html` — Welcome & onboarding
- `MyPlans.dc.html` — My Plans
- `Plan.dc.html` — Plan detail & RSVP
- `Profile.dc.html` — Profile

### Search & Circles
- `CircleApprovals.dc.html` — Moderator approvals
- `CircleRequest.dc.html` — Request to join
- `CreateCircle.dc.html` — New Circle
- `Filters.dc.html` — Filters
- `SearchResults.dc.html` — Search results

### Web: staff & hosts
- `Console.dc.html` — Safety console — queue, hosts, appeals, audit
- `HostDashboard.dc.html` — Host dashboard — overview, Plans, earnings, settings

### Hosting & paid extras
- `CreateOrder.dc.html` — New group order
- `HostSuspendedEvent.dc.html` — Plan on hold
- `OnlinePlan.dc.html` — Online Plan
- `PaidCancelled.dc.html` — Paid Plan cancelled

### Environmental impact
- `HabitCheckin.dc.html` — 3-month habit check-in
- `ImpactDashboard.dc.html` — Your impact
- `ImpactExplain.dc.html` — How we estimate
- `Leftovers.dc.html` — Leftovers after a Plan

### Deutsch (DE)
- `HomeDE.dc.html` — Start
- `PlanDE.dc.html` — Plan-Details
- `WelcomeDE.dc.html` — Willkommen

### Loading & errors
- `HomeLoading.dc.html` — Loading skeleton
- `NoResults.dc.html` — No search results
- `RSVPError.dc.html` — RSVP failed
- `ServerError.dc.html` — Server error

### Global layer
- `AdoptTable.dc.html` — A local host adopts it
- `CookAlongList.dc.html` — Shopping list adapted by AI
- `ExploreGlobal.dc.html` — Explore outside a chapter
- `GlobalCreate.dc.html` — Choose the format
- `GlobalPlan.dc.html` — Global Plan — guest view
- `LinkUp.dc.html` — Live link-up
- `OnlineAfter.dc.html` — After the class
- `OnlineEnded.dc.html` — Joined after it ended
- `OnlineHostLate.dc.html` — Host hasn’t started
- `OnlineLive.dc.html` — Live class
- `OnlineLobby.dc.html` — Lobby — get your kitchen ready
- `OnlineReconnect.dc.html` — Connection lost

### Host program
- `DemandNudge.dc.html` — Demand nudge
- `HostLevels.dc.html` — Host level
- `MembershipSetup.dc.html` — Supper club membership
- `ProUpgrade.dc.html` — Pro pays for itself
- `SeedsWallet.dc.html` — Seeds wallet

### Stores
- `AddShop.dc.html` — Add a shop
- `StoreDashboard.dc.html` — Store dashboard — demand, orders, Partner
- `StoreProfile.dc.html` — Store profile

## Developer notes from the canvas

- Flow: Welcome → interests → city → Create account → (email code) → notifications prompt → Home.  Account after value: people see what’s nearby before they’re asked to sign up.  Apple / Google / email code — no passwords. Store policy version + timestamp on acceptance (FR-01). 18+ is self-declared; the under-18 screen stores nothing.  Only ask for push permission with a clear reason, after sign-up; if declined, critical updates still land in the Inbox (NFR-13).
- Notifications: changes/cancellations can’t be turned off. Quiet hours default 22:00–08:00. Lock-screen previews off by default; addresses never shown on the lock screen (AC-29).  Data export + deletion inside the app (AC-04, T-14); deletion releases spots and claims; legal-hold records kept per retention schedule.  Suspension: read-only, reason + end date + case reference, appeal path (AC-39).
- Three host-side features using the Claude API, all draft-then-confirm — nothing publishes without a human.  1 Plan assistant: one sentence → title, description, time, spots, “what to bring” slots. Never fills allergens. 2 Translation (DE↔EN and more): labelled as AI, original one tap away. Allergen and safety lines are shown in the original, never machine-translated. 3 Recap: host notes → recipe card for guests.  Also build (staff console, no screen): report triage — Claude suggests a severity and category so urgent cases reach the top; a person always decides.  Cost control: free hosts get 3 drafts a month; Host Pro is unlimited. Cache translations per post.
- Privacy choices after sign-up: only necessary processing on by default; “Only needed” and “Save choices” carry equal weight (GDPR Art. 7, TDDDG §25). Diet preference asks for separate explicit consent when set — it can reveal beliefs (GDPR Art. 9).  Terms changes: summary of what changed, effective date, versioned acceptance stored with timestamp (DSA Art. 14).  Accessibility statement: required for consumer e-commerce under the BFSG (German EAA law) once tickets are sold; lists known gaps and a feedback route.
- Reports collect an explanation, evidence and a good-faith confirmation (DSA Art. 16). Suspensions state what, which rule, how it was decided (human, AI only sorted) and how to challenge it (Art. 17, 20, 21).  Hosts declare private or business status; guests see it at checkout because consumer rights depend on it. Ticket sellers’ tax IDs are collected for platform tax reporting (DAC7 / PStTG).  Subscriptions: a two-step cancel, no retention tricks, end date shown (BGB §312k). Checkout button names the payment (“Buy ticket … €19,44”; DE: “Zahlungspflichtig buchen”, BGB §312j).
- Plan chats: only confirmed guests + host; host can pin one message. New guests see permitted history (FR-07).  DMs only after a request is accepted (FR-09). Text + compressed images, no calls in MVP.  Every thread: mute, block, report. Removed or blocked members lose access on next token refresh (AC-23).
- FR-08 P0. Author, cuisine attribution, allergens. If allergens skipped → “Allergens not confirmed”, never “safe” (AC-25).  Photo upload requires ownership/permission; media is scanned and compressed (NFR-14). Every post shows report + author (AC-26). Metric/US units switchable.
- Informal “du”, like most German community apps. German runs about 20–30% longer than English — the layouts hold, but tab labels are shortened (“Pläne”, not “Meine Pläne”).  Dates as “Sa, 8. Nov.”, 24-hour times, prices as “€18” or “18 €” (pick one style), decimal comma.  Have a native speaker review all copy, and a lawyer review legal text (terms, refunds, Impressum).
- Search covers Circles, public Plans and recipes (FR-05). Distance uses the chosen city area, not GPS, unless the member opts in (AC-14).  Private/invite-only content never appears in results (AC-15). No ranking on sensitive traits; sponsored items labelled if ever added.
- Approval-only Circles hide posts, members and Plan addresses until approved (AC-07). Optional join question set by moderators.  Declines are silent; re-request after 30 days. Removed moderators lose powers immediately (AC-09). Rate-limit Circle creation to stop spam.
- THE GROWTH LOOP. Every Plan has a public link (plantcircle.app/p/{id}) that hosts paste into WhatsApp. Guests RSVP in the browser with name + email + 18+ confirmation — no install.  Rules: same capacity/waitlist engine as the app (AC-17/19). Address never shown on the web page; emailed to confirmed guests at reveal time (AC-13). Web guests can claim their account later by email; RSVP carries over.  Only Plans the host marks as link-shareable get a public page; private Circle Plans never do (AC-15).
- Waitlist: FIFO. On cancellation the first person gets an offer with a 2-hour expiry (state: offered → confirmed | expired), then the next person (AC-18). Inside 6 hours of start, offer goes to everyone on the list at once — first to confirm wins.  Material changes (time, place, cancellation) notify every confirmed guest and ask them to re-confirm (AC-11). Times stored in UTC + IANA zone.  Cancelled Plans leave discovery, release claims, keep audit history (AC-12).
- Publish is blocked until required fields are set: time + zone, capacity, visibility and, for food Plans, allergens or an explicit “None” (AC-10, T-10).  Check-in: host marks guests from the list; window closes 2h after end, later edits need staff review (AC-35). Check-in is what counts as a Meaningful Community Participation — an RSVP alone never does (AC-34).  After the event: feedback, consent-based connection requests, and a path into the Circle. No attendee contact export (AC-36).
- SHIP BLOCKER (FR-12). Report from any profile, Plan, post, message or group order. Categories as in the PRD; urgent-danger box points to 110/112.  Every report gets a case ID and receipt; reporter stays anonymous (AC-37). Blocking works everywhere at once (AC-38).  DMs need acceptance first; decline is silent. Blocked users get no pushes (AC-27).
- Never show an empty screen: a city with no Plans shows online Plans plus “Start a Plan” and “Request a chapter” (chapter requests are counted to choose the next launch city).  Offline: confirmed Plans cache time, address (once unlocked), what you’re bringing and allergens (NFR-04, US-015). RSVP changes need a connection and retry idempotently (T-01).
- States: collecting_interest → threshold_reached | below_target → locked → coordinating_pickup → completed (or cancelled / disputed).  Interest is non-binding. If quantities change after cutoff, everyone re-confirms before the organizer orders. Money changes hands outside the app; the no-protection notice is shown on every payment-related screen (AC-32).  “I’ve collected it” marks completion and counts as a participation.
- Group order form: explicit unit + currency per item, no mixed totals (AC-31). Organizer must tick the payment disclaimer (AC-32).  Online Plans: external meeting link shown only after RSVP; times shown in the guest’s zone with the host’s zone alongside (5.3, T-03).
- Host suspended before an event: new RSVPs blocked, address withheld, guests told when they’ll hear more (T-08).  Host cancels a paid Plan: automatic full refund including the service fee, shown with method and timing. Repeated host cancellations count against host standing.
- Each food Plan shows one line: estimated footprint vs a meat-based version, tap for the method. Ingredients are matched to a published food-emissions database; Claude proposes matches, staff confirm new ones.  Claims rules (EU rules on environmental claims, from autumn 2026): always say “estimate”, compare against a stated baseline, link the method, never “climate neutral”.  Dashboard numbers here are sample data; Berlin totals stay [N] until real.
- Group orders show origin and packaging avoided, computed from the order itself (100 kg in 4 sacks vs ~200 × 500 g packs).  After “End Plan”, hosts log leftovers: taken home, shared via Foodsharing.de, or none — feeds the food-saved metric.  Anonymous habit check-ins at 3 and 6 months measure behaviour change; opt-in, aggregated only, never tied to diet identity in analytics (GDPR Art. 9).
- Revenue 1 — ticket service fee. Hosts set a price; guests pay an 8% service fee on top; host keeps the full price.  In-person classes are a physical service, so card/Apple Pay/SEPA/PayPal via a marketplace payment provider (e.g. Stripe Connect) rather than in-app purchase — confirm with Apple/Google review before launch. Paid ONLINE classes are different: app stores generally require in-app purchase for those, so keep them free at first or sell on the web.  The payment provider holds and pays out funds and verifies hosts — PlantCircle never holds money. Cancellation terms shown before paying; host cancellation = full refund.
- Revenue 2 — Host Pro, €9,99/month. Sells to serious organisers, never to members: unlimited AI, recurring Plans, co-hosts, insights. Free stays generous: RSVPs, waitlists, chat, free Plans, group orders.  Founding Hosts (first Berlin hosts) get 6 months free — that’s your host-recruitment offer.  A digital subscription bought inside the app normally goes through Apple/Google billing (they take a cut); offering it on the web as well is worth checking.  Later: labelled partner profiles for venues and brands. Never sell member data or put belonging behind a paywall.
- Working prototype — click through in Play mode:  Queue → filter by severity → open a case → read Claude’s suggestion → choose an action → Apply (disabled until chosen). The case is marked decided and the action lands in the Audit log.  Hosts to verify → Verify or Decline (both logged).  Appeals → reviewed by someone other than the original decider → Uphold or Reverse; the member is told and reminded of out-of-court options (DSA Art. 20–21).  Audit log → every action and every view of private messages, with reasons. SSO + MFA; Claude only suggests (AI Act, GDPR Art. 22).
- Working prototype — click through in Play mode:  Dashboard → KPIs, Coming up, To-do items and a demand prompt (“23 people on waitlists → Add a date”), each opening the right place.  Plans → Upcoming / Drafts / Past → open a Plan → Guests (check in with one click), Waitlist, What to bring.  New Plan → form with live preview; Publish stays disabled until allergens are chosen.  Earnings → next payout, Pro savings, payouts, host status and yearly statement (DAC7).  Settings → Host Pro with a visible “Cancel subscription here” button (BGB §312k), host page link, co-hosts.  Numbers are sample data.
- Loading: skeletons that match the real layout; no spinners on full screens. Shimmer stops when the phone asks for reduced motion.  Failed actions: say what didn’t happen (“your spot isn’t held”) and offer Retry. Retries reuse the same idempotency key, so a double tap never double-books (NFR-05, T-01).  No results: always offer a next step — host it, or get notified.  Server errors: point to what still works offline, show a reference ID for support.
- Every Plan is one of three formats: in person (one table, one city), online live (everyone cooks at home on video) or global edition.  Global edition: a host anywhere publishes the recipe, shopping list and a live intro. Hosts in other cities adopt it as their own in-person table that weekend. Guests join a local table; one 15-minute live link-up connects all tables.  This is how a cook in Lagos or Kraków reaches Berlin — and how new cities get their first Plans before a chapter exists.
- Claude adapts each guest’s shopping list to their country: local names, metric/US units and substitutes (scotch bonnet → habanero). Labelled as AI; original one tap away; allergens never changed by AI.  Link-up: host spotlight, every table as a tile, captions on by default (WCAG 1.2.4), large controls. Use an embedded video provider; record only with consent.  Members outside any chapter see global editions and live cook-alongs first, plus “Host the first table” — so nobody lands on an empty app. Travel mode shows Plans in a city before you arrive.
- Lobby opens 15 min before: a mise-en-place checklist from the adapted shopping list, camera off by default, captions on.  Live: host video, a step card guests can move through at their own pace (“Host is on step 3”), captions, mic/camera/raise-hand. Steps are cached on the phone.  After: photo of your plate, a rating, the recipe saved, an optional tip to the host (host keeps it all), and the next class. Verified attendance counts as a participation.
- Host late: guests are told immediately and auto-join when the host goes live. 15 minutes past start → automatic cancellation and full refund for paid classes.  Connection lost: the step card stays usable offline; offer audio-only and auto-retry.  Too late: the recipe and shopping list stay available. Classes aren’t recorded by default, to protect guests’ privacy — a host can only record with every guest’s consent.
- Levels count checked-in guests only, never RSVPs — so they can’t be farmed. Each level unlocks something real: verified badge, lower guest fee, partner kitchens.  Seeds are earned for verified outcomes (guests checked in, first-timers who come back, complete Plans) and spent only inside PlantCircle: Host Pro months, half-fee workshops, partner perks. No cash-out — that keeps them clear of e-money rules and cheap to give. Earn and spend values are proposals to tune in beta.
- Pro pitch = maths, not features: guests pay 4% instead of 8%, so Pro pays for itself from €250 a month in ticket sales. The stepper shows the host their own number.  Memberships turn one-off dinners into monthly income (Host Pro feature, payments via the payment partner, members cancel any time).  Demand nudge: when waitlists build up, the host is shown how many people are waiting and offered dates; waitlisted guests hear first.
- Global by default: the directory works in any city from day one.  1 Seeded from OpenStreetMap shops tagged vegan/vegetarian (attribution + share-alike under ODbL). 2 Members add shops anywhere; checked before going public. 3 Shops claim their listing, add bulk prices, and may become Partners. 4 “Ships to you” suppliers appear for anyone in their delivery area.  Supplier picker groups: Near you · Ships to you · Add a shop. Partner placements are always labelled and shown in context — never targeted on diet (sensitive data, DSA Art. 26).
- Why stores come without a sales team: they see demand near them — aggregated and anonymous, shown only when 5+ people ask — and the group orders that picked them.  Free listing forever. Partner (monthly, price to set) adds first place in the supplier picker, Circle offers and full insights, with a visible cancel button.  Later: stores accept group orders and payments in the app, with a fee on completed orders, rolled out country by country.
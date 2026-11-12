# 04 — Screens: routes, data, states, actions

Prototype file names in `prototype-source/` are given in brackets. Phase from `01-mvp-scope.md`.

## Standard states (apply to every screen unless overridden)

| State | Rule |
| --- | --- |
| Loading | Skeleton matching the final layout (no full-screen spinners). `aria-busy`. Shimmer off with Reduce Motion. [HomeLoading] |
| Empty | EmptyState with an anchor icon, one sentence and at least one next step. Never a blank screen. [EmptyCity, NoResults] |
| Error (action) | Toast `role=alert`: what didn’t happen + Retry. Retry reuses the same idempotency key. [RSVPError] |
| Error (screen) | “Something went wrong on our side”, link to My Plans (works offline), request ID. [ServerError] |
| Offline | Black banner “You’re offline · saved at HH:MM”; cached data readable; mutating buttons disabled with reason. [Offline] |
| Signed out | Read public content; first commitment opens the sign-up sheet and resumes the action. [Plan] |
| Suspended | Read-only; posting/RSVP/messages disabled with a link to the notice. [Suspended] |
| Gated by country/law | Plain message + alternative; never hide silently or block the person. |

## Route map (expo-router)

```
app/
  (onboarding)/welcome.tsx  goals.tsx  city.tsx
  (auth)/sign-up.tsx (sheet)  verify.tsx  privacy.tsx  notifications.tsx  under-18.tsx
  (tabs)/_layout.tsx  home.tsx  explore.tsx  my-plans.tsx  inbox.tsx  profile.tsx
  plan/[id]/index.tsx  waitlist-offer.tsx  manage.tsx  after.tsx  chat.tsx
  create/index.tsx  draft.tsx  details.tsx  published/[id].tsx  order.tsx
  order/[id]/index.tsx  decide.tsx  pickup.tsx
  circle/[id]/index.tsx  request.tsx  approvals.tsx   circle/new.tsx
  search/index.tsx  filters.tsx (sheet)
  recipe/[id].tsx  recipe/new.tsx
  chat/[id]/index.tsx  actions.tsx (sheet)   requests/[id].tsx
  report/index.tsx (sheet)  details.tsx  done.tsx
  settings/notifications.tsx  account.tsx  privacy.tsx  accessibility.tsx   legal/terms.tsx
  suspended.tsx
web (Next.js): /p/[id]  /p/[id]/done  /console/*  (Later: /host/*, /store/*)
```

Deep links: `plantcircle://plan/{id}`, universal links `https://plantcircle.app/p/{id}` (opens app if installed, else web RSVP).

---

## Onboarding and account (v1)

### Welcome · goals · city [Main] — `(onboarding)/*`
- **Data:** none (local). City list from `cities` (search by name, any country).
- **Steps:** Welcome (photo hero, “Get started”, “I already have an account” → sign-up) → What brings you here (multi-select, ≥0) → Where are you based (city picker; “Skip for now” → Explore with online Plans).
- **Result:** saves `onboarding_goals`, `city_id` locally; after sign-up, persisted to profile. Lands on Home **without** an account.
- **Analytics:** `onboarding_step_viewed`, `onboarding_completed {goals_count, city_set}`.

### Sign-up sheet / Create account [SignUp] — `(auth)/sign-up`
- Apple, Google, email (one field + arrow). Legal line with Terms, Privacy, “Under 18?”.
- **Result:** creates session → `privacy` (first time) → resumes pending action (e.g. Join).
- **States:** provider error toast; email invalid inline error.

### Verify email [VerifyEmail] — `(auth)/verify`
- 6-digit code, autofill (`textContentType=oneTimeCode`), paste whole code, resend after 60 s, code valid 10 min, “Open mail app”.
- **Errors:** wrong code (inline, keep digits), expired (offer resend), too many attempts (wait message).

### Under 18 [AgeBlocked] — `(auth)/under-18`
Stores nothing. “Browse public recipes” and “Got it”.

### Privacy choices [PrivacyChoices] — `(auth)/privacy`, also `settings/privacy`
- Rows: Needed (always on), Help improve (analytics, default **off**), Personal suggestions (default **off**). Buttons “Only needed” and “Save choices” have equal weight.
- **Writes:** `user_settings.analytics_consent`, `personalisation_consent` + `consent_events`.

### Notifications prompt [NotifPermission] — `(auth)/notifications`
- Shown **after the first RSVP**, not at sign-up. Photo + two sample notifications. “Turn on” → OS prompt; “Not now” → don’t ask again for 14 days.

### Notification settings [NotifSettings] — `settings/notifications`
Switch rows (Plans: reminders, waitlist offers, changes = always on; People: DMs, chats; Privacy: quiet hours 22–08, lock-screen message text default off). Writes `user_settings`.

### Account and data [DeleteAccount] — `settings/account`
Download a copy (request → email within 48 h). Delete: explains removed/released/kept → confirm sheet “Delete for good?” → signs out → Welcome.

### Terms update [TermsUpdate] — `legal/terms` (also blocking modal when a new version is required)
Summary of changes + effective date. “Accept and continue” writes `policy_acceptances`; “I don’t agree — close my account” → account screen.

### Accessibility statement [AccessibilityStatement] — `settings/accessibility`
Static content from CMS/markdown; “Report a problem” → report flow with category `accessibility`.

### Suspended [Suspended] — `suspended`
Statement of reasons (what, which rule, how decided, what you can still do), “Appeal this decision” (creates `appeals` row), other ways to challenge.

---

## Tabs (v1)

### Home [Home] — `(tabs)/home`
- **Data:** `home_feed(city_id)` RPC → `{ up_next?, featured_plan, near_you[], invitations_count }`.
- **Sections:** city chip (changes city), bell (invitations), avatar → Profile; “Up next” card (next joined Plan + to-do in amber) when present; title “This week in {city}”; filter chips (For you · Cooking · Social · Online); featured PosterCard; “Near you” carousel.
- **States:** signed out (no Up next); empty city → EmptyCity; loading → HomeLoading.
- **Actions:** card → Plan; FAB + → Create (signed out → sign-up sheet first).

### Explore [Explore] — `(tabs)/explore`
- Search field (→ search), Filters button, segmented: Circles · Plans · Learn · People (· Shops in v1.1).
- **People** only lists members with `profile_visibility='circles'` who share a Circle.

### My Plans [MyPlans] — `(tabs)/my-plans`
Segmented Going · Hosting · Past. Cards: DateTile + title + meta + status chips (Going / Waitlist · n / Interested · x kg / to-dos). “Saved for offline”. Hosting empty state → Create.

### Inbox [Inbox] — `(tabs)/inbox`
Filters All · Plans · Circles · Direct; message-request card on top when pending; threads with unread dots (Realtime).

### Profile [Profile] — `(tabs)/profile`
Identity card (name, handle, area, counts), Your impact card (v1.1), Settings group, Hosting group (Later items hidden), About group.

---

## Plans (v1)

### Plan detail [Plan] — `plan/[id]`
- **Data:** `get_plan(id)` → plan, host, counts, my_rsvp, contributions, address (only if allowed), footprint (v1.1).
- **Facts:** DateTile (date, time, “Add to calendar”), MapTile (area + transit; exact address after join/at `reveal_at`), AvatarStack + CapacityBar, host row with Message.
- **Sections:** About · Bring something (claim slot) · Good to know (allergens, cancellation).
- **Bar:** price/state + Join → states: `Join` / `You’re going` / `Join waitlist` (full) / disabled with reason (suspended, past, on hold).
- **Signed out:** Join opens sign-up sheet; on success RSVP is created and the bar shows “You’re going”.
- **Variants:** PlanFull, PlanChanged (amber TIME CHANGED + re-confirm), PlanCancelled (greyscale, host message, released), HostSuspendedEvent (ON HOLD), Offline, RSVPError.

### Waitlist offer [WaitlistOffer] — `plan/[id]/waitlist-offer`
Countdown ring (time left), event card, “Confirm my spot” → My Plans; “No thanks, pass it on”. Expired → message + “Back to waitlist”.

### Web RSVP [WebRSVP, WebRSVPDone] — web `/p/[id]`
Invite header, date/spots facts, first name, email, 18+ checkbox (required to enable submit). Creates guest RSVP + magic link email. Done page: app store buttons, cancel link. Full → join waitlist by email.

---

## Hosting (v1)

### Start a Plan [Create] — `create`
Type tiles: Cooking night, Potluck, Group order, Online class (+ More types: meetup, food swap, volunteering). Next: AI draft (or order form for Group order).

### AI draft [AIDraft] — `create/draft`
Describe (textarea + “what we picked up” chips: When/Where/How many/What to bring) or idea cards → “Draft it for me” → draft preview (poster + facts + allergens reminder) → “Looks good” → details. “Fill it in myself” always available. See `11-ai-features.md`.

### Details [CreateDetails] — `create/details`
4 steps: When (date strip next 7 days + Other date; start-time grid; duration segmented; live summary) · Where (area + keep address private switch) · How many (stepper; waitlist note) · Allergens (multi-select; “None” exclusive). **Publish disabled until ≥1 allergen choice.**

### Published [Published] — `create/published/[id]`
Big check, event card, link + Copy, share tiles (WhatsApp, Instagram, Circle, More), “Manage”.

### Manage guests [ManageGuests] — `plan/[id]/manage`
“{n} of {m} are here”, tap name to check in (toggle, audited), waitlist count, “End Plan” → After/Leftovers. Check-in allowed from start−60 min to end+120 min.

### After the event [AfterEvent] — `plan/[id]/after`
Stars (1–5) + tags, connect requests (consent-based), Circle card, Send.

---

## Group orders (v1)

### Create order [CreateOrder] — `create/order`
4 steps: Where from (v1: name + area; v1.1: grouped picker) · Items and targets (steppers, running total) · Interest closes (day tiles) + pickup · Review (pay-at-pickup notice) → Share to Circle.

### Group order [GroupBuy] — `order/[id]`
Big “x of y kg” + bar, item steppers, non-binding notice, “I’m interested” → “You’re in ✓”.

### Below target [OrderShort] — `order/[id]/decide` (organizer)
Radio cards: go ahead (members re-confirm) · extend 3 days · cancel. Confirm → notify members.

### Pickup [OrderPickup] — `order/[id]/pickup`
Window, address, my amounts, “Pay organizer €x at pickup” + notice; “I’ve collected it” (counts as participation); “Report a problem”.

---

## Circles (v1)
[Circle] `circle/[id]` (poster, Join, tabs Plans/Posts/About) · [CircleRequest] `circle/[id]/request` (private facts, join question with counter) · [CircleApprovals] `circle/[id]/approvals` (cards with member age + Plans attended; Approve/Decline; declines silent) · [CreateCircle] `circle/new` (cover, name, one line, who can join radio cards).

## Search (v1)
[SearchResults] `search` (active filters as chips; Plans with DateTiles; recipes grid) · [Filters] sheet (When, Where, Price segmented; languages multi; Reset; Show results) · [NoResults] (host it / notify me / try instead).

## Messaging (v1)
[ChatPlan] `plan/[id]/chat` (pinned host message, day separators, images, system lines like “Lena claimed: a side dish”) · [ChatDM] `chat/[id]` · [ChatActions] sheet (view profile, mute 8 h, block, report) · [MessageRequest] `requests/[id]` (shared context chips; Accept / Decline silently / Block and report).

## Recipes (v1)
[RecipeDetail] `recipe/[id]` (poster, chips, servings stepper rescales quantities, method, allergens note, Save, “Start a Plan with this recipe”) · [RecipeCreate] `recipe/new` (photos with permission, title, ingredients list, allergen chips, destination Circle).

## Safety (v1)
[ReportSheet] sheet (emergency line 112/110 or local equivalent from `cities.country_code`; reasons radio) → [ReportDetails] (what happened, screenshots, accuracy checkbox enables Send) → [ReportDone] (case number, anonymity, block switch). Staff: [Console] web.

---

## v1.1 screens (summary)
Online class: [OnlineLobby] checklist from adapted list, camera off by default, captions on · [OnlineAfter] photo, rating, recipe saved · [OnlineHostLate] auto-join, auto-cancel at +15 min · [OnlineReconnect] steps cached, audio-only · [OnlineEnded] recipe and list available.
Global editions: [GlobalCreate] format radio · [GlobalPlan] recipe host, link-up time in viewer TZ + host TZ, local tables · [AdoptTable] day/time/spots · [CookAlongList] AI-adapted shopping list, checkable · [ExploreGlobal] outside-a-chapter discovery.
AI/impact: [AITranslate] banner “Translated by AI · See original” · [AIRecap] recipe card from notes; send only after allergens confirmed · [Leftovers] · [ImpactExplain] · [ImpactDashboard] You/Everyone · [HabitCheckin].
Shops: Explore Shops tab · [StoreProfile] · [AddShop] · grouped supplier picker in CreateOrder.

## Later screens (summary)
[PaidPlan] [Checkout] [TicketConfirmed] [PaidCancelled] [HostPayouts] [HostTrader] [HostPro] [ProUpgrade] [CancelSub] [MembershipSetup] [HostDashboard] [HostLevels] [SeedsWallet] [DemandNudge] [StoreDashboard] [OnlineLive] [LinkUp]. Specs in the prototype; build only after commercial/legal approval.

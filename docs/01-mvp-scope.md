# 01 — MVP scope

Three phases. Build **v1** first; v1.1 starts once the pilot shows repeat participation; **Later** needs commercial/legal approval (payments, subscriptions) or heavier infrastructure (in-app video).

## v1 — launch (the core loop, safe and global)

- Accounts: browse without an account; sign up (Apple, Google, email code) at the first Join; 18+ gate; privacy choices; notifications in context; settings; data export and deletion.
- Discovery: Home (Up next, featured Plan, near you), Explore (Circles, Plans, Learn, People), search, filters, empty and error states.
- Plans: in-person and online (external link), RSVP, waitlist with 2-hour offers, changes/cancellation, offline details, web RSVP from a shared link (no app).
- Hosting: create (AI draft optional, one question per screen), publish and share, manage guests, check-in, after-event feedback.
- Circles: open / by request / invite-only, moderation approvals, create.
- Messaging: Plan chats, Circle chats, DMs with message requests.
- Group orders: non-binding interest, below-target decision, pickup and completion. **No payments.**
- Recipes: read and post (allergens or “not confirmed”).
- Safety: report, block, case receipt, suspension notice with appeal; staff console (web).
- Languages: English + German. Locales are data, not code paths.

## v1.1 — after the pilot gate

Online class journey (lobby, after, host late, reconnect, ended) · global editions (create, adopt a table, AI-adapted shopping list, one external link-up) · AI translation and recipe card · leftovers, footprint estimate, impact dashboard, habit check-in · shop directory (OpenStreetMap seed, add a shop, store profile, Shops tab, grouped supplier picker).

## Later — needs payments, legal sign-off or heavy infrastructure

Paid workshops (checkout, tickets, refunds, payouts, host status/tax ID) · Host Pro and subscription cancel · memberships · host dashboard (web) · host levels and Seeds · demand nudges · store owner dashboard and Partner tier · in-app live video (class and multi-table link-up).

## Screen inventory

Every artboard in the prototype, with its phase. Screen names match files in `prototype-source/`.

### v1 (60 screens)

| Canvas page | Screen file | Title | Notes |
| --- | --- | --- | --- |
| Accessibility & compliance | `AccessibilityStatement.dc.html` | Accessibility statement |  |
| Accessibility & compliance | `PrivacyChoices.dc.html` | Privacy choices |  |
| Accessibility & compliance | `ReportDetails.dc.html` | Report details |  |
| Accessibility & compliance | `Suspended.dc.html` | Statement of reasons |  |
| Accessibility & compliance | `TermsUpdate.dc.html` | Terms update |  |
| Account & settings | `AgeBlocked.dc.html` | Under 18 |  |
| Account & settings | `DeleteAccount.dc.html` | Account & data |  |
| Account & settings | `NotifPermission.dc.html` | Notifications prompt |  |
| Account & settings | `NotifSettings.dc.html` | Notifications |  |
| Account & settings | `SignUp.dc.html` | Create account |  |
| Account & settings | `VerifyEmail.dc.html` | Verify email |  |
| App screens | `Circle.dc.html` | Circle |  |
| App screens | `Create.dc.html` | Start a Plan |  |
| App screens | `Explore.dc.html` | Explore | v1: Circles, Plans, Learn, People tabs. Shops tab and “Cook with the world” card arrive in v1.1. |
| App screens | `GroupBuy.dc.html` | Group order (non-binding) | v1. Packaging/origin impact line arrives v1.1. |
| App screens | `Home.dc.html` | Home |  |
| App screens | `Inbox.dc.html` | Inbox |  |
| App screens | `Main.dc.html` | Welcome & onboarding |  |
| App screens | `MyPlans.dc.html` | My Plans |  |
| App screens | `Plan.dc.html` | Plan detail & RSVP | v1 includes the first-Join sign-up sheet. Footprint line arrives in v1.1 with the impact engine. |
| App screens | `Profile.dc.html` | Profile | v1: hide Host level, Earnings, Host Pro rows until those features ship. |
| Claude AI features | `AIDraft.dc.html` | Plan assistant |  |
| Deutsch (DE) | `HomeDE.dc.html` | Start | Reference for German locale. |
| Deutsch (DE) | `PlanDE.dc.html` | Plan-Details | Reference for German locale. |
| Deutsch (DE) | `WelcomeDE.dc.html` | Willkommen | Reference for German locale; DE ships in v1 alongside EN. |
| Flows & edge cases | `AfterEvent.dc.html` | After the event |  |
| Flows & edge cases | `CreateDetails.dc.html` | Details — validation |  |
| Flows & edge cases | `EmptyCity.dc.html` | No Plans in this city | v1: “Start your own Plan” + online Plans. The “Host a global edition” row appears in v1.1. |
| Flows & edge cases | `ManageGuests.dc.html` | Manage & check in | v1. “End Plan” goes to AfterEvent in v1; to Leftovers → AIRecap from v1.1. |
| Flows & edge cases | `MessageRequest.dc.html` | Message request |  |
| Flows & edge cases | `Offline.dc.html` | Offline |  |
| Flows & edge cases | `OrderPickup.dc.html` | Pickup & completion |  |
| Flows & edge cases | `OrderShort.dc.html` | Below target at cutoff |  |
| Flows & edge cases | `PlanCancelled.dc.html` | Cancelled by host |  |
| Flows & edge cases | `PlanChanged.dc.html` | Time changed |  |
| Flows & edge cases | `PlanFull.dc.html` | Plan full → waitlist |  |
| Flows & edge cases | `Published.dc.html` | Published + share |  |
| Flows & edge cases | `ReportDone.dc.html` | Report received |  |
| Flows & edge cases | `ReportSheet.dc.html` | Report |  |
| Flows & edge cases | `WaitlistOffer.dc.html` | Waitlist spot offered |  |
| Flows & edge cases | `WebRSVP.dc.html` | Web RSVP — no app needed |  |
| Flows & edge cases | `WebRSVPDone.dc.html` | Web RSVP confirmed |  |
| Hosting & paid extras | `CreateOrder.dc.html` | New group order | v1: supplier step = free-text name + area. Grouped picker (Near you / Ships to you) in v1.1 with the shop directory. |
| Hosting & paid extras | `HostSuspendedEvent.dc.html` | Plan on hold |  |
| Hosting & paid extras | `OnlinePlan.dc.html` | Online Plan | v1: external meeting link (Zoom/Meet/Jitsi), revealed to confirmed guests 15 min before. |
| Loading & errors | `HomeLoading.dc.html` | Loading skeleton |  |
| Loading & errors | `NoResults.dc.html` | No search results |  |
| Loading & errors | `RSVPError.dc.html` | RSVP failed |  |
| Loading & errors | `ServerError.dc.html` | Server error |  |
| Messages & recipes | `ChatActions.dc.html` | Chat actions |  |
| Messages & recipes | `ChatDM.dc.html` | Direct message |  |
| Messages & recipes | `ChatPlan.dc.html` | Plan chat |  |
| Messages & recipes | `RecipeCreate.dc.html` | New recipe |  |
| Messages & recipes | `RecipeDetail.dc.html` | Recipe |  |
| Search & Circles | `CircleApprovals.dc.html` | Moderator approvals |  |
| Search & Circles | `CircleRequest.dc.html` | Request to join |  |
| Search & Circles | `CreateCircle.dc.html` | New Circle |  |
| Search & Circles | `Filters.dc.html` | Filters |  |
| Search & Circles | `SearchResults.dc.html` | Search results |  |
| Web: staff & hosts | `Console.dc.html` | Safety console — queue, hosts, appeals, audit | Web, staff only. v1: queue, case view, decisions, audit log. Host verification + appeals views also v1. |

### v1.1 (18 screens)

| Canvas page | Screen file | Title | Notes |
| --- | --- | --- | --- |
| Claude AI features | `AIRecap.dc.html` | Recipe card from notes |  |
| Claude AI features | `AITranslate.dc.html` | Translate posts |  |
| Environmental impact | `HabitCheckin.dc.html` | 3-month habit check-in |  |
| Environmental impact | `ImpactDashboard.dc.html` | Your impact |  |
| Environmental impact | `ImpactExplain.dc.html` | How we estimate |  |
| Environmental impact | `Leftovers.dc.html` | Leftovers after a Plan |  |
| Global layer | `AdoptTable.dc.html` | A local host adopts it |  |
| Global layer | `CookAlongList.dc.html` | Shopping list adapted by AI |  |
| Global layer | `ExploreGlobal.dc.html` | Explore outside a chapter |  |
| Global layer | `GlobalCreate.dc.html` | Choose the format |  |
| Global layer | `GlobalPlan.dc.html` | Global Plan — guest view |  |
| Global layer | `OnlineAfter.dc.html` | After the class |  |
| Global layer | `OnlineEnded.dc.html` | Joined after it ended |  |
| Global layer | `OnlineHostLate.dc.html` | Host hasn’t started |  |
| Global layer | `OnlineLobby.dc.html` | Lobby — get your kitchen ready |  |
| Global layer | `OnlineReconnect.dc.html` | Connection lost |  |
| Stores | `AddShop.dc.html` | Add a shop |  |
| Stores | `StoreProfile.dc.html` | Store profile |  |

### Later (17 screens)

| Canvas page | Screen file | Title | Notes |
| --- | --- | --- | --- |
| Accessibility & compliance | `CancelSub.dc.html` | Cancel Host Pro |  |
| Accessibility & compliance | `HostTrader.dc.html` | Host status |  |
| Global layer | `LinkUp.dc.html` | Live link-up | In-app multi-table video. Later — v1.1 uses one external link for all tables. |
| Global layer | `OnlineLive.dc.html` | Live class | In-app video. Later — use external links until then. |
| Host program | `DemandNudge.dc.html` | Demand nudge |  |
| Host program | `HostLevels.dc.html` | Host level |  |
| Host program | `MembershipSetup.dc.html` | Supper club membership |  |
| Host program | `ProUpgrade.dc.html` | Pro pays for itself |  |
| Host program | `SeedsWallet.dc.html` | Seeds wallet |  |
| Hosting & paid extras | `PaidCancelled.dc.html` | Paid Plan cancelled |  |
| Monetization | `Checkout.dc.html` | Checkout |  |
| Monetization | `HostPayouts.dc.html` | Earnings & payouts |  |
| Monetization | `HostPro.dc.html` | Host Pro |  |
| Monetization | `PaidPlan.dc.html` | Paid Plan |  |
| Monetization | `TicketConfirmed.dc.html` | Ticket |  |
| Stores | `StoreDashboard.dc.html` | Store dashboard — demand, orders, Partner |  |
| Web: staff & hosts | `HostDashboard.dc.html` | Host dashboard — overview, Plans, earnings, settings |  |

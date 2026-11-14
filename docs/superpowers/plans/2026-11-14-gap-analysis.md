## 1. Schema, RLS and API contracts

**Severity:** **V1** = breaks a v1 requirement/acceptance criterion; **Shape** = naming or shape difference only; **Future** = v1.1/Later.

Static comparison against the current checkout, including later migrations. “Built” below means implemented in source, not deployment-verified. Tests were not rerun.

**Schema differences — docs/05:**

| Severity | Documented → implemented |
|---|---|
| **V1** | `plans.circle_id`, `visibility`, `language` absent: no Circle-scoped Plans or language filtering. Circle’s Plans tab substitutes city-wide/online results. [core], [CircleScreen] |
| **V1** | `plans` defaults to `published`, not `draft`; no `published_at`, `cancelled_reason`, `ai_drafted`. `plan_create` publishes immediately; no persisted draft/publish/edit/cancel workflow. [core], [plan-create] |
| **V1** | Documented capacity 2–500 → SQL table permits 1–500, creation RPC permits 2–50, hosting levels cap usable capacity at 6/12/30. Online creation also requires a profile city, although documented `city_id` is nullable. [core], [plan-create], [host-levels] |
| **V1** | `profiles.diet`, `show_city`, `languages` absent. `profile_visibility='circles'` becomes opt-in `people_visible=false`; city visibility cannot be controlled separately. [core], [people] |
| **V1** | `messages`: 1,000-character maximum instead of 4,000; no `media_path`, `kind`, `deleted_at`. No `conversations.pinned_message_id`; implementation pins conversations, not messages. [chat], [direct] |
| **V1** | `saves`, `feature_flags`, `media` tables absent. `report_evidence` exists, but no evidence upload/write path. [safety], [migrations] |
| **Shape** | `cities.centroid`, PostGIS setup and GIST index absent. `emergency_number` is replaced by a client country map with fallback `112`. [core], [ReportScreen] |
| **Shape** | `plans.is_online` → `format`; `cover_path` → `image_path`; `transit_hint` → `area_hint`; allergens array → comma-separated text. Creation still validates a non-empty array before storing it. [core], [plan-create] |
| **Shape** | `plan_private.meeting_url` → separate `plan_meeting_links`. `rsvps.waitlist_position` → `queue_seq` plus calculated position. Guest email/name live through auth/profile and `guest_rsvp_tokens`, rather than nullable guest columns on `rsvps`; `source` absent. [core], [web-rsvp SQL] |
| **Shape** | `user_settings.notify_*` → `notif_*`; `lockscreen_text` → `lock_screen_text`; quiet times are integer hours, not `time`; snooze-until → `notif_prompt_dismissed_at`. Locale is `user_settings.language`, not `profiles.locale`. [account], [push-language] |
| **Shape** | `conversation_members` → inferred Plan/Circle membership, direct-chat `user_low/user_high`, and `conversation_settings`. `connections(a,b,status)` → directional `requester_id/addressee_id` rows; reciprocal rows mean connected. [people], [direct] |
| **Shape** | `group_orders.pickup_window` → `pickup_start/pickup_end`; adds `pickup_address`, `extended_once`. `audit_events.meta` → `detail`, UUID instead of bigint ID. Idempotency PK becomes `(user_id,key)`; message deduplication becomes `(sender_id,client_id)`. [orders], [hosting], [core], [chat] |
| **Shape** | Additional omitted fields: `profiles.handle/avatar_path/bio/area_label/updated_at`; `circles.cover_path/languages`; `plans.updated_at`; `plan_feedback.tags`; `recipes.cover_path/ai_written/plan_id`. Recipes additionally require a Circle. [core], [circles], [hosting], [recipes] |
| **Shape** | Circle-request uniqueness is pending-only `(circle_id,user_id)`, rather than `(circle_id,user_id,status)`. Minimum indexes `plans(status,starts_at)` and `plans(circle_id)` absent; city index includes changed/on-hold Plans. [circles], [core] |
| **Future** | `global_edition_id`, `shop_id`, all documented v1.1 tables and Later tables absent. Conversely, `host_levels`, `follows`, `recipe_votes`, featured-host fields and weekly digest have already been added. [host-levels], [featured-hosts], [weekly-digest] |

**RLS/access differences:**

| Severity | Difference |
|---|---|
| **V1** | `plan_cards` exposes every non-draft Plan; no public/Circle/link visibility enforcement. The documented host/staff access to drafts is also absent. [core], [featured-hosts] |
| **V1** | `can_see_address` and `can_see_meeting_link` explicitly allow `on_hold`; docs/08 requires withholding the address. Meeting links unlock at start−10 minutes, versus the v1 start−15 requirement. No co-host access model. [core] |
| **Done 2026-11-14** | Blocking now also hides the other side’s Plan/order/recipe cards and their messages inside shared Plan/Circle chats (`20261112002600_blocks_hide.sql`, `blocks_visibility.test.ts`). T-07 holds. [chat], [safety], [host-levels], [featured-hosts] |
| **Shape** | No `public_profiles` or `plan_guests` views. Safe reads instead use `people_in_my_circles()` and `host_guest_list()`; the latter returns display name/state, without contribution details. Reports use `my_reports()`/staff RPCs instead of table policies. These substitutions are not themselves missing authorization. [people], [hosting], [safety] |

**RPC names/signatures — docs/06:**

Actual parameters generally use `p_`; `K` below means `p_idempotency_key uuid`.

| Severity | Documented → actual |
|---|---|
| **Shape** | `home_feed(city_id?)`, `get_plan(plan_id)` → client composition of views/selects; no corresponding RPCs. [supabaseBackend] |
| **V1** | `search(q,filters)` absent. Plans use bounded client-side substring search; Circles/recipes use `ILIKE`; no EN/DE `tsvector` search or language filter. [supabaseBackend], [exploreRules] |
| **V1** | `plan_create_draft(fields)`, `plan_publish(plan_id)` → single `plan_create(kind,format,title,description,starts_at,ends_at,capacity,allergens,area_label,address,keep_address_private,meeting_url,K)`. `plan_update` and `plan_cancel` absent. [plan-create] |
| **Shape** | `checkin_toggle(plan_id,rsvp_id)` → `host_check_in(plan_id,user_id,checked_in boolean,K)`; `plan_end` → `host_end_plan(plan_id,K)`. [hosting] |
| **V1** | `feedback_submit(plan_id,rating,tags[],comment?)` → `plan_feedback_submit(plan_id,rating,comment,K)`; no tags, and repeated submissions update feedback despite “once per user.” [hosting] |
| **Shape** | `circle_request_decide` → `circle_request_respond(request_id,approve,K)`; `circle_join` additionally takes `answer,K`. `message_send` → `message_post(conversation_id,body,client_id)`; media unsupported as noted above. [circles], [chat] |
| **Shape** | `order_create` splits pickup into start/end/address/note parameters; `order_decide` additionally accepts `ready`, returning `{state}` rather than an order. [orders] |
| **V1** | `report_create(...,evidence[])` lacks evidence; `staff_host_verify(user_id,approve,reason)` absent. `staff_queue(filters)` has no filters. [safety] |
| **Shape** | `consent_update` folds into `settings_update(p_patch jsonb)`; `policy_accept` → `policies_accept(p_versions jsonb)`; `account_export_request` → `data_export_request(K)`. `staff_decide` additionally requires `p_rule,K`. [account], [policies], [safety] |
| **Shape** | RPCs raise lowercase PostgreSQL errors instead of `{ok:false,code,message}`. RSVP returns `status`, not `state`; expired-offer response is `{status:'expired'}` instead of `OFFER_EXPIRED`. The app maps these contracts. [core], [errors] |
| **V1** | `web_rsvp` is named `web-rsvp`, accepts the idempotency key in JSON rather than the header, and has no CAPTCHA parameter/validation. Retries after guest creation take the existing-user branch instead of replaying the original reservation response. [web-rsvp function] |
| **Shape** | Several mutations lack explicit idempotency keys: `settings_update`, `policies_accept`, `unblock_user`, `dm_request_respond`, mute/pin/read operations. They generally implement state-setting semantics instead. [account], [policies], [safety], [direct] |

## 2. State machines versus RPC transitions

| Severity | Difference from docs/07 |
|---|---|
| **V1** | **Plan:** no draft save/delete, host edit/cancel, `changed → published` timeout, `needs_reconfirm`, or reconfirm RPC. Status enums and notification triggers exist without these workflows. [plan-create], [core], [notifications] |
| **V1** | **Suspended host:** `apply_standing()` updates the profile only. Upcoming Plans never automatically enter `on_hold`; no hold-release transition. Consequently T-08’s join pause and guest notification do not occur. [safety] |
| **V1** | **Completion/check-in:** no automatic completion at end+2h. `host_end_plan()` marks unrecorded guests `no_show` immediately, even before the check-in window ends. Check-in opens start−2h, not start−1h; host only, no co-host. [hosting] |
| **V1** | **Waitlist expiry:** scheduled through the 15-minute reminders job, not the specified five-minute job. Expired users receive no notification, contrary to T-17. `promote_waitlist()` returns before expiring offers once the Plan starts; `waitlist_respond()` can then accept an expired offer still marked `offered`. [core], [notifications], [cron-reminders] |
| **V1** | **Orders:** below-target `go` sets `locked` without resetting/collecting quantity confirmations; `confirmed` remains unused. Completion occurs only when everyone collects, not at pickup-window end+24h. Extension is restricted to once and uses decision-time+72h. [orders] |
| **V1** | **Circles:** no invite acceptance, ordinary leave, or moderator removal RPC. Declined users can request again immediately; no 30-day cooldown. Approval/decline does not append an audit event when performed by the owner. [circles] |
| **V1** | **Reports:** no AI-driven `open → triaged` or urgent-keyword paging; severity comes from category. `staff_decide` also accepts an `appealed` report, allowing another ordinary decision instead of exclusively the appeal path. [safety] |
| **Future** | Online-class lifecycle absent, consistent with its v1.1 designation. |

## 3. Notifications and analytics

**Notification differences — docs/12:**

| Severity | Difference |
|---|---|
| **V1** | `waitlist_offer`, `plan_changed`, `plan_cancelled`, `moderation_notice`: email is only a queue flag; no `email-send` implementation. Auth magic links do exist. [notifications], [functions], [web-rsvp function] |
| **V1** | Waitlist offers pass `urgent=true`, bypassing quiet hours. No delayed-push validity check against `offer_expires_at`. [notifications], [push-dispatch] |
| **V1** | Email-only moderation rows are also claimed by `push-dispatch`: the queue has no push-channel flag, and the dispatcher sends every claimed row to available tokens. [notifications], [push-dispatch] |
| **V1** | `plan_changed`/`plan_on_hold` triggers exist, but their normal originating workflows are missing. `plan_cancelled` lacks host/reason; `plan_on_hold` lacks the promised update deadline. [notifications], [safety] |
| **V1** | `order_decision` has no reconfirm action; `order_ready` lacks pickup window/organizer/amount; `order_closing` lacks quantity remaining. [notifications], [notificationCopy] |
| **V1** | In-app `moderation_notice` contains action IDs/type, not the statement of reasons. Warning/removal notices have no detail destination; only suspension/freeze opens a reasons screen. [notifications], [notificationCopy] |
| **Shape** | Reminders can enqueue 15 minutes before the documented 24h/2h boundaries. `address_unlocked` additionally queues email. `weekly_digest` is an extra catalog event. [notifications], [weekly-digest] |
| **Future** | `habit_checkin` absent. |

**Analytics: V1 missing.** Consent storage exists, but there is no PostHog integration or emission of any of the 23 documented core events:

`onboarding_step_viewed`, `onboarding_completed`, `signup_started`, `signup_completed`, `plan_viewed`, `rsvp_joined`, `rsvp_cancelled`, `waitlist_offer_responded`, `web_rsvp_submitted`, `checkin_recorded`, `plan_create_started`, `ai_draft_requested`, `ai_draft_accepted`, `plan_published`, `plan_shared`, `order_interest_set`, `order_completed`, `circle_joined`, `message_sent`, `report_submitted`, `block_created`, `notification_opened`, `search_performed`.

No common-property instrumentation, weekly verified-participation metric, or documented funnels. Stored check-ins/collection timestamps and profile counts are not that analytics pipeline. [mobile package], [account], [hosting], [orders], [PushTapRouter]

## 4. Backlog/15: every v1 story

Shared limitation: missing analytics/Sentry and unverified deployment/device checks prevent treating these as complete Definition-of-Done approvals.

| Story | Status | Difference/evidence |
|---|---|---|
| S0-1 Monorepo/CI | **Partly · V1** | Workspaces/checks exist; no Maestro CI or EAS profiles. Web uses Expo rather than a separate app. [CI], [mobile package] |
| S0-2 Supabase | **Partly · V1** | Migrations exist; no generated `packages/types`. Seed now holds the prototype people (Ama, Jonas, Mia, Lena), 3 Plans + a past one, 1 group order, 2 Circles and 2 recipes (`seed.test.ts` loads it twice). Local/staging Supabase deployment remains unverified. [seed], [backend types], [HANDOVER] |
| S0-3 Design system | **Partly · V1** | Tokens/components exist; no Storybook/component preview covering the required inventory. [components], [tokens] |
| S0-4 i18n/analytics/Sentry/flags | **Partly · V1** | i18n built; analytics, Sentry and feature flags absent. [i18n], [mobile package] |
| S1-1 Onboarding | **Partly · V1** | Skip goes to `/home` with worldwide Plans, not Explore with online Plans. [WelcomeScreen], [plan queries] |
| S1-2 Auth/resume | **Built** | No additional story-specific source gap identified; OAuth delivery remains unverified. [auth], [PlanScreen] |
| S1-3 Privacy/consent | **Partly · V1** | Choices/logging built; consent-gated analytics SDK absent. [PrivacyChoicesScreen], [account] |
| S1-4 Home/shell | **Built** | No additional story-specific source gap identified. [HomeScreen] |
| S1-5 Settings/data/legal | **Partly · V1** | Screens and request records exist; export fulfilment and auth-data purge worker absent. [account], [AccountScreen], [functions] |
| S2-1 Plan detail | **Built** | Address-before-reveal and sign-up/resume paths exist; separate hold/link-timing gaps above. [PlanScreen], [core] |
| S2-2 RSVP engine | **Partly · V1** | Expiry timing/start-boundary and expired-user notification gaps in §2. [core], [notifications] |
| S2-3 Plan variants | **Partly · V1** | Status/error/offline presentation exists; no functioning change/reconfirm or host-suspension flow. [PlanScreen], [planCopy], [safety] |
| S2-4 My Plans/offline | **Done 2026-11-14** | Hosting tab lists the member’s own Plans (`my_hosted_plans` view); Past includes `no_show` (“Missed” pill) and hosted Plans (“You hosted”). Onboarding without a city lands on Explore with the Online filter on. [MyPlansScreen], [supabaseBackend], [offlineCache] |
| S2-5 Notifications | **Partly · V1** | Pipeline exists; quiet-hours/channel discrepancies in §3. [notifications], [push-dispatch] |
| S3-1 Create | **Partly · V1/Shape** | Six steps instead of type+four details steps; only two kinds; city/level/capacity restrictions. Date/time/address/allergen controls exist. [CreatePlanScreen], [plan-create] |
| S3-2 AI draft | **Missing · V1** | No `ai-draft-plan`, validation, fallback integration, rate limiting or AI badge flow. [functions], [CreatePlanScreen] |
| S3-3 Publish/share/web RSVP | **Partly · V1/Shape** | Expo web instead of Next.js is shape-only. Universal-link associations absent; reservation email is a sign-in magic link; no waitlist-email delivery. [PublishedScreen], [app.json], [web-rsvp function] |
| S3-4 Hosting/check-in/feedback | **Partly · V1** | Window/completion differences; no server participation analytics. [hosting], [ManageScreen] |
| S3-5 Contributions | **Built** | No additional story-specific gap identified. [bring-items], [core] |
| S4-1 Circles | **Partly · V1** | Invite/leave/remove absent; Circle Plans tab shows city Plans rather than Circle-linked Plans. [circles], [CircleScreen] |
| S4-2 Explore/search/filters | **Partly · V1** | No EN/DE full-text/language search. Filters use component state and reset on remount; only browse location is session-stored. [ExploreScreen], [exploreRules], [browseStore] |
| S4-3 Messaging | **Partly · V1** | Polling at 5s/15s instead of Realtime; blocked shared-chat content remains visible. [chat queries], [inbox queries], [chat] |
| S4-4 Recipes | **Built** | Serving scaling and allergen/not-confirmed creation implemented. [RecipeScreen], [recipes] |
| S5-1 Orders | **Partly · V1** | Reconfirmation and timed completion absent; creation additionally level-gated. [orders], [host-levels] |
| S5-2 Safety | **Done 2026-11-14** | T-07 content hiding and T-08 suspended-host hold now pass; receipt/suspension/appeal paths exist. [safety] |
| S5-3 Staff console | **Partly · V1** | No AI triage or host-verification workflow; authorization checks profile role, not SSO+MFA. Queue/case/decisions/audit/appeals exist. [ConsoleScreen], [safety] |
| Sprint 6 hardening/beta | **Partly · V1** | Automated checks exist; physical screen-reader checks, low-end cold-start measurement, load test and beta/store readiness are not demonstrated. Some headings cap font scaling at 1.4/1.6. [HANDOVER], [CI], [WelcomeScreen] |

## 5. Open questions/16 decided differently

| Question | Severity | Implemented decision |
|---|---|---|
| #3 Retention | **V1** | Account deletion fixes `purge_after=now()+30 days` while counsel approval remains open; no purge executor. [account] |
| #5 Email provider | **Shape** | Authentication email uses Supabase Auth. Transactional email/media-scan provider remains unresolved; no corresponding functions. [web-rsvp function], [functions] |
| #6 Waitlist timings | **Shape** | 2h/6h match the proposed values, but are hard-coded SQL intervals rather than configurable pending host confirmation. [core] |
| #7 Private-home verification | **V1** | No “verification above N guests” rule. Instead, all in-person hosting/orders are level-gated; verified hosts bypass to level 3. [host-levels] |
| #8 German currency | **Shape** | Chosen implicitly through `Intl.NumberFormat(language,{style:'currency'})`: German formatting places the currency after the amount. [orderRules] |
| #9 Dark mode | **Shape** | Explicit light-only application setting. [app.json] |
| #10 Android adaptation | **Shape** | Shared custom React Native controls/tab bar; no separate Material component implementation. [components], [TabBar] |
| #13 Host levels | **Future, now affecting V1** | Thresholds already implemented: 1 recipe → online/6; 3 recipes + 1 hosted Plan with feedback + 10 followers → in-person/12/orders; 100 followers + 2,000 upvotes → 30/featured. This is a **recorded later owner request**, not an unexplained deviation. [host-levels], [later owner spec] |
| #16 Urgent-report operations | **V1** | Urgent/high/routine deadlines fixed at 1h/24h/72h, using category classification; no on-call paging integration. [safety], [functions] |

[core]: supabase/migrations/20261111000000_core.sql
[circles]: supabase/migrations/20261112000200_circles.sql
[recipes]: supabase/migrations/20261112000300_recipes.sql
[people]: supabase/migrations/20261112000400_people.sql
[plan-create]: supabase/migrations/20261112000500_plan_create.sql
[hosting]: supabase/migrations/20261112000600_hosting.sql
[bring-items]: supabase/migrations/20261112000700_bring_items.sql
[chat]: supabase/migrations/20261112000800_chat.sql
[direct]: supabase/migrations/20261112000900_direct.sql
[orders]: supabase/migrations/20261112001100_orders.sql
[safety]: supabase/migrations/20261112001200_safety.sql
[account]: supabase/migrations/20261112001300_account.sql
[policies]: supabase/migrations/20261112001400_policies.sql
[notifications]: supabase/migrations/20261112001600_notifications.sql
[web-rsvp SQL]: supabase/migrations/20261112001700_web_rsvp.sql
[host-levels]: supabase/migrations/20261112002000_host_levels.sql
[featured-hosts]: supabase/migrations/20261112002100_featured_hosts.sql
[weekly-digest]: supabase/migrations/20261112002200_weekly_digest.sql
[push-language]: supabase/migrations/20261112002300_push_language.sql
[migrations]: supabase/migrations
[functions]: supabase/functions
[web-rsvp function]: supabase/functions/web-rsvp/index.ts
[cron-reminders]: supabase/functions/cron-reminders/index.ts
[push-dispatch]: supabase/functions/push-dispatch/index.ts
[supabaseBackend]: apps/mobile/src/lib/backend/supabase/supabaseBackend.ts
[errors]: apps/mobile/src/lib/backend/supabase/errors.ts
[backend types]: apps/mobile/src/lib/backend/types.ts
[offlineCache]: apps/mobile/src/lib/offlineCache.ts
[i18n]: apps/mobile/src/lib/i18n.ts
[mobile package]: apps/mobile/package.json
[app.json]: apps/mobile/app.json
[CI]: .github/workflows/ci.yml
[seed]: supabase/seed.sql
[HANDOVER]: HANDOVER.md
[components]: apps/mobile/src/components
[tokens]: packages/tokens
[TabBar]: apps/mobile/src/components/TabBar.tsx
[WelcomeScreen]: apps/mobile/src/features/onboarding/WelcomeScreen.tsx
[HomeScreen]: apps/mobile/src/features/home/HomeScreen.tsx
[auth]: apps/mobile/src/features/auth
[PrivacyChoicesScreen]: apps/mobile/src/features/account/PrivacyChoicesScreen.tsx
[AccountScreen]: apps/mobile/src/features/account/AccountScreen.tsx
[PlanScreen]: apps/mobile/src/features/plans/PlanScreen.tsx
[planCopy]: apps/mobile/src/features/plans/planCopy.ts
[plan queries]: apps/mobile/src/features/plans/queries.ts
[MyPlansScreen]: apps/mobile/src/features/myPlans/MyPlansScreen.tsx
[CreatePlanScreen]: apps/mobile/src/features/create/CreatePlanScreen.tsx
[PublishedScreen]: apps/mobile/src/features/create/PublishedScreen.tsx
[ManageScreen]: apps/mobile/src/features/hosting/ManageScreen.tsx
[CircleScreen]: apps/mobile/src/features/circles/CircleScreen.tsx
[ExploreScreen]: apps/mobile/src/features/explore/ExploreScreen.tsx
[exploreRules]: apps/mobile/src/features/explore/exploreRules.ts
[browseStore]: apps/mobile/src/features/explore/browseStore.ts
[chat queries]: apps/mobile/src/features/chat/queries.ts
[inbox queries]: apps/mobile/src/features/inbox/queries.ts
[RecipeScreen]: apps/mobile/src/features/learn/RecipeScreen.tsx
[ConsoleScreen]: apps/mobile/src/features/safety/ConsoleScreen.tsx
[ReportScreen]: apps/mobile/src/features/safety/ReportScreen.tsx
[notificationCopy]: apps/mobile/src/features/notifications/notificationCopy.ts
[PushTapRouter]: apps/mobile/src/features/notifications/PushTapRouter.tsx
[orderRules]: apps/mobile/src/features/orders/orderRules.ts
[later owner spec]: docs/superpowers/specs/2026-11-14-hosting-levels-city-flow-design.md
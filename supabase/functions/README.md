# Edge Functions

| Function         | Schedule                                                   | Does                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cron-reminders` | manual only (the 15-min job runs in the database, pg_cron) | `select notifications_enqueue_due()`: expires waitlist offers, settles orders past their cutoff, day-before and 2-hour reminders, address unlocks, order closing notices      |
| `web-rsvp`       | on request (POST)                                          | the shared-link RSVP page: finds or makes the guest's auth user, profile, joins with the app's capacity rules, emails a magic link; cancels by token                          |
| `push-dispatch`  | every 1 min                                                | claims due `push_queue` rows under a lease (`push_queue_claim`), sends through Expo push, marks sent only on accepted tickets, retries up to five attempts, drops dead tokens |

All run with the service role. `push-dispatch` and `cron-reminders` accept only a POST carrying the service-role key (`_shared/workerAuth.ts`); pg_cron calls `push-dispatch` every minute with the key from Vault (migration 20261112003000). Quiet hours, the member's choices and the lock-screen setting are applied when the row is queued (`notify()` in migration 20261112001600), so the dispatcher only sends what is due. Email rows (`email = true`) wait for `email-send`.

Push text is English in v1 (the Inbox row is localised in the app); per-language push copy needs a language on the profile, which is an open item.

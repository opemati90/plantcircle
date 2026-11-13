# Edge Functions

| Function | Schedule | Does |
| --- | --- | --- |
| `cron-reminders` | every 15 min | `select notifications_enqueue_due()`: expires waitlist offers, settles orders past their cutoff, day-before and 2-hour reminders, address unlocks, order closing notices |
| `push-dispatch` | every 1 min | claims due `push_queue` rows under a lease (`push_queue_claim`), sends through Expo push, marks sent only on accepted tickets, retries up to five attempts, drops dead tokens |

Both run with the service role. Schedule them with `supabase functions schedule` (or pg_cron calling the HTTP endpoint). Quiet hours, the member's choices and the lock-screen setting are applied when the row is queued (`notify()` in migration 20261112001600), so the dispatcher only sends what is due. Email rows (`email = true`) wait for `email-send`.

Push text is English in v1 (the Inbox row is localised in the app); per-language push copy needs a language on the profile, which is an open item.

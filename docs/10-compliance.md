# 10 — Privacy, safety and legal rules for code

Not legal advice — counsel must review texts and classifications. These are the implementation requirements derived from the design.

| Area | Requirement in code |
| --- | --- |
| GDPR minimisation | No GPS; city/area chosen by user. Strip EXIF from photos. No contact export for hosts. |
| GDPR Art. 9 (diet may reveal beliefs) | `diet` optional, private, excluded from analytics, ads and any partner data. Separate explicit consent if ever used for personalisation. |
| Consent (TDDDG §25) | Analytics SDK initialises only after `analytics_consent=true`. Crash reporting minimal and PII-scrubbed. |
| Data subject rights | Export (JSON + media zip, emailed link valid 7 days) and deletion in-app; deletion anonymises authored content, releases RSVPs, purges within 30 days except legal-hold records. |
| Retention (proposals — confirm with counsel) | Messages 2 years after last activity; reports/moderation 3 years; audit log 6 years (confirm with counsel); web RSVP guest data deleted 30 days after the Plan. |
| DSA notice & action | Report on every content type; case reference; reporter anonymity; accuracy confirmation. |
| DSA statement of reasons | Every moderation action stores rule, facts, whether automation was used, and shows the user how to appeal (internal) and out-of-court options. |
| DSA no dark patterns | Equal-weight consent buttons; easy cancel; no confirmshaming copy. |
| DSA ads | No ads targeted on sensitive data or profiling of minors; all paid placements labelled “Partner”/“Sponsored” (Later). |
| EU AI Act Art. 50 | Label AI-generated/translated content (“Written with AI”, “Translated by AI”); store `ai_written` flags. |
| EU AI Act Art. 4 | Staff using triage get AI-literacy training (ops, not code). |
| GDPR Art. 22 | No solely automated decisions with legal/similar effect — AI only suggests; staff decide and write a reason. |
| Consumer law (Later, paid) | Payment button names the obligation (“Buy ticket · €19,44”; DE “Zahlungspflichtig buchen”); show host private/business status at checkout; subscription cancel button reachable in two steps (also on web); total price incl. fees before payment. |
| Platform tax (Later) | Collect seller tax ID and report earnings (DAC7 / PStTG) for paid hosts. |
| Impressum | Reachable from Profile → About and web footer. |
| Age | 18+ self-declared; under-18 path stores nothing. |
| Environmental claims (v1.1) | Every impact number says “estimate”, links the method, states the baseline; never “climate neutral”. |
| OpenStreetMap data (v1.1) | ODbL attribution in UI (“© OpenStreetMap contributors”) and share-alike for derived database — confirm approach with counsel. |

## Safety operations
- On-call rota for urgent reports before public launch; urgent keyword list triggers paging without waiting for AI.
- Staff access to private messages only via `staff_view_messages(report_id, reason)` (logged).
- Host verification required before selling tickets (Later) or private-home Plans with > 8 guests (open question).
- Emergency numbers from `cities.emergency_number` (default 112).

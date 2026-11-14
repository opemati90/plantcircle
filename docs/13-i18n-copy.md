# 13 — Localisation and copy

- **Locales v1:** `en`, `de`. Architecture supports any; never branch logic on locale.
- **Library:** i18next with ICU plurals; keys by feature: `plan.join`, `plan.full.cta`, `order.notice.payOrganizer`.
- **Source of truth for wording:** prototype screens until a copy deck exists. German screens [WelcomeDE, HomeDE, PlanDE] show tone (informal “du”, shortened tab labels: Start · Entdecken · Pläne · Chats · Profil).
- **Formatting:** `Intl` / date-fns-tz with the **Plan’s tz** for event times and the **viewer’s tz** labelled “your time” for online/global Plans (“Tue 23:00 your time · 19:00 in São Paulo”). 24-hour clock in `de`; locale default otherwise. Currency via `Intl.NumberFormat(locale, {style:'currency', currency})` (de → “19,44 €” — decide one style, see open questions).
- **Units:** metric by default; US customary when locale/region is US.
- **Typography:** curly apostrophes and quotes in UI strings (’ “ ” in EN; „ “ in DE).
- **Length:** design for +30% (German). Tab labels max ~10 characters.
- **Voice:** plain, short, friendly, second person; say what happens next; no blame (“Couldn’t save your RSVP”, not “You failed”).
- **Legal copy** (Terms, Privacy, Impressum, refund rules) comes from counsel; keep in CMS/markdown, versioned.

## Starter keys (excerpt)
| Key | en | de |
| --- | --- | --- |
| `common.continue` | Continue | Weiter |
| `plan.join` | Join | Dabei sein |
| `plan.going` | You’re going | Du bist dabei |
| `plan.full` | Join waitlist | Auf die Warteliste |
| `plan.addressAfterJoin` | Exact address after you join | Adresse nach Zusage |
| `plan.spotsLeft_one` | {{count}} spot left | Noch {{count}} Platz |
| `plan.spotsLeft_other` | {{count}} spots left | Noch {{count}} Plätze |
| `create.allergensRequired` | Choose one to publish | Wähle eins, um zu veröffentlichen |
| `order.payOrganizer` | Pay {{name}} directly at pickup. PlantCircle doesn’t handle payments. | Zahle {{name}} direkt bei der Abholung. PlantCircle wickelt keine Zahlungen ab. |
| `error.rsvp` | Couldn’t save your RSVP | RSVP konnte nicht gespeichert werden |
| `offline.banner` | You’re offline · saved at {{time}} | Du bist offline · gespeichert um {{time}} |
German strings need native review before release.

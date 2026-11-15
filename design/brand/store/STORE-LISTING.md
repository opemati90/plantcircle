# PlantCircle: App Store and Google Play listing kit

Screenshots, feature graphic, promo banner, icons and listing copy (EN + DE) for the launch app: the weekly cook club (This week, Circles, Inbox, Profile). Group orders, recipes, the bring list, People and AI drafting are off at launch, so nothing here mentions them. Character limits are checked. The German copy needs a native speaker’s review before publishing.

## Files

Screenshots, feature graphic and promo banner are in `screenshots/{language}/` for every language the app speaks: `en`, `de`, `es`, `fr`, `it`, `nl`, `pl`, `pt`. Each has the app in that language, sample posts written in that language and the headlines below. Upload each language to its own store localization.

| File | Where it goes | Size |
| --- | --- | --- |
| `screenshots/{language}/app-store/6.9-inch/01…06.jpg` | App Store Connect, iPhone 6.9" screenshots (required) | 1320 × 2868 |
| `screenshots/{language}/app-store/6.5-inch/01…06.jpg` | iPhone 6.5" (optional; Apple can scale 6.9") | 1284 × 2778 |
| `screenshots/{language}/google-play/phone/01…06.jpg` | Play Console, phone screenshots | 1080 × 1920 |
| `screenshots/{language}/google-play/feature-graphic-1024x500.jpg` | Play feature graphic (the store header) | 1024 × 500 |
| `screenshots/{language}/promo/promo-1920x1080.jpg` | Website, press kit, social posts (not In-App Events: those need art for a specific event) | 1920 × 1080 |
| `app-store/app-icon-1024.png` | App Store icon (no transparency, no rounded corners) | 1024 × 1024 |
| `google-play/app-icon-512.png` | Play app icon | 512 × 512 |

Screenshots are high-quality JPEG (both stores accept it) with no transparency.

## How they are made

The screenshots are the real app screens, not mock-ups (the App Store set in an iPhone frame, the Google Play set in a neutral Android frame), captured with the device set to each language: `apps/mobile/store/capture.spec.ts` drives the app on sample data (Berlin, Monday 2 November) and `compose.spec.ts` frames each screen in brand green with its headline. The sample content is European and plant-based (a fresh pasta night, mushroom pasta, lentil soup, bruschetta) and written per language in `apps/mobile/store/locales.ts`, together with the headlines. Rebuild after any UI change:

```
cd apps/mobile
pnpm store:capture && pnpm store:compose   # all languages; STORE_LANGUAGES=de,fr for some
cp -R store/out/{en,de,es,fr,it,nl,pl,pt} ../../design/brand/store/screenshots/
```

The food photos are CC0 (public domain) and swapped in only for the capture (`apps/mobile/store/photos/CREDITS.md`); the app’s own sample photos are unlicensed stand-ins and never appear. Replace them with photos from your own cooking nights when you have them: real food from real members sells best. The headlines and sample captions in languages other than English need a native speaker’s review, like the app’s own translations.

## Screenshot story (order matters)

Most people see only the first two or three in search, so the order sells the weekly loop first.

| # | Headline | Line | Screen |
| --- | --- | --- | --- |
| 1 | Find your people. Cook together. | A weekly cook club with people near you. | This week: the challenge, your Plan, what your Circle cooked |
| 2 | One theme a week. Everyone cooks. | Your Circle sets it. You cook it at home. | A Circle’s Posts with this week’s challenge |
| 3 | Show what you cooked. | A photo and a line, shared only with your Circle. | Sharing a post, entered for the challenge |
| 4 | Fresh ideas from your Circle. | See what others made, say yum, ask how. | The Circle feed |
| 5 | Then cook together in person. | Cooking nights and potlucks. Join in one tap. | A cooking night you’ve joined |
| 6 | Bring a friend with one link. | They can look around first. No app needed. | The invite page a friend opens |

The headlines in every other language are in `apps/mobile/store/locales.ts`.

## App Store (iOS)

| Field | English | Deutsch |
| --- | --- | --- |
| App name (30) | PlantCircle: Cook Together | PlantCircle: Zusammen kochen |
| Subtitle (30) | A weekly cook club near you | Dein Kochclub, jede Woche |
| Promotional text (170) | Join a Circle near you, cook one theme a week at home and share a photo. Then meet up for cooking nights and potlucks. Free to join. | Tritt einem Circle in deiner Nähe bei, koch jede Woche ein Thema zu Hause und teil ein Foto. Dann trefft euch zu Kochabenden und Potlucks. Kostenlos. |
| Keywords (100) | vegan,vegetarian,potluck,cook club,cooking challenge,meal ideas,community,plant based,supper club | vegan,vegetarisch,potluck,kochclub,koch challenge,rezeptideen,community,pflanzlich,supper club |

**Categories:** primary *Food & Drink*, secondary *Social Networking*. (The weekly cooking loop now leads, so Food & Drink is the better first shelf; swap back if Social ranks better in your tests.)
**Age rating:** answer the questionnaire honestly (user-generated photos, messaging, in-person meet-ups). The app’s own policy is 18+; choose 18+ if your result offers it.

### Description (English)

Find your people. Cook together.

PlantCircle is a weekly cook club for people who love plant-based food. Join a Circle near you, cook the week’s theme at home, share a photo, and meet up when you’re ready.

**One theme every week**
• Each Circle has a theme for the week, like “Leftovers made new” or “One pot”
• Cook it at home, any day, at any skill level
• Share a photo and a line with your Circle; it stays in the challenge until Sunday
• Keep your cooking weeks going, week after week

**Ideas from people near you**
• See what your Circle cooked this week
• Say yum, or ask the cook how they made it
• Posts stay inside your Circle, never public

**Cook together in person**
• Cooking nights and potlucks near you; join in one tap
• See who’s going; the exact address comes before the day
• Full? Join the waitlist and get offered the spot when one opens
• Host your own: online after three posts, in person once your account is also two weeks old

**Bring a friend**
• Invite with one link; friends can look around before they join
• Sign up first and join a Circle whenever you’re ready

**Safe and welcoming**
• Report or block anyone in two taps; a real person reviews every report
• Every diet is welcome; yours is optional and private
• Built for everyone: high contrast, large text and screen readers supported
• Usage analytics only if you say yes

Free to join.

### Beschreibung (Deutsch, bitte muttersprachlich prüfen)

Finde deine Leute. Kocht zusammen.

PlantCircle ist ein wöchentlicher Kochclub für Menschen, die pflanzliches Essen lieben. Tritt einem Circle in deiner Nähe bei, koch das Thema der Woche zu Hause, teil ein Foto und triff die anderen, wann du willst.

**Jede Woche ein Thema**
• Jeder Circle hat ein Wochenthema, zum Beispiel „Reste neu gedacht“ oder „Ein Topf“
• Koch es zu Hause, an jedem Tag, ganz ohne Vorkenntnisse
• Teil ein Foto und einen Satz mit deinem Circle; es bleibt bis Sonntag in der Challenge
• Halt deine Kochwochen am Laufen, Woche für Woche

**Ideen von Menschen in deiner Nähe**
• Sieh, was dein Circle diese Woche gekocht hat
• Sag „Lecker“ oder frag, wie es gemacht wurde
• Beiträge bleiben in deinem Circle, nie öffentlich

**Gemeinsam kochen, vor Ort**
• Kochabende und Potlucks in deiner Nähe, mit einem Tipp dabei
• Sieh, wer kommt; die genaue Adresse kommt vor dem Termin
• Ausgebucht? Auf die Warteliste, und wird ein Platz frei, bekommst du ihn angeboten
• Selbst einladen: online nach drei Beiträgen, vor Ort, wenn dein Konto außerdem zwei Wochen alt ist

**Bring Freund:innen mit**
• Lade mit einem Link ein; Freund:innen können sich erst umsehen
• Erst registrieren, dem Circle beitreten, wann du bereit bist

**Sicher und willkommen**
• Melden oder blockieren in zwei Tipps; jede Meldung prüft ein Mensch
• Jede Ernährungsweise ist willkommen; deine Angabe ist freiwillig und privat
• Für alle gemacht: hoher Kontrast, große Schrift, Screenreader
• Nutzungsanalyse nur, wenn du zustimmst

Kostenlos.

## Google Play

| Field | English | Deutsch |
| --- | --- | --- |
| App name (30) | PlantCircle: Cook Together | PlantCircle: Zusammen kochen |
| Short description (80) | A weekly cook club: cook one theme, share a photo, meet at potlucks near you. | Dein Kochclub: ein Thema pro Woche kochen, Foto teilen, Potlucks in der Nähe. |
| Full description (4000) | Same as the App Store description above | Wie oben |

**Category:** *Food & Drink*. **Tags:** Cooking, Community, Food & drink. **Target audience:** 18+. Complete the content rating (IARC) and Data safety forms.

## Privacy labels / Data safety (fill in from the real build)

Data linked to the user: email, name, user ID, the photos and messages they post, approximate city (chosen, not GPS). Optional, only with consent in Privacy choices: product analytics (PostHog EU; a random ID per account on each device, no names or places). Withdrawing consent on any device, or deleting the account, queues every device’s ID for deletion, and an hourly job deletes them and their events at PostHog (once its keys are set; see the launch checklist). Diagnostics: crash logs. **Not** used for tracking or ads. Data can be deleted in the app (Profile, Account and data). Confirm against the final SDK list (Sentry, PostHog, Supabase, Expo) before submitting.

## To lift conversion after launch

- **A/B test screenshot 1:** Apple *Product Page Optimization* and Google Play *Store listing experiments*. First test: “Find your people. Cook together.” against “Cook one theme a week with people near you.”
- **App preview video** (15 to 30 s): screen recordings of the app only (Apple 2.3.4 allows no live-action footage): the Monday notice, the theme, a photo going up, yums coming in, joining a potluck. Text overlays and narration are fine. Keep real footage of cooking nights for social posts and the website.
- **Ratings:** ask after a good moment (a post that got yums, or after a cooking night), never on first launch.
- **Real social proof:** once you have it, add a line with real Circle counts or member quotes. Don’t invent numbers.

# Monday challenge notice, Circle invites, analytics (2026-11-15)

Owner said proceed with these after the launch core. Joining a Circle stays the member's choice:
nothing in onboarding pushes it ("they might want to take their time after registration").

## 1. Monday: the challenge leads the weekly notice

Members already get one notice on Monday morning (`weekly_digest`, 09:00 to 11:59 local, once a
week, only with reminders on). A second notice that morning would be noise, so the same notice
now leads with the challenge for members of a Circle:

- Title: "This week in Neukölln Plant Kitchen: Soup" (the member's first active Circle, by name,
  the same Circle This week shows).
- Body: the Plans line when there are Plans ("3 near you this week, 2 online"), otherwise "Cook
  it at home and share a photo with your Circle."
- Tapping opens that Circle's Posts tab.
- Members without a Circle keep the Plans notice, and still get nothing when there are no Plans.
- Default themes travel as a key (`theme_key`) and are rendered in the member's language at send
  time; a custom theme travels as written. The push copy file gains the theme names.

## 2. Circle invites

- On a Circle (members only): "Invite people", which opens the share sheet with a short message
  and a link `https://plantcircle.app/c/{id}` (the same web origin as Plan links).
- The link opens a page that works without the app or an account: the Circle's name, line,
  place, member count and this week's theme, with "Join" (sign-up first when needed, then back to
  the Circle) and "Open in the app".
- Only Circles anyone can see (open and ask-to-join) have a page; invite-only Circles show "not
  available". Nothing about members is shown, only the count.
- A small public read (`circle_public`) gives exactly these fields to visitors.

## 3. Analytics (PostHog EU, consent only)

- Sent only for signed-in members who said yes to analytics (Privacy choices); nothing before
  that, nothing for visitors. Without `EXPO_PUBLIC_POSTHOG_KEY` nothing is sent at all.
- Events (docs/12 naming): `onboarding_completed`, `signup_completed {method}`, `circle_joined
  {access}`, `plan_viewed {source}`, `rsvp_joined {state}`, `plan_published {format}`,
  `notification_opened {type}`, plus the cook club: `cook_shared {challenge}`, `cook_reacted`,
  `challenge_viewed {surface}`, `circle_invite_shared`, `circle_invite_opened` (the web page).
- Common properties: platform, app version, language, signed in. Never: diet, captions, message
  text, addresses, emails, photos, Circle or Plan names. The person is a random id kept on the
  device, not the account id.
- Sent with PostHog's HTTP capture endpoint (no native SDK, no rebuild), batched, best effort.
- The questions it answers: do joiners post in their first week, do posters come back the next
  week, do invites bring people who join.

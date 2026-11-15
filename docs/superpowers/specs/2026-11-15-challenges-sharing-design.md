# Weekly challenges, cooking streaks, share cards and friend spots (2026-11-15)

Slices 2 and 3 of `2026-11-15-cooked-it-design.md`. The owner said go on both.

## Why

Cooked it gives members something to share. These slices give them a reason to share this
week (a challenge their Circle cooks together), a reason to keep going (a streak counted in
weeks), and two ways to bring people in (a share card of their own dish, a held spot on a Plan
for a friend).

## Anti-goals

- Streaks that shame: no daily counts, no "you lost your streak" notifications.
- Streaks or challenges that count toward hosting levels. Hosting stays earned by hosting.
- Sharing anyone's content but your own; links to anything private.
- A friend spot that quietly takes a place from people already waiting.

## Slice 2a: the weekly Circle challenge

**What members see**
- At the top of a Circle's Posts tab, a challenge card: eyebrow "THIS WEEK'S CHALLENGE", the
  theme in large type ("Lentils"), "6 members cooked it · ends Sunday", up to four thumbnails
  of entries, and "Cook it this week", which opens the composer for that Circle with the
  challenge ticked.
- In the composer, when the chosen Circle has a challenge: a switch "For this week's challenge:
  Lentils", on when started from the challenge card.
- On a post that was an entry: a small "Challenge: Lentils" label above the caption.
- On Home, above the Cooked rail, a slim line for the member's first Circle: "This week in
  Neukölln Plant Kitchen: Lentils", opening that Circle's Posts tab.
- Owners and moderators see "Change this week's theme" on the card: a sheet with a text field
  (up to 40 characters) and the suggested themes as chips.

**Rules**
- One challenge per Circle per week. A week starts Monday 00:00 in the Circle's city time
  zone; global Circles use UTC.
- Without a theme set by an owner or moderator, the week has a default theme from a fixed list
  of 12, chosen by week number, so every Circle always has a challenge. Default themes are copy
  keys, translated in the app; custom themes are the owner's words.
- A theme can be set or changed for the current week only, and is audited.
- A post is an entry when its author ticks the switch; it records the week it was posted in.
  Entries count only in their own Circle and week.

## Slice 2b: cooking streaks and milestones

- A week counts when the member shared at least one post that week (UTC weeks, any Circle).
- The current streak is the run of consecutive counted weeks ending this week or last week, so
  it does not break on Monday morning.
- Profile shows "Cooking streak: 4 weeks" with the best streak, and milestone badges at 4, 12,
  26 and 52 weeks (earned badges stay, even if the streak ends).
- Another member's profile shows their current streak only to people who share a Circle with
  them (the same rule as the profile itself).
- Deleted posts stop counting. No notifications about streaks.

## Slice 3a: share card

- On your own posts only, "Share" in the post's options and on the post screen after sharing.
- The card is an image, 4:5: your photo, a soft dark fade at the bottom, your caption, and a
  small "Cooked with my Circle · PlantCircle" mark. The message carries a link to the app's
  web address (`EXPO_PUBLIC_WEB_URL`, default `https://plantcircle.app`), never to the post,
  which stays private.
- Native: the card is rendered off screen, captured (react-native-view-shot), and handed to the
  system share sheet (expo-sharing), so Instagram stories, WhatsApp and Messages all work.
  Web: the Web Share API with the image when the browser supports it, otherwise a download.

## Slice 3b: a friend spot on a Plan

Today "Bring a friend" shares the Plan's link; the friend may find it full. A friend spot
holds a place.

**What members see**
- A guest who is going (not the host) sees "Hold a spot for a friend" when the Plan has a free
  spot and nobody is waiting. Holding it opens the share sheet with a personal link.
- While held: "A spot is held for your friend until Sat 18:00", with "Share the link again" and
  "Release the spot".
- When claimed: "Mia is coming with you."
- The friend opens the link: on the web RSVP page and in the app they see "Lena saved you a
  spot" and join into it without an account first (the web RSVP flow), or signed in.

**Rules**
- One held spot per guest per Plan. It counts against capacity while held, exactly like a guest.
- It lasts 48 hours, and never past 6 hours before the start (when last-minute offers begin).
- It is released when it runs out, when the guest releases it or leaves the Plan, when the Plan
  is cancelled, changed (re-confirm) or held, and when the host lowers capacity below what is
  taken. A released spot goes to the waitlist through the normal promotion.
- Claiming needs the token from the link, an open Plan, the spot still held, and a person who
  is not the host, not already going, not blocked by the host or the inviter.
- The host's guest list shows the friend as "Mia (with Lena)".
- Rate: 3 held spots per member across all Plans at once.

## Data (Supabase)

- `circle_challenges` (circle_id, week_start, theme, set_by, created_at; one per Circle and
  week); `circle_challenge_set(circle, theme)` for owners and moderators; `circle_challenge(circle)`
  returns the week, the custom theme or null, the end, and the entry count, for members.
- `cooks.challenge_week date`; `cook_create` gains `p_for_challenge boolean`.
- `cook_streak(p_user_id)` returns current, best and total weeks; null for someone the caller
  may not see.
- `plan_friend_seats` (id, plan_id, inviter_id, token, state held/claimed/released, expires_at,
  claimed_by); `friend_seat_hold`, `friend_seat_release`, `friend_seat_claim` (app),
  `guest_friend_seat_join` (web RSVP); a helper `plan_seats_held(plan)` added to every
  capacity count (join, promotion, the cards' spots left, capacity changes); the 15-minute job
  releases expired spots and promotes the waitlist.

## Left for later

Challenge notifications (a Monday push), a Plan that closes each week's challenge, sharing a
Plan as an image.

# Cooked it: a daily reason to open PlantCircle (2026-11-15)

## Why

The MVP loop is weekly at best: find a Plan, go, give feedback, maybe host. Nothing gives a
member a reason to open the app on a day without a Plan, so once a group has formed it drifts to
WhatsApp. The owner asked for a feature that drives growth and daily engagement.

The answer is one small daily habit that feeds the Plans and levels that already exist:
members share what they cooked, their Circles see it, and the week ends in a challenge and a
Plan. It must feel as premium and calm as the rest of the app, never like a social network.

## Goals

1. A member can share a dish they cooked in about 10 seconds: photo, one line, optional recipe.
2. Opening the app shows something new from your own Circles on most days.
3. The habit feeds what exists: levels, recipes, Plans, People.
4. Every post is a small, shareable invitation (slice 3).

## Non-goals

- A public or global feed. Posts stay inside Circles.
- Comments. "Ask how" opens the existing direct message request instead, which already has
  consent, blocks and moderation.
- Daily streaks, points for opening the app, guilt notifications.
- Video, multiple photos, filters, stories.

## Anti-goals (a failure even if it works)

- Home turning into an endless scroll that buries Plans.
- Photos leaking location (EXIF GPS) or reaching people outside the Circle.
- Engagement bait: counts that shame, red badges for reactions, notifications for every like.

## Slices

| Slice | What | Ships |
| --- | --- | --- |
| 1 | Cooked it posts, the Circle feed, reactions, Ask how, report, block, delete | now |
| 2 | Weekly Circle challenge and week streaks counting toward levels | next |
| 3 | Share card (image + web link) and a bring-a-friend seat on Plans | after |

## Slice 1 in detail

### What a member sees

**Share (composer, `/cook/new`).** Reached from the Home "+" button, which now opens a small
sheet with two rows: "Share what you cooked" (first) and "Start a Plan". Also from a Circle's
feed and from a recipe ("I cooked this"), which prefills the recipe.

One screen, top to bottom:
1. The photo, 4:5, full width with the screen's 20 pt gutter and the card radius. Empty state is
   a calm tile with "Add a photo" and two choices: Take a photo, Choose from library.
   A photo is required.
2. One line: "What did you make?" 140 characters, with a live count near the limit only.
3. Recipe (optional): a row that opens a picker of recipes the member can see; prefilled when
   started from a recipe.
4. Circle: a row with the Circle it goes to. Defaults to the member's most recent Circle; a
   member in one Circle sees it as plain text.
5. Photo description (optional, collapsed under "Describe the photo for screen readers").
6. Primary button "Share with {Circle}". A member in no Circle sees the composer's empty
   state: "Join a Circle to share what you cook", with a button to Explore Circles.

The photo is resized on the device to 1600 px on the long side and re-encoded as JPEG, which
drops EXIF (location, device). Upload shows progress in the button; failure keeps everything
and offers Retry.

**Feed card (one component, used in three places).**
- The photo, 4:5, card radius, no text over it except a small glass pill bottom-left with the
  recipe name when one is linked.
- Below: avatar initial + name + "· 2 h" on one line; the caption under it, up to 3 lines.
- One action row: "Yum" (a leaf icon, toggles, count beside it when > 0), "Ask how" (opens a
  direct message request prefilled with "How did you make your {caption}?"; hidden on your own
  posts), and "More" (Report, Block, and Delete on your own).
- Tapping the photo or caption opens the post on its own screen (`/cook/[id]`).

**Where the feed appears.**
- Home, under "Your Plans", a section "Cooked in your Circles" with a horizontal rail of the
  latest 10 posts (cards at 260 pt wide) and "See all". When there are none: one quiet card
  inviting the member to share the first. Plans keep the top of Home; the featured Plan stays.
- The Circle screen's existing Posts tab becomes the Circle feed: posts and recipes together,
  newest first, as full-width cards.
- `/cooks`: "See all" from Home, the full feed across your Circles, paged 20 at a time.

**Profile.** Your own profile gets "Cooked" with your count this month; the person profile
shows a member's recent posts only to people who share the Circle the post is in.

### Rules

- Only an active member of the Circle can post into it, and only members of that Circle can see
  the post. Leaving a Circle keeps your posts there; you can still delete them.
- Blocks hide posts both ways (the existing `hidden_by_block`).
- Up to 10 posts per member per 24 hours (rate check in the RPC).
- Caption 1 to 140 characters, trimmed. Photo description up to 200.
- A reaction is one per member per post; never your own post. The count is shown to everyone
  who can see the post. No notification per reaction. A daily line in the existing digest is a
  later decision.
- Delete is a hard delete of the row; the photo is removed from Storage by the worker.
  Account deletion removes all of a member's posts and photos the same way.
- Report target type `cook`; the staff console shows the photo and caption. Staff removal
  deletes the post and audits it.

### Data (Supabase)

- `cooks`: id, author_id, circle_id, recipe_id (nullable, must be visible to the author),
  caption, photo_path, photo_alt, width, height, created_at. RLS: no direct writes; select via
  a view.
- `cook_reactions`: cook_id, user_id, created_at; primary key both.
- `cook_cards` view (security definer, like `recipe_cards`): post, author name, Circle name,
  recipe title, reaction count, whether the viewer reacted. Filters to Circles the viewer is in
  and `not hidden_by_block(author_id)`.
- RPCs: `cook_create(circle_id, recipe_id, caption, photo_path, photo_alt, width, height, key)`,
  `cook_delete(id)`, `cook_react(id, on)`. Idempotency like every other write.
- Storage bucket `cook-photos`, private. Upload path `<uid>/<uuid>.jpg`; insert allowed only
  into your own folder, JPEG only, up to 2 MB. Read allowed when a `cook_cards` row with that
  path is visible to the caller (a security definer helper), so the app uses signed URLs made by
  the client (`createSignedUrls`, one call per page, 1 hour).
- `cook_photo_deletions` queue: photo paths to remove, written by delete, staff removal and
  account deletion; the existing push-dispatch worker also empties it through the Storage API.
- An upload that never becomes a post (abandoned composer) is removed by the daily cleanup after
  24 hours.

### Accessibility and quality bar

- Every control 44 pt, names and states set; "Yum" is a toggle with its count in the label.
- Photos carry the member's description, falling back to "Photo: {caption}".
- Text scales to 200%; the rail turns into a vertical list above 1.6x so cards stay readable.
- Reduce Motion: no spring on Yum, just the state change.
- Same tokens, card radius, shadows and type scale as Plan cards. No new colours.

## Slice 2 (outline)

Each Circle gets one challenge per week (a theme an owner or moderator sets, or a default from
a small rotating list). A post can be tagged to the week's challenge. The challenge card sits at
the top of the Circle feed with the posts so far and, when a host has one, the Plan that closes
the week. Week streaks ("4 weeks cooking with your Circle") count weeks with at least one post
and show as milestones on the profile. They never count toward hosting levels.

## Slice 3 (outline)

A share card: the post's photo with the caption and a small PlantCircle mark, exported as an
image with a link to a public web page for the recipe or Plan (never the post itself, which
stays private). A bring-a-friend seat: a guest who is going can reserve one extra spot for a
friend who joins through the web RSVP link.

## Changes after the Codex review (2026-11-15)

Codex challenged the first draft. What changed, and why:

1. **Uploads go through the `cook-upload` edge function**, never straight to Storage. It checks
   the bytes are a JPEG, removes every metadata segment (EXIF with GPS, XMP, IPTC, comments),
   checks the dimensions and size, and stores the photo plus a small thumbnail. A modified app
   cannot skip the stripping. The phone still resizes and re-encodes first, which also bakes in
   the rotation.
2. **Uploads are recorded** (`cook_uploads`). `cook_create` accepts only the caller's own upload,
   less than 12 hours old and not used before. Uploads unused after 24 hours are removed. Members
   get 30 uploads and 10 posts a day, and deleting a post does not give a post back.
3. **Photo removal has its own worker** (`cook-photo-cleanup`, every 10 minutes, claimed under a
   lease) instead of riding on push-dispatch, which stops early when no pushes are due.
4. **Signed URLs live 10 minutes.** Storage signs a URL only for someone who can see the post
   (or staff). After a block, a leave or sign-out the app drops its photo cache; a URL already
   handed out works until it expires, an accepted window.
5. **Staff removal hides, it does not delete.** The post and photo stay for 90 days as evidence
   for an appeal, visible only to staff, then go. The author's own delete is immediate.
6. **The feed shows posts only from active members** of active Circles, never across a block.
   A recipe can be linked only when it is shared in the same Circle, so everyone who sees the
   post can open it (the app cannot make recipes public, so nothing is lost).
7. **"Your posts" on your profile** lists every post of yours, including Circles you left, so you
   can always delete them.
8. **Home keeps Plans first.** The Cooked section sits under the featured Plan, as compact cards
   (square thumbnail, name, Circle) with a "Share yours" action, and ends rather than scrolls.
   The "+" button stays "Start a Plan". Share is reached from Home's section, a Circle's feed,
   and "I cooked this" on a recipe.
9. **Recipe labels sit under the photo**, not on it. The composer shows the destination Circle
   above the photo.
10. **"Ask how" opens the direct chat with an editable draft**, which also covers an existing
    conversation.
11. **Cooking is not a hosting level.** Slice 2's week streaks become milestones on your profile;
    hosting stays earned by hosting.
12. **Feeds page by cursor** (created_at, id), filtered by Circle before the limit, and use
    thumbnails in lists.

Left for later: Circle moderators removing posts, reaction notifications, video.

## Calls made by the engineer

- Posts live only in Circles; no public feed.
- A photo is required; it makes the feed worth looking at.
- No comments in v1; "Ask how" goes to direct messages.
- No reaction notifications.
- Home keeps Plans first; the feed is a section, not the whole screen.

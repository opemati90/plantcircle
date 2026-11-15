# Circle conversations: post kinds, comments, host removal (MVP)

Owner-approved 2026-11-16 ("do it", then "keep it simple for the MVP"): Circle posts grow from
photo-only "Cooked it" into a small discussion space for the Circle, without becoming a forum.

## Why

A Circle's Posts tab only takes photos of cooked food. Members also want to share tips, ask
questions and point to good shops and finds nearby, and to answer each other. Hosts need to keep
it friendly. Yum and Ask how stay exactly as they are (owner: "keep it").

## MVP scope

- Four post kinds: **Cooked** (photo required, as today), **Tip**, **Question**, **Find nearby**.
  The kind is a label; there are no extra fields. Photos optional except for Cooked.
- **Comments** on every post: flat, oldest first, 500 characters.
- **Host removal:** the Circle owner and moderators can remove a post or a comment.
- Newest first. Yum on every post; Ask how on Cooked posts.

## Not in the MVP

Pins, mutes, threads, comment reactions, mentions, edits, ranking or upvotes, polls, "Let's meet"
posts (Plans cover meetups), link previews, maps, text posts on Home (the "Cooked in your
Circles" rail stays photos).

## Rules

- **Who can write:** active members of the Circle (not suspended, not deleted, as every write).
  Posts keep today's daily limit; comments 60 a day.
- **Blocks:** hidden both ways, as posts are today.
- **Host removal** hides the post or comment for everyone except its author, who sees it marked
  "Removed by a host", and gets a notice. Audited. Hosts cannot remove content by the owner or
  other moderators (staff handle that through reports). Deleting your own post or comment stays
  possible.
- **Comment notice:** the post's author gets "New comment on your post" (in-app and push), with
  its own switch in Notifications, "Comments on your posts" (starts off for members who had
  turned off group chats). At most one per post every 10 minutes, never for their own comment,
  only while the author is still in the Circle. The comment's words never go into the push; the
  lock screen shows a generic line unless the member allowed message text there.
- **Reports:** comments can be reported like posts (report target `cook_comment`); staff
  decisions remove them like posts.
- **Challenge:** only Cooked posts can be challenge entries.

## Data (migration 20261112003700)

- `cooks.kind` (`cooked|tip|question|find`, default `cooked`); photo columns nullable with a
  check that Cooked has a photo; caption up to 140 for Cooked, 500 for the others;
  `cooks.host_removed_at`, `host_removed_by`.
- `cook_comments` (id, cook_id, author_id, body 1..500, created_at, host_removed_at/by,
  removed_at for staff decisions).
- RPCs: `cook_create` takes the kind; `cook_comment_add`, `cook_comment_delete` (own),
  `circle_post_remove`, `circle_comment_remove` (hosts). Views: `cook_cards` gains kind, comment
  count and `viewer_can_moderate`; `cook_comment_cards` lists one post's comments.

## App

- Composer: a kind chooser at the top (Cooked selected when opened from the challenge or the
  photo button); photo optional unless Cooked.
- Cards: Cooked as today; other kinds as a clean text card with the kind label, optional photo,
  Yum and the comment count.
- Post screen (`/cook/[id]`): the post, its comments, a comment bar; remove and report in the
  options sheet of the post and of each comment.
- All 8 languages; accessibility per docs/09; fixture backend in parity.

# Launch core: every Circle is a weekly cook club (2026-11-15)

Approved by the owner on 2026-11-15 ("implement this updated version which makes it
lightweight, useful and converting"). It narrows the MVP to one rhythm and hides the rest.

## Why

The app had grown to 55 screens with features competing for attention: group orders,
recipes, levels, People, waitlists, posts, chats. For launch, members should understand it in
one look and have a reason to come back every week.

## The rhythm

1. Monday: every Circle has a theme ("This week: lentils"), set by an owner or moderator or the
   week's suggested default.
2. During the week: members cook it at home and share a photo (Cooked it). Others say Yum or
   ask how.
3. The weekend: a member hosts the table, a cook-together Plan in person or online.

## What members see

- **4 tabs:** This week, Circles, Inbox, Profile.
- **This week (Home):** your Circle's challenge first (or an invitation to join a Circle), your
  Plans, what your Circles cooked, the table (the featured Plan of the week, "Cook together
  this week"), and more Plans near you. No filter chips.
- **Circles:** Circles first, Plans as the second section (the engineer's call: a member in a
  new city still needs to find Plans; Learn and People are hidden).
- **A Circle:** members land on Posts: the challenge card, Share what you cooked, the feed.
- **Profile:** your cooking weeks (weeks in a row you shared, best run, weeks in all) and where
  hosting stands, your posts, settings.

## Kept as they are

Joining a Plan, waitlist, change and cancel, check-in, chats, report and block, the staff
console, account and legal screens.

## Hidden at launch (switched off, not deleted)

`apps/mobile/src/lib/features.ts`: group orders, recipes as a section (reading a linked recipe
and "I cooked this" still work), People and connecting, the bring list, hosting levels in the
interface. The code, database and tests stay; journeys covering them switch them back on
(`enableAllFeatures` in `e2e/support.ts`).

## Hosting rule

Three posts open online Plans (up to 12 spots); an account two weeks old opens in-person Plans
too (up to 12). Staff-verified hosts keep up to 30. Removed posts do not count. Migration
`20261112003400_hosting_rule.sql`; the server enforces it on every Plan.

## Weekly challenge and cooking weeks

`2026-11-15-challenges-sharing-design.md` slices 2a and 2b, with the Codex review's changes: an
entry keeps the theme it was posted under; a post meant for a week that has ended is refused
(`challenge_ended`) rather than moved; cooking weeks are the member's own and never shown to
others; no badges at launch. Week boundaries: the Circle's time zone for challenges, UTC for
cooking weeks.

## Not in this launch

Friend spots, share cards and streak badges (designed, then deferred after the Codex review),
challenge notifications.

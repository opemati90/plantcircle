# Hosting levels, free city choice, and one list of Plans

Owner request (14 November 2026): hosting is earned by sharing recipes and by level; city
choice is simple and practical with no prebuilt list; no overkill between My Plans and Explore;
ideas to make the app more useful so people join and stay.

## 1. City: type it, don’t pick it

**Intent.** Nobody is forced onto a seeded list. A person types their city; if we know it, it
is suggested; if not, it is added on the spot. “Anywhere” (online and worldwide only) stays the
first option everywhere a city is chosen.

**Flow.** One search field. With nothing typed: “Anywhere” and, if set, the current city. While
typing: matching known cities (by city or country), country rows in Explore (“All in Germany”),
and, when no known city has that exact name, a final row “Use “Lagos””. Choosing that row
creates the city with the device’s country and time zone and selects it.

**Rules.** Cities stay rows (`cities`) because Plans, group orders and reminders need a time
zone and a country. New cities come from `city_ensure(name, country_code, tz)`, callable
before sign-up too (onboarding happens before an account exists). Names are unique per
country, case-insensitively. The device’s region and time zone are the defaults for a city
the person says they live in; the seeded list is only suggestions.

**Built later the same day:** a country choice (full ISO list) and, for another country, a time zone
choice when adding a city. **Not now.** Geocoding and “cities near me”. A staff merge tool for duplicates (“Köln”/“Cologne”)
is listed in open questions.

## 2. Hosting is earned: recipes and levels

**Intent.** A host has shown up in the community first. Requirements rise with reach, and the
next step is always visible so there is a reason to share.

| Level | Earned by | Unlocks |
| --- | --- | --- |
| 0 Member | account | join, cook along, share recipes |
| 1 Cook | 1 published recipe | host online Plans up to 6 spots |
| 2 Host | 3 recipes, 1 completed Plan with feedback, 10 followers | in-person Plans up to 12 spots, group orders |
| 3 Pillar | 100 followers, 2,000 upvotes on own recipes | capacity up to 30, featured in Explore (built: badge, listed first) |

Thresholds are data (`host_levels`), computed server-side by `profile_level()`, enforced in
`plan_create`, and shown on the profile with the next step (“2 more recipes to host in person”).
Followers and recipe upvotes are new, small social features: `follows` (People) and
`recipe_votes` (Learn). Level 3 is deliberately hard; Level 1 is one recipe so hosting starts the
same week.

## 3. My Plans and Explore: one list, two views

Explore is everything coming up (your city, other cities, online). My Plans is only what you
joined, wait for, or host. They show the same cards, which reads as duplication. Recommendation:
My Plans becomes the “Going” section at the top of Home and the tab bar drops to four. Explore
keeps search, filters and other cities. This is a layout change only; the data and RPCs stay.
Built 14 November 2026 (owner’s go): four tabs, “Your Plans” on Home, My Plans as a detail screen.

## 4. Making the app pull people in (ideas, not built)

- **Cook here.** Long-press an empty part of the week (or map, later) to start a Plan there with
  the area prefilled: empty space becomes an invitation.
- **Recipe → Plan.** Every recipe has “Cook this together”: a Plan prefilled with the recipe’s
  title, shopping list and time; the recipe author is credited and gains followers.
- **Bring a friend.** A shared link that puts the friend straight into the Plan as a guest (the
  web RSVP already exists); the host sees “Ama + 1”.
- **Weekly digest.** One push on Monday: “3 Plans near you this week, 2 online”; nothing else.
- **Streaks are not used.** They punish people who cook with others monthly; levels reward reach.

# 03 — Design system

Tokens: `design/tokens.json` (source) and `design/tokens.ts` (generated). Visual reference: `prototype-source/`.

## Principles
1. One job per screen, one primary action.
2. No boxes inside boxes — whitespace, type and icon tiles create hierarchy.
3. Three things above the fold; everything else a scroll or tap away.
4. Creation flows ask one question per screen with a thin progress bar.
5. Safety/legal text appears once, plainly, where it matters.
6. Photos carry emotion; type sits on a strong scrim (≥7:1).

## Layout
- Screen padding 24 (lists 20). Section gap 28 with a 1px `line` divider. Header: back/close circle (44) → title (30/700, tracking −0.9) → optional subtitle (17/400 secondary).
- Bottom action area: **FloatingActionBar** over a 150px white fade, inset 14px, radius 24, so content never shows through.
- Safe areas: respect top/bottom insets; tab bar floats 20pt above the home indicator.

## Components (props → behaviour → accessibility)

| Component | Variants / props | Behaviour | Accessibility |
| --- | --- | --- | --- |
| `Button` | primary (ink), secondary (fill), ghost, danger, disabled; full or inline; `loading` | min height 54 (compact 44); loading replaces label with spinner and keeps width | role button; disabled state announced; label never just an icon |
| `IconButton` | circle 44, fill or glass (on photos) | — | `accessibilityLabel` required |
| `Chip` | filter (single), toggle (multi), static status (gray/green/amber/red) | 44 min height when interactive | radio/checkbox semantics; `aria-pressed`/`selected` |
| `SegmentedControl` | 2–5 segments | white raised selected segment on fill | tablist/tab with selected state |
| `FactRow` | `lead` (DateTile / MapTile / IconTile / AvatarStack / HostAvatar / image), title, subtitle, optional `right` (PillButton) | 56px lead, 16px gap | read as one item: “title, subtitle” |
| `DateTile` | month, day | 56×56, green month band | decorative; date is in the title text |
| `MapTile` | — | stylised map + pin | decorative |
| `IconTile` | icon, `tone` neutral/green/red | 56 (or 40 compact) | decorative |
| `AvatarStack` | up to 3 initials/photos | — | decorative; count in text |
| `CapacityBar` | filled, total | 4px brand bar | `role=img` with “4 of 8 spots taken” |
| `PosterHero` | image, eyebrow, title, subtitle, back/share | 380–500px, scrim, glass buttons | image alt; title is H1 |
| `EventCard` | image, title, meta | 64px thumb, bordered card | one link |
| `Section` | title, children, first? | divider + 28 gap | H2 heading |
| `FloatingActionBar` | left summary + primary button, or stacked buttons | blur bar + white fade | stays above keyboard |
| `BottomSheet` | title, close | drag handle, 45% scrim, focus trapped | `role=dialog`, `aria-modal`, returns focus on close |
| `Switch` | on/off, locked (“Always on”) | 51×31, brand when on | `role=switch`, `aria-checked`; whole row is the target |
| `RadioCard` | icon, title, subtitle | 2px ink border when selected | radiogroup/radio |
| `Stepper` | value, min, max, step, unit | −/+ 44 targets | buttons labelled “More/Less …”; value `aria-live` |
| `TabBar` | 5 tabs | floating glass pill; active = black pill behind icon only, label below | `aria-current="page"` |
| `Toast` | error with Retry; success | top, auto-dismiss success only | `role=alert` / `status` |
| `Skeleton` | block, line, circle | shimmer off with Reduce Motion | `aria-busy` on container |
| `EmptyState` | anchor icon, title, text, actions | always offers a next step | — |
| `StatusPill` | going/waitlist/changed/cancelled/on hold | uppercase 13/700 | text, not colour alone |
| `AIBadge` | “Written with AI”, “Translated by AI” | green tint pill with spark | text label |

## Tab bar
Home · Explore · My Plans · Inbox · Profile. Hidden on detail and creation screens.

## Imagery
Real food and people photos (licensed or own). Every image needs alt text; decorative images use empty alt. Never put text in images.

## Dark mode
Not designed yet — v1 ships light only; tokens are named semantically so a dark palette can be added (open question).

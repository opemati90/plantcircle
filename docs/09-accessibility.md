# 09 — Accessibility

Target: **WCAG 2.2 AA everywhere, AAA where feasible**, EN 301 549 for EU, German BFSG once paid services launch. Known documented exception: the 2-hour waitlist offer (fairness) — mitigated with push + email.

## Build rules
- **Contrast:** use tokens only. Text ≥ 7:1 (AAA 1.4.6); UI component boundaries ≥ 3:1. Never `#8E8E93`-style light greys for text.
- **Text on photos:** always on the scrim token; test with the brightest photo.
- **Targets:** ≥ 44×44 pt (2.5.5). Spacing between targets ≥ 8.
- **Text size:** support Dynamic Type / Android font scale to 200% (1.4.4); layouts reflow, nothing clipped; test the tab bar labels and bottom bars.
- **Motion:** respect `AccessibilityInfo.isReduceMotionEnabled` — no shimmer, no parallax, instant transitions.
- **Semantics (React Native):** `accessibilityRole` (button, link, header, switch, radio, tab, checkbox, adjustable, alert), `accessibilityState` ({selected, checked, disabled, expanded}), `accessibilityLabel` for icon buttons, `accessibilityHint` sparingly. Group fact rows with `accessible` on the row.
- **Headings:** one H1 per screen (`accessibilityRole="header"`), sections as headers.
- **Live updates:** toasts `accessibilityLiveRegion="assertive"` (Android) / `AccessibilityInfo.announceForAccessibility` (iOS); counters polite.
- **Focus:** on navigation, focus moves to the screen title; sheets trap focus and return it on close.
- **Forms:** visible labels (not placeholders), errors in text next to the field and announced, no time limits on input.
- **Authentication:** no cognitive tests; one-time codes support autofill and paste (3.3.8/3.3.9).
- **Colour is never the only signal:** status pills have text; capacity bars have text.
- **Media:** alt text required on host uploads (AI suggests, person confirms); live classes require captions on (external tool setting in v1.1).
- **Language:** set `lang` per locale; user content keeps its language tag.
- **Web (Next.js, console):** keyboard operable, visible focus ring (token), skip link, landmarks.

## Test checklist per story
VoiceOver (iOS) · TalkBack (Android) · 200% text · Reduce Motion · keyboard (web) · axe/Lighthouse (web) ≥ 95 · colour-blind simulation on status screens.

## Before launch
External audit on real devices with assistive-technology users; publish the accessibility statement (screen in v1).

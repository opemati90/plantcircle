# PlantCircle brand assets

Exactly the logo from the existing design: the outlined **sprout** (thin round line, 24-unit grid, stroke 2) in PlantCircle green, next to **“PlantCircle”** in bold with tight tracking — the same proportions as the website nav (icon 26 · gap 8 · text 20, weight 700, −0.5 tracking). The app icon is the same flat green tile with the white sprout used in the app designs.

The wordmark uses **Inter Bold** (SIL Open Font License), converted to outlines. In the app and website the nav text renders in the system font (SF Pro on Apple devices); Apple doesn’t licence SF Pro for logos, so exported logo files use Inter, the closest free match.

Preview: `preview/brand-sheet.png`. Regenerate everything with `preview/build-assets.py`.

## Colours
| Name | Hex | Use |
| --- | --- | --- |
| Green | `#155A37` | Sprout on light, icon tile, brand surfaces (same as the app’s `brand` token) |
| Green tint | `#EAF5EE` | Light icon variant, soft brand backgrounds |
| Ink | `#0A0A0A` | Wordmark on light |
| White | `#FFFFFF` | Sprout and wordmark on green |

Green on white 8.2:1, white on green 8.2:1 (WCAG AAA).

## Folder map
| Folder | Contents |
| --- | --- |
| `logo/` | Horizontal + stacked logo, mark, wordmark — SVG default (on light), `-ondark`, `-black`, `-white`; PNG @1x/@2x/@3x; `plantcircle-app-icon.svg` (green tile) and `plantcircle-app-icon-light.svg` (tint tile) |
| `app/expo/` | `icon.png`, adaptive icon foreground/background/monochrome, `splash-icon.png` + `splash-icon-dark.png`, `notification-icon.png`, `favicon.png` |
| `app/ios/` | `AppIcon-1024.png` + `Contents.json` |
| `app/android/res/` | Mipmaps mdpi–xxxhdpi (legacy, round, adaptive layers incl. monochrome) + adaptive XML |
| `web/` | `favicon.svg/.ico/16/32/48`, `apple-touch-icon.png`, `icon-192/512`, maskable icon, `site.webmanifest`, `og-image.png` (1200×630), Safari pinned tab |
| `store/` | App Store icon 1024, Google Play icon 512, Play feature graphic 1024×500 |

Only the favicon and notification icon use a slightly heavier line (2.2–2.4 instead of 2) so the sprout stays legible at 16–24 px.

## Expo (`app.json`)
Copy `app/expo/*` into `apps/mobile/assets/`.
```json
{
  "expo": {
    "name": "PlantCircle",
    "icon": "./assets/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon-foreground.png",
        "backgroundColor": "#155A37",
        "monochromeImage": "./assets/adaptive-icon-monochrome.png"
      }
    },
    "web": { "favicon": "./assets/favicon.png" },
    "plugins": [
      ["expo-splash-screen", {
        "image": "./assets/splash-icon.png", "imageWidth": 140, "backgroundColor": "#FFFFFF",
        "dark": { "image": "./assets/splash-icon-dark.png", "backgroundColor": "#155A37" }
      }],
      ["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#155A37" }]
    ]
  }
}
```
Check the Expo docs for your SDK version’s exact plugin options.

## Website `<head>`
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#155A37">
<meta name="theme-color" content="#155A37">
<meta property="og:image" content="https://plantcircle.app/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

## Usage
- Minimum sizes: mark 16 px; horizontal logo 110 px wide. Clear space = the height of the sprout’s leaves.
- Default on white/light; `-ondark` on green or photos with a dark scrim; `-black`/`-white` for one colour.
- Don’t fill the leaves, change the line weight, stretch, rotate or recolour outside the palette.

## Source and trademark
The sprout comes from the open-source Lucide icon set (“sprout”, ISC licence) — free for commercial use; keep the ISC notice in your open-source credits. Because the shape is public, the full logo (sprout + wordmark) is the asset to protect. Run a trademark search before launch; “PlantCircle” is still a working name.

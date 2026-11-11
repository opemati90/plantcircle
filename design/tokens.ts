// Generated from design/tokens.json — do not edit by hand.
export const color = {
  ink: '#0A0A0A',
  secondary: '#505054',
  surface: '#FFFFFF',
  fill: '#F5F5F7',
  line: '#EDEDED',
  borderControl: '#8A8A8E',
  controlOff: '#767680',
  brand: '#155A37',
  brandTint: '#EAF5EE',
  warning: '#6B4000',
  warningTint: '#FFF6E5',
  danger: '#8C1D12',
  dangerTint: '#FDECEA',
  rating: '#B88400',
  scrimTop: 'rgba(0,0,0,0.35)',
  scrimBottom: 'rgba(0,0,0,0.94)',
  glass: 'rgba(20,20,20,0.42)',
  bar: 'rgba(255,255,255,0.86)',
} as const;

export const fontSize = {"caption": 13, "small": 14, "body": 15, "bodyLarge": 17, "title3": 20, "title2": 24, "title1": 30, "display": 34, "hero": 46} as const;
export const fontWeight = {"regular": "400", "medium": "500", "semibold": "600", "bold": "700"} as const;
export const lineHeight = {"tight": 1.08, "body": 1.5, "relaxed": 1.55} as const;
export const tracking = {"display": -1.0, "title": -0.6, "body": -0.2} as const;
export const space = {"1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "7": 28, "8": 32} as const;
export const radius = {"control": 12, "button": 16, "tile": 16, "card": 20, "hero": 24, "sheet": 28, "pill": 999} as const;
export const size = {"touchMin": 44, "buttonHeight": 54, "buttonCompact": 44, "tileLead": 56, "iconTileSmall": 40, "avatar": 44, "tabBarHeight": 72} as const;
export const motion = {"fast": 150, "base": 250, "slow": 350, "easing": "cubic-bezier(0.2, 0, 0, 1)"} as const;

export const tokens = { color, fontSize, fontWeight, lineHeight, tracking, space, radius, size, motion };
export type Tokens = typeof tokens;

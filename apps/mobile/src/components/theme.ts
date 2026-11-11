import { color, fontWeight, lineHeight } from '@plantcircle/tokens';
import type { TextStyle } from 'react-native';

export * from '@plantcircle/tokens';

/**
 * Colours used by the prototype that are not in design/tokens.json yet
 * (listed in docs/16-open-questions.md): avatar tints, the map tile, a few neutrals.
 */
export const extra = {
  bodyText: '#3A3A3C',
  sheetHandle: '#C7C7CC',
  hairlineOnPhoto: 'rgba(255,255,255,0.3)',
  glassLight: 'rgba(255,255,255,0.22)',
  tabBar: 'rgba(255,255,255,0.9)',
  scrim: 'rgba(10,10,10,0.45)',
  skeleton: '#EFEFF1',
  map: '#E9EEE6',
  mapPark: '#D5E4D0',
  cardBorder: '#E5E5EA',
  tints: [
    { background: '#E8E3DA', text: '#5A4A33' },
    { background: '#DCE6EE', text: '#2E4A60' },
    { background: '#E3ECE2', text: '#1E4D33' },
  ],
} as const;

export const shadow = {
  bar: '0px 10px 30px rgba(0,0,0,0.14)',
  nav: '0px 10px 30px rgba(0,0,0,0.12)',
  card: '0px 18px 40px rgba(30,20,10,0.18)',
  fab: '0px 10px 24px rgba(0,0,0,0.25)',
  toast: '0px 12px 30px rgba(0,0,0,0.3)',
} as const;

type Weight = keyof typeof fontWeight;

interface TypeOptions {
  color?: string;
  tracking?: number;
  /** Multiple of the font size (React Native needs an absolute line height). */
  leading?: number;
}

/** Text style in design units. Font scaling is left on so Dynamic Type works. */
export function type(
  size: number,
  weight: Weight = 'regular',
  options: TypeOptions = {},
): TextStyle {
  return {
    fontSize: size,
    fontWeight: fontWeight[weight],
    color: options.color ?? color.ink,
    ...(options.tracking === undefined ? {} : { letterSpacing: options.tracking }),
    ...(options.leading === undefined
      ? {}
      : { lineHeight: Math.round(size * options.leading) }),
  };
}

export const leading = lineHeight;

import type { TFunction } from 'i18next';

/**
 * The default weekly themes, in order. Every Circle has a challenge every week: without a theme
 * set by an owner or moderator, the week's default is shown (translated; the database keeps only
 * custom themes).
 */
export const CHALLENGE_THEMES = [
  'lentils',
  'greens',
  'onePot',
  'streetFood',
  'breakfast',
  'spice',
  'budget',
  'leftovers',
  'soup',
  'baking',
  'grains',
  'roots',
] as const;
export type ChallengeTheme = (typeof CHALLENGE_THEMES)[number];

/** A Monday every Circle agrees on, so every week maps to the same default everywhere. */
const EPOCH = Date.UTC(2026, 0, 5);

/** The default theme for the week starting on `weekStart` (YYYY-MM-DD, a Monday). */
export function defaultTheme(weekStart: string): ChallengeTheme {
  const weeks = Math.round((Date.parse(`${weekStart}T00:00:00Z`) - EPOCH) / (7 * 86_400_000));
  const index =
    ((weeks % CHALLENGE_THEMES.length) + CHALLENGE_THEMES.length) % CHALLENGE_THEMES.length;
  return CHALLENGE_THEMES[index] ?? 'lentils';
}

/** The theme to show: the owner's words, or the week's default in the member's language. */
export function themeLabel(t: TFunction, theme: string | null, weekStart: string): string {
  return theme ?? t(`cooks.themes.${defaultTheme(weekStart)}`);
}

/** Streak milestones, in weeks. Earned once, kept even when a streak ends. */
export const STREAK_MILESTONES = [4, 12, 26, 52] as const;

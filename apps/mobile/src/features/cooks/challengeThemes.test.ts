import { CHALLENGE_THEMES, defaultTheme } from './challengeThemes';

describe('defaultTheme', () => {
  it('moves through the themes week by week and wraps around', () => {
    expect(defaultTheme('2026-01-05')).toBe(CHALLENGE_THEMES[0]);
    expect(defaultTheme('2026-01-12')).toBe(CHALLENGE_THEMES[1]);
    expect(defaultTheme('2026-03-30')).toBe(CHALLENGE_THEMES[0]);
  });

  it('works for weeks before the reference Monday', () => {
    expect(defaultTheme('2025-12-29')).toBe(CHALLENGE_THEMES[CHALLENGE_THEMES.length - 1]);
  });
});

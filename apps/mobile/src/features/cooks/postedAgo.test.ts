import type { TFunction } from 'i18next';
import { postedAgo } from './postedAgo';

const t = ((key: string, options?: { count?: number }) =>
  options?.count === undefined ? key : `${key}:${options.count}`) as unknown as TFunction;
const now = new Date('2026-11-15T12:00:00Z');

describe('postedAgo', () => {
  it('counts minutes, hours and days, then shows the date after a week', () => {
    expect(postedAgo(t, '2026-11-15T11:59:30Z', now)).toBe('cooks.agoNow');
    expect(postedAgo(t, '2026-11-15T11:40:00Z', now)).toBe('cooks.agoMinutes:20');
    expect(postedAgo(t, '2026-11-15T10:00:00Z', now)).toBe('cooks.agoHours:2');
    expect(postedAgo(t, '2026-11-13T11:00:00Z', now)).toBe('cooks.agoDays:2');
    expect(postedAgo(t, '2026-11-01T12:00:00Z', now)).toBe('1 Nov');
  });

  it('treats a clock slightly behind the server as just now', () => {
    expect(postedAgo(t, '2026-11-15T12:00:20Z', now)).toBe('cooks.agoNow');
  });
});

import { zonedTimeToUtc } from '../../lib/dates';

/** Start times offered: 11:00 to 21:30, every half hour. Minutes from midnight. */
export const START_MINUTES = Array.from({ length: 22 }, (_, index) => 11 * 60 + index * 30);
export const DURATION_MINUTES = [90, 120, 180, 240] as const;
/** The day strip shows the next two weeks, in the city's own calendar. */
export const DAY_COUNT = 14;
/** A Plan must start at least this long from now (the server enforces the same rule). */
const LEAD_MS = 60 * 60 * 1000;

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/**
 * The calendar day `offset` days from `now`, as the city reads it. Days move on the calendar, not in
 * 24-hour steps, so a daylight-saving change never skips or repeats one.
 */
export function calendarDay(now: Date, offset: number, timeZone: string): CalendarDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shifted = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Characters as the database counts them (a code point, not a UTF-16 unit). */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** The same rule the database applies to a meeting link: https, a real host, under 500 characters. */
export function isMeetingUrl(text: string): boolean {
  return (
    Array.from(text).length <= 500 &&
    /^https:\/\/[^\s/?#@:]+\.[^\s/?#@:]+([/?#]\S*)?$/.test(text)
  );
}

/** The UTC instants for a day, a start time and a length, in the city's time zone. */
export function planWindow(
  day: CalendarDay,
  startMinutes: number,
  durationMinutes: number,
  timeZone: string,
): { startsAt: string; endsAt: string } {
  const start = zonedTimeToUtc(
    day.year,
    day.month,
    day.day,
    Math.floor(startMinutes / 60),
    startMinutes % 60,
    timeZone,
  );
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
  };
}

/** Whether a start time is far enough ahead to offer. */
export function startsSoonEnough(startsAt: string, now: Date): boolean {
  return Date.parse(startsAt) > now.getTime() + LEAD_MS;
}

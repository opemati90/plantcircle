/**
 * All Plan times are rendered in the Plan's own time zone, on a 24-hour clock,
 * using the active language's conventions ("Saturday, 7 November" / "Samstag, 7. November").
 */
let locale = 'en-GB';

/** Called by i18n whenever the language changes. */
export function setDateLocale(next: string): void {
  locale = next;
}

function part(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(new Date(iso));
}

export const monthShort = (iso: string, tz: string) =>
  part(iso, tz, { month: 'short' }).replace('.', '').toUpperCase();

export const dayOfMonth = (iso: string, tz: string) => part(iso, tz, { day: 'numeric' });

export const weekdayShort = (iso: string, tz: string) =>
  part(iso, tz, { weekday: 'short' }).replace('.', '');

export const weekdayLong = (iso: string, tz: string) => part(iso, tz, { weekday: 'long' });

export const time = (iso: string, tz: string) =>
  part(iso, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Saturday, 7 November" */
export function longDate(iso: string, tz: string): string {
  return `${weekdayLong(iso, tz)}, ${part(iso, tz, { day: 'numeric', month: 'long' })}`;
}

/** "17:00 – 20:30" */
export const timeRange = (startIso: string, endIso: string, tz: string) =>
  `${time(startIso, tz)} – ${time(endIso, tz)}`;

/** "Sun 13:00" */
export const shortWhen = (iso: string, tz: string) =>
  `${weekdayShort(iso, tz)} ${time(iso, tz)}`;

export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Which greeting fits the viewer's local time (the copy lives in the catalogue). */
export function dayPart(now: Date): DayPart {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** UTC instant for a wall-clock time in `timeZone` (used by fixtures and tests). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const shown = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(shown.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asUtc - guess));
}

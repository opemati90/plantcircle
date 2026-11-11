/** All Plan times are rendered in the Plan's own time zone, 24-hour clock. */
const LOCALE = 'en-GB';

function part(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, ...options }).format(new Date(iso));
}

export const monthShort = (iso: string, tz: string) =>
  part(iso, tz, { month: 'short' }).toUpperCase();

export const dayOfMonth = (iso: string, tz: string) => part(iso, tz, { day: 'numeric' });

export const weekdayShort = (iso: string, tz: string) => part(iso, tz, { weekday: 'short' });

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

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

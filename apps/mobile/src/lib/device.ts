import { getCalendars, getLocales } from 'expo-localization';

/**
 * Where the device says it is: the defaults for a city the person types in (design note §1).
 * The region is from the device locale; the time zone from the device calendar, then Intl.
 */
export function deviceRegionCode(): string {
  const code = getLocales()[0].regionCode ?? '';
  return /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : 'ZZ';
}

export function deviceTimeZone(): string {
  return (
    getCalendars()[0].timeZone ??
    (typeof Intl.DateTimeFormat === 'function'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : null) ??
    'UTC'
  );
}

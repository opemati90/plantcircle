import {
  dayOfMonth,
  dayPart,
  longDate,
  monthShort,
  setDateLocale,
  shortWhen,
  timeRange,
  zonedTimeToUtc,
} from './dates';

const BERLIN = 'Europe/Berlin';
// Saturday 7 November 2026, 17:00 in Berlin (CET, UTC+1).
const START = '2026-11-07T16:00:00.000Z';
const END = '2026-11-07T19:30:00.000Z';

describe('plan date formatting', () => {
  it('renders in the Plan time zone regardless of the viewer', () => {
    expect(longDate(START, BERLIN)).toBe('Saturday, 7 November');
    expect(timeRange(START, END, BERLIN)).toBe('17:00 – 20:30');
    expect(monthShort(START, BERLIN)).toBe('NOV');
    expect(dayOfMonth(START, BERLIN)).toBe('7');
    expect(shortWhen(START, BERLIN)).toBe('Sat 17:00');
  });

  it('rolls the date over when the zone is ahead of UTC', () => {
    expect(dayOfMonth('2026-11-07T23:30:00.000Z', BERLIN)).toBe('8');
    expect(timeRange('2026-11-07T23:00:00.000Z', '2026-11-08T00:30:00.000Z', BERLIN)).toBe(
      '00:00 – 01:30',
    );
  });
});

describe('zonedTimeToUtc', () => {
  it('handles winter and summer offsets', () => {
    expect(zonedTimeToUtc(2026, 11, 7, 17, 0, BERLIN).toISOString()).toBe(START);
    expect(zonedTimeToUtc(2026, 7, 4, 17, 0, BERLIN).toISOString()).toBe(
      '2026-07-04T15:00:00.000Z',
    );
  });
});

describe('dayPart', () => {
  it('follows the local hour', () => {
    expect(dayPart(new Date(2026, 10, 7, 8))).toBe('morning');
    expect(dayPart(new Date(2026, 10, 7, 14))).toBe('afternoon');
    expect(dayPart(new Date(2026, 10, 7, 20))).toBe('evening');
    expect(dayPart(new Date(2026, 10, 7, 2))).toBe('evening');
  });
});

describe('German formatting', () => {
  afterAll(() => {
    setDateLocale('en-GB');
  });

  it('uses German conventions without trailing dots in tiles', () => {
    setDateLocale('de-DE');
    expect(longDate(START, BERLIN)).toBe('Samstag, 7. November');
    expect(shortWhen(START, BERLIN)).toBe('Sa 17:00');
    expect(monthShort(START, BERLIN)).toBe('NOV');
    expect(timeRange(START, END, BERLIN)).toBe('17:00 – 20:30');
  });
});

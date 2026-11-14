import {
  calendarDay,
  characterCount,
  isMeetingUrl,
  planWindow,
  startsSoonEnough,
} from './rules';

describe('calendarDay', () => {
  it('reads the day in the city, not on the phone', () => {
    // 23:30 on 31 May in UTC is already 1 June in Berlin.
    const lateUtc = new Date('2030-05-31T23:30:00Z');
    expect(calendarDay(lateUtc, 0, 'Europe/Berlin')).toEqual({ year: 2030, month: 6, day: 1 });
    expect(calendarDay(lateUtc, 0, 'UTC')).toEqual({ year: 2030, month: 5, day: 31 });
  });

  it('moves by whole days', () => {
    const now = new Date('2030-06-01T12:00:00Z');
    expect(calendarDay(now, 3, 'Europe/Berlin')).toEqual({ year: 2030, month: 6, day: 4 });
  });
});

describe('planWindow', () => {
  it('turns a local start time into the right instant, through daylight saving', () => {
    // 18:00 in Berlin in June is 16:00 UTC (summer time).
    const window = planWindow({ year: 2030, month: 6, day: 1 }, 18 * 60, 120, 'Europe/Berlin');
    expect(window).toEqual({
      startsAt: '2030-06-01T16:00:00.000Z',
      endsAt: '2030-06-01T18:00:00.000Z',
    });
  });

  it('uses winter time in winter', () => {
    const window = planWindow({ year: 2030, month: 1, day: 15 }, 18 * 60, 90, 'Europe/Berlin');
    expect(window.startsAt).toBe('2030-01-15T17:00:00.000Z');
  });
});

describe('startsSoonEnough', () => {
  const now = new Date('2030-06-01T12:00:00Z');

  it('needs more than an hour to spare', () => {
    expect(startsSoonEnough('2030-06-01T13:30:00Z', now)).toBe(true);
    expect(startsSoonEnough('2030-06-01T13:00:00Z', now)).toBe(false);
  });
});

describe('calendarDay across daylight saving', () => {
  it('steps through the change without skipping or repeating a day', () => {
    // Berlin moves clocks forward on 28 March 2027. Each offset must land on the next calendar day.
    const now = new Date('2027-03-26T12:00:00Z');
    const days = [0, 1, 2, 3].map((offset) => calendarDay(now, offset, 'Europe/Berlin').day);
    expect(days).toEqual([26, 27, 28, 29]);
  });

  it('does the same at the autumn change', () => {
    const now = new Date('2027-10-29T12:00:00Z');
    const days = [0, 1, 2, 3].map((offset) => calendarDay(now, offset, 'Europe/Berlin').day);
    expect(days).toEqual([29, 30, 31, 1]);
  });
});

describe('characterCount', () => {
  it('counts a character the way the database does, not in UTF-16 units', () => {
    expect(characterCount('🌱🌱')).toBe(2);
    expect(characterCount('Soup')).toBe(4);
  });
});

describe('isMeetingUrl', () => {
  it('accepts a real https link', () => {
    expect(isMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
  });

  it('refuses http, a missing host, spaces, and anything over 500 characters', () => {
    expect(isMeetingUrl('http://meet.google.com/abc')).toBe(false);
    expect(isMeetingUrl('https://?')).toBe(false);
    expect(isMeetingUrl('https://meet')).toBe(false);
    expect(isMeetingUrl('https://meet.google.com/a b')).toBe(false);
    expect(isMeetingUrl('https://a.b@')).toBe(false);
    expect(isMeetingUrl('https://user@meet.google.com/x')).toBe(false);
    expect(isMeetingUrl(`https://meet.google.com/${'a'.repeat(500)}`)).toBe(false);
  });
});

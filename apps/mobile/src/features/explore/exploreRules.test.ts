import type { Plan } from '../../lib/backend/types';
import { activeFilterCount, filterPlans, matchesSearch, matchesWhen, NO_FILTERS, normalizeSearch, searchPlans } from './exploreRules';

const plan = (overrides: Partial<Plan>) =>
  ({
    id: 'p',
    title: 'West African Cooking Night',
    areaName: 'Neukölln',
    hostName: 'Ama O.',
    ...overrides,
  }) as Plan;

describe('normalizeSearch', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalizeSearch('  Neukölln   Potluck ')).toBe('neukolln potluck');
  });
});

describe('matchesSearch', () => {
  it('matches any word in the title, area or host, in any order', () => {
    const p = plan({});
    expect(matchesSearch(p, 'cooking west')).toBe(true);
    expect(matchesSearch(p, 'neukolln')).toBe(true);
    expect(matchesSearch(p, 'ama')).toBe(true);
  });

  it('needs every word to match', () => {
    expect(matchesSearch(plan({}), 'cooking potluck')).toBe(false);
  });

  it('shows everything for an empty query', () => {
    expect(matchesSearch(plan({}), '   ')).toBe(true);
  });
});

describe('searchPlans', () => {
  it('keeps the matching Plans in their order', () => {
    const plans = [
      plan({ id: 'a', title: 'Potluck in Kreuzberg' }),
      plan({ id: 'b', title: 'Vegan Ramen' }),
      plan({ id: 'c', title: 'Kreuzberg bread bake' }),
    ];
    expect(searchPlans(plans, 'kreuzberg').map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('filters', () => {
  const tz = 'Europe/Berlin';
  // Monday 2 November 2026, 19:00 Berlin.
  const now = new Date('2026-11-02T18:00:00Z');
  const base = {
    id: 'x', title: 'Soup', category: 'cooking_night', format: 'in_person', cityId: 'berlin', city: 'Berlin', areaName: 'Neukölln',
    venueName: null, areaHint: null, endsAt: '2026-11-02T22:00:00Z', revealAt: '2026-11-02T18:00:00Z', timezone: tz, capacity: 8,
    priceCents: 0, currency: 'EUR', description: '', allergens: null, imagePath: null, imageAlt: null, imageFocus: null, hostName: 'Ama',
    hostVerified: false, hostPlansCount: 1, goingCount: 0, attendeeInitials: [], openBringSlots: 0, waitlistCount: 0, hasOpenSpot: true,
  } as const;
  const at = (iso: string, extra: Partial<Plan> = {}): Plan => ({ ...base, startsAt: iso, ...extra }) as Plan;

  it('decides today, this week and the weekend on the viewer’s calendar', () => {
    const tonight = at('2026-11-02T19:30:00Z');
    const saturday = at('2026-11-07T16:00:00Z');
    const nextTuesday = at('2026-11-10T18:00:00Z');
    expect(matchesWhen(tonight, 'today', now, tz)).toBe(true);
    expect(matchesWhen(saturday, 'today', now, tz)).toBe(false);
    expect(matchesWhen(saturday, 'week', now, tz)).toBe(true);
    expect(matchesWhen(nextTuesday, 'week', now, tz)).toBe(false);
    // The week ends on Sunday: on a Sunday, next Friday is not this week.
    expect(matchesWhen(at('2026-11-13T18:00:00Z'), 'week', new Date('2026-11-08T12:00:00Z'), tz)).toBe(false);
    // Across the spring clock change the weekend is still Saturday and Sunday, not Monday.
    const dstEve = new Date('2026-03-28T22:30:00Z');
    expect(matchesWhen(at('2026-03-29T10:00:00Z'), 'weekend', dstEve, tz)).toBe(true);
    expect(matchesWhen(at('2026-03-30T10:00:00Z'), 'weekend', dstEve, tz)).toBe(false);
    expect(matchesWhen(saturday, 'weekend', now, tz)).toBe(true);
    expect(matchesWhen(tonight, 'weekend', now, tz)).toBe(false);
    // Past midnight UTC it is already the next day in Berlin for both: still "today" to the viewer.
    expect(matchesWhen(at('2026-11-02T23:30:00Z'), 'today', new Date('2026-11-02T23:00:00Z'), tz)).toBe(true);
    // While for a viewer in London that instant is still 2 November, and the Plan on the 3rd is tomorrow.
    expect(matchesWhen(at('2026-11-03T00:30:00Z'), 'today', new Date('2026-11-02T23:00:00Z'), 'Europe/London')).toBe(false);
  });

  it('filters where and price, and counts what is active', () => {
    const online = at('2026-11-03T18:00:00Z', { format: 'online', priceCents: 1200 });
    const free = at('2026-11-03T18:00:00Z');
    expect(filterPlans([online, free], { ...NO_FILTERS, where: 'online' }, now, tz)).toEqual([online]);
    expect(filterPlans([online, free], { ...NO_FILTERS, price: 'free' }, now, tz)).toEqual([free]);
    expect(filterPlans([online, free], { when: 'any', where: 'online', price: 'free' }, now, tz)).toEqual([]);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ when: 'today', where: 'any', price: 'paid' })).toBe(2);
  });
});

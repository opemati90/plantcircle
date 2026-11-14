import type { Plan } from '../../lib/backend/types';

export type ExploreTab = 'circles' | 'plans' | 'learn' | 'people';

/** Lower case, accents removed, single spaces: "Köln" and "koln" match. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Every word typed must appear in the Plan's title, area or host, in any order. */
export function matchesSearch(plan: Plan, query: string): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(`${plan.title} ${plan.areaName} ${plan.hostName}`);
  return words.every((word) => haystack.includes(word));
}

export const searchPlans = (plans: Plan[], query: string): Plan[] =>
  plans.filter((plan) => matchesSearch(plan, query));

// Filters (C18): when, where and price, as the Filters sheet offers them. Language waits for a
// language on Plans. Everything is decided on the device from the Plans already loaded.

export const WHEN_OPTIONS = ['any', 'today', 'week', 'weekend'] as const;
export const WHERE_OPTIONS = ['any', 'in_person', 'online'] as const;
export const PRICE_OPTIONS = ['any', 'free', 'paid'] as const;

export interface PlanFilters {
  when: (typeof WHEN_OPTIONS)[number];
  where: (typeof WHERE_OPTIONS)[number];
  price: (typeof PRICE_OPTIONS)[number];
}

export const NO_FILTERS: PlanFilters = { when: 'any', where: 'any', price: 'any' };

export const activeFilterCount = (filters: PlanFilters): number =>
  (filters.when === 'any' ? 0 : 1) +
  (filters.where === 'any' ? 0 : 1) +
  (filters.price === 'any' ? 0 : 1);

/** The viewer's calendar day for an instant: "today" and "this weekend" follow their clock. */
function dayKey(
  date: Date,
  timeZone: string,
): { key: string; weekday: number; ordinal: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  // Days counted on the calendar, so DST never shifts a date.
  const ordinal = Math.round(
    Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))) / 86_400_000,
  );
  return { key: `${get('year')}-${get('month')}-${get('day')}`, weekday, ordinal };
}

export function matchesWhen(
  plan: Plan,
  when: PlanFilters['when'],
  now: Date,
  timeZone: string,
): boolean {
  if (when === 'any') return true;
  const today = dayKey(now, timeZone);
  const day = dayKey(new Date(plan.startsAt), timeZone);
  const offset = day.ordinal - today.ordinal;
  if (when === 'today') return offset === 0;
  // The rest of this calendar week, Monday to Sunday, today included.
  if (when === 'week') {
    const daysToSunday = (7 - today.weekday) % 7;
    return offset >= 0 && offset <= daysToSunday;
  }
  // The coming Saturday and Sunday (or the Sunday that is today).
  const daysToSaturday = (6 - today.weekday + 7) % 7;
  return today.weekday === 0
    ? offset === 0
    : offset === daysToSaturday || offset === daysToSaturday + 1;
}

export const matchesWhere = (plan: Plan, where: PlanFilters['where']): boolean =>
  where === 'any' || plan.format === where;

export const matchesPrice = (plan: Plan, price: PlanFilters['price']): boolean =>
  price === 'any' || (price === 'free' ? plan.priceCents === 0 : plan.priceCents > 0);

export function filterPlans(
  plans: Plan[],
  filters: PlanFilters,
  now: Date,
  timeZone: string,
): Plan[] {
  return plans.filter(
    (plan) =>
      matchesWhen(plan, filters.when, now, timeZone) &&
      matchesWhere(plan, filters.where) &&
      matchesPrice(plan, filters.price),
  );
}

/** Words worth trying when nothing matched: the kinds of Plan the catalogue knows. */
export const TRY_INSTEAD = ['cooking', 'potluck', 'online', 'brunch'] as const;

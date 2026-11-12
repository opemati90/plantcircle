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

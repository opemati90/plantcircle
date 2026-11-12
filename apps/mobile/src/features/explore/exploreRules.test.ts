import type { Plan } from '../../lib/backend/types';
import { matchesSearch, normalizeSearch, searchPlans } from './exploreRules';

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

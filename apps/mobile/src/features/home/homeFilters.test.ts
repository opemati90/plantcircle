import type { Plan } from '../../lib/backend/types';
import { filterPlans } from './homeFilters';

const plans = [
  { id: 'a', category: 'cooking_class' },
  { id: 'b', category: 'potluck' },
  { id: 'c', category: 'online_class' },
  { id: 'd', category: 'social' },
] as Plan[];

const ids = (list: Plan[]) => list.map((plan) => plan.id);

describe('filterPlans', () => {
  it('keeps the original order within each filter', () => {
    expect(ids(filterPlans(plans, 'For you'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(filterPlans(plans, 'Cooking'))).toEqual(['a']);
    expect(ids(filterPlans(plans, 'Social'))).toEqual(['b', 'd']);
    expect(ids(filterPlans(plans, 'Online'))).toEqual(['c']);
  });
});

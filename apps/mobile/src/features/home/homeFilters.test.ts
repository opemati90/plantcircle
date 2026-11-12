import type { Plan } from '../../lib/backend/types';
import { filterPlans } from './homeFilters';

const plans = [
  { id: 'a', category: 'cooking_night' },
  { id: 'b', category: 'potluck' },
  { id: 'c', category: 'online_class' },
  { id: 'd', category: 'meetup' },
] as Plan[];

const ids = (list: Plan[]) => list.map((plan) => plan.id);

describe('filterPlans', () => {
  it('keeps the original order within each filter', () => {
    expect(ids(filterPlans(plans, 'forYou'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(filterPlans(plans, 'cooking'))).toEqual(['a']);
    expect(ids(filterPlans(plans, 'social'))).toEqual(['b', 'd']);
    expect(ids(filterPlans(plans, 'online'))).toEqual(['c']);
  });
});

import type { Plan } from '../../lib/backend/types';

export const HOME_FILTERS = ['For you', 'Cooking', 'Social', 'Online'] as const;
export type HomeFilter = (typeof HOME_FILTERS)[number];

const MATCHERS: Record<HomeFilter, (plan: Plan) => boolean> = {
  // Personalised ranking is not built; "For you" is everything this week.
  'For you': () => true,
  Cooking: (plan) => plan.category === 'cooking_class',
  Social: (plan) => plan.category === 'potluck' || plan.category === 'social',
  Online: (plan) => plan.category === 'online_class',
};

export const filterPlans = (plans: Plan[], filter: HomeFilter) =>
  plans.filter(MATCHERS[filter]);

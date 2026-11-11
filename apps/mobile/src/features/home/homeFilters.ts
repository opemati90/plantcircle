import type { Plan } from '../../lib/backend/types';

/** Stable ids; labels are `home.filters.<id>` in the copy catalogue. */
export const HOME_FILTERS = ['forYou', 'cooking', 'social', 'online'] as const;
export type HomeFilter = (typeof HOME_FILTERS)[number];

const MATCHERS: Record<HomeFilter, (plan: Plan) => boolean> = {
  // Personalised ranking is not built; "For you" is everything this week.
  forYou: () => true,
  cooking: (plan) => plan.category === 'cooking_class',
  social: (plan) => plan.category === 'potluck' || plan.category === 'social',
  online: (plan) => plan.category === 'online_class',
};

export const filterPlans = (plans: Plan[], filter: HomeFilter) =>
  plans.filter(MATCHERS[filter]);

import type { TFunction } from 'i18next';
import type { MyPlan } from '../../lib/backend/types';
import { localTime } from '../../lib/dates';
import type { StatusPill } from '../plans/PlanListItem';

export type MyPlansTab = 'going' | 'hosting' | 'past';

/**
 * The status chip on a Plan in My Plans. Past Plans are never "Going": the person
 * attended, so the chip says that instead.
 */
export function statusPill(t: TFunction, item: MyPlan, isPast: boolean): StatusPill {
  if (isPast) return { label: t('myPlans.pill.attended'), tone: 'neutral' };
  if (item.rsvp === 'going') return { label: t('myPlans.pill.going'), tone: 'positive' };
  if (item.rsvp === 'offered' && item.offerExpiresAt) {
    return {
      label: t('offer.homeLabel', { time: localTime(item.offerExpiresAt) }),
      tone: 'attention',
    };
  }
  return {
    // Ordinal wording ("2nd", "4th") comes from the catalogue's ordinal plural keys.
    label: t('myPlans.pill.waitlist', { count: item.waitlistPosition ?? 0, ordinal: true }),
    tone: 'neutral',
  };
}

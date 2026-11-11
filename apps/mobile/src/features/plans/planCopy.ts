import type { BackendErrorCode } from '../../lib/backend/backend';
import type { BringItem, Plan, PlanCategory } from '../../lib/backend/types';
import { time, weekdayLong } from '../../lib/dates';

const CATEGORY_LABELS: Record<PlanCategory, string> = {
  cooking_class: 'Cooking class',
  potluck: 'Potluck',
  social: 'Social',
  online_class: 'Online class',
};

export const categoryLabel = (category: PlanCategory) => CATEGORY_LABELS[category];

export const spotsLeft = (plan: Plan) => Math.max(plan.capacity - plan.goingCount, 0);

export const isFull = (plan: Plan) => spotsLeft(plan) === 0;

export function priceLabel(plan: Plan): string {
  if (plan.priceCents === 0) return 'Free';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: plan.currency }).format(
    plan.priceCents / 100,
  );
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function goingLabel(plan: Plan, isGoing: boolean): string {
  const count = plan.goingCount;
  if (isGoing) {
    const others = count - 1;
    if (others <= 0) return 'You’re going';
    return `You and ${others} ${plural(others, 'other', 'others')} are going`;
  }
  if (isFull(plan)) return `All ${plan.capacity} spots are taken`;
  if (count === 0) return 'Be the first to join';
  return `${count} ${plural(count, 'person is', 'people are')} going`;
}

export function spotsLabel(plan: Plan): string {
  const left = spotsLeft(plan);
  if (left === 0) return 'No spots left';
  return `${left} of ${plan.capacity} spots left`;
}

export function spotsLeftShort(plan: Plan): string {
  const left = spotsLeft(plan);
  if (left === 0) return 'Full';
  return `${left} ${plural(left, 'spot', 'spots')} left`;
}

/** The line under the neighbourhood: never reveals more than the viewer may see. */
export function addressNote(plan: Plan, isGoing: boolean, address: string | null): string {
  if (address) return address;
  const hint = plan.areaHint ? `${plan.areaHint} · ` : '';
  if (!isGoing) return `${hint}exact address after you join`;
  const when = `${weekdayLong(plan.revealAt, plan.timezone)}, ${time(plan.revealAt, plan.timezone)}`;
  return `Address unlocks ${when}${plan.areaHint ? ` · ${plan.areaHint}` : ''}`;
}

export function bringItemNote(item: BringItem): string {
  const open = item.quantity - item.claimedCount;
  if (open > 0) {
    return item.quantity === 1 ? 'Still open' : `${open} of ${item.quantity} still open`;
  }
  if (item.claimedByMe && item.claimedBy.length <= 1) return 'You’re bringing this';
  const names = item.claimedBy.join(', ');
  return `${names} ${plural(item.claimedBy.length, 'is', 'are')} bringing ${plural(item.quantity, 'this', 'these')}`;
}

/** Allergens the host has not confirmed are never presented as "none" or "safe". */
export function allergenNote(plan: Plan): string {
  return plan.allergens
    ? `${plan.allergens}, as declared by the host.`
    : 'not confirmed by the host. Ask before you eat.';
}

export function rsvpErrorCopy(code: BackendErrorCode): { title: string; detail: string } {
  switch (code) {
    case 'plan_full':
      return { title: 'This Plan just filled up', detail: 'Someone took the last spot' };
    case 'plan_ended':
      return { title: 'This Plan has ended', detail: 'You can’t join it any more' };
    case 'not_authenticated':
      return { title: 'You’ve been signed out', detail: 'Sign in again to join' };
    case 'rate_limited':
      return { title: 'Too many attempts', detail: 'Wait a moment and try again' };
    default:
      return { title: 'Couldn’t save your RSVP', detail: 'Your spot isn’t held yet' };
  }
}

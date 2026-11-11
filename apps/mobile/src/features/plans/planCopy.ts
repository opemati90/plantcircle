import type { TFunction } from 'i18next';
import type { BackendErrorCode } from '../../lib/backend/backend';
import type { BringItem, Plan } from '../../lib/backend/types';
import { time, weekdayLong } from '../../lib/dates';

// Pure rules that turn a Plan into the sentences shown about it. The words live
// in the copy catalogue; `t` is passed in so these stay testable.

export const categoryLabel = (t: TFunction, plan: Plan) => t(`plan.category.${plan.category}`);

export const spotsLeft = (plan: Plan) => Math.max(plan.capacity - plan.goingCount, 0);

export const isFull = (plan: Plan) => spotsLeft(plan) === 0;

export function priceLabel(t: TFunction, plan: Plan, language: string): string {
  if (plan.priceCents === 0) return t('plan.free');
  return new Intl.NumberFormat(language, { style: 'currency', currency: plan.currency }).format(
    plan.priceCents / 100,
  );
}

export function goingLabel(t: TFunction, plan: Plan, isGoing: boolean): string {
  const count = plan.goingCount;
  if (isGoing) {
    const others = count - 1;
    return others <= 0 ? t('plan.youreGoing') : t('plan.goingWithOthers', { count: others });
  }
  if (isFull(plan)) return t('plan.allTaken', { capacity: plan.capacity });
  if (count === 0) return t('plan.beFirst');
  return t('plan.goingCount', { count });
}

export function spotsLabel(t: TFunction, plan: Plan): string {
  const left = spotsLeft(plan);
  return left === 0 ? t('plan.noSpots') : t('plan.spotsOf', { left, capacity: plan.capacity });
}

export function spotsLeftShort(t: TFunction, plan: Plan): string {
  const left = spotsLeft(plan);
  return left === 0 ? t('plan.full') : t('plan.spotsLeft', { count: left });
}

/** The line under the neighbourhood: never reveals more than the viewer may see. */
export function addressNote(
  t: TFunction,
  plan: Plan,
  isGoing: boolean,
  address: string | null,
): string {
  if (address) return address;
  const hint = plan.areaHint;
  if (!isGoing) {
    return hint ? t('plan.addressAfterJoinHint', { hint }) : t('plan.addressAfterJoin');
  }
  const when = `${weekdayLong(plan.revealAt, plan.timezone)}, ${time(plan.revealAt, plan.timezone)}`;
  return hint
    ? t('plan.addressUnlocksHint', { when, hint })
    : t('plan.addressUnlocks', { when });
}

export function bringItemNote(t: TFunction, item: BringItem): string {
  if (item.claimedByMe) return t('plan.youBring');
  const open = item.quantity - item.claimedCount;
  if (open > 0) {
    return item.quantity === 1
      ? t('plan.stillOpen')
      : t('plan.openOf', { open, quantity: item.quantity });
  }
  return t('plan.bringing', { count: item.claimedBy.length, names: item.claimedBy.join(', ') });
}

/** Allergens the host has not confirmed are never presented as "none" or "safe". */
export function allergenNote(t: TFunction, plan: Plan): string {
  return plan.allergens
    ? t('plan.allergensDeclared', { allergens: plan.allergens })
    : t('plan.allergensUnknown');
}

export function rsvpErrorCopy(
  t: TFunction,
  code: BackendErrorCode,
): { title: string; detail: string } {
  const pick = (key: string) => ({
    title: t(`plan.error.${key}Title`),
    detail: t(`plan.error.${key}Detail`),
  });
  switch (code) {
    case 'plan_full':
      return pick('full');
    case 'plan_ended':
      return pick('ended');
    case 'not_authenticated':
      return pick('signedOut');
    case 'rate_limited':
      return pick('rate');
    default:
      return pick('rsvp');
  }
}

import type { TFunction } from 'i18next';
import type { BackendErrorCode } from '../../lib/backend/backend';
import type { BringItem, Plan } from '../../lib/backend/types';
import { time, weekdayLong } from '../../lib/dates';

// Pure rules that turn a Plan into the sentences shown about it. The words live
// in the copy catalogue; `t` is passed in so these stay testable.

export const categoryLabel = (t: TFunction, plan: Plan) => t(`plan.category.${plan.category}`);

export const spotsLeft = (plan: Plan) => Math.max(plan.capacity - plan.goingCount, 0);

/** No spot can be taken directly: either none is free, or people are already in line. */
export const isFull = (plan: Plan) => !plan.hasOpenSpot;

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

/** "4th" / "4." — a place in line, in the active language. */
export const placeInLine = (t: TFunction, position: number) =>
  t('plan.place', { count: position, ordinal: true });

/** Hours and minutes left, as "1:42". Never negative. */
export function timeLeft(expiresAt: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000),
  );
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Share of the 2-hour offer window still remaining, 0–1. */
export function offerFraction(expiresAt: string, now: Date): number {
  const left = new Date(expiresAt).getTime() - now.getTime();
  return Math.min(1, Math.max(0, left / (2 * 3_600_000)));
}

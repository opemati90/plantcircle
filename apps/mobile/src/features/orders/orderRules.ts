import type { GroupOrder, OrderItem } from '../../lib/backend/types';

/** Money as the reader's locale writes it, from minor units. */
export function money(minor: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency }).format(minor / 100);
}

/** The viewer's estimated total across items, in minor units; null when no item has a price. */
export function myEstimate(items: OrderItem[]): { minor: number; currency: string } | null {
  const priced = items.filter((i) => i.estPriceMinor !== null && i.mine > 0);
  if (priced.length === 0) return null;
  return {
    minor: priced.reduce((sum, i) => sum + Math.round((i.estPriceMinor ?? 0) * i.mine), 0),
    currency: priced[0]?.currency ?? 'EUR',
  };
}

/** A quantity formatted with its unit: "2 kg". */
export function amount(value: number, unit: string, language: string): string {
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

/** The unit shown for the whole order: the first item's, since v1 keeps one unit per order. */
export function orderUnit(order: GroupOrder): string {
  return order.items[0]?.unit ?? 'kg';
}

/** Progress toward the target, clamped to 100%. */
export function progress(order: GroupOrder): number {
  if (order.targetTotal <= 0) return 0;
  return Math.min(1, order.interestTotal / order.targetTotal);
}

/** Interest can still change while collecting or extended, before the close. */
export function canChangeInterest(order: GroupOrder, now: Date): boolean {
  return (
    (order.state === 'collecting' || order.state === 'extended') &&
    now.getTime() < Date.parse(order.closesAt)
  );
}

import type { TFunction } from 'i18next';
import type { Circle } from '../../lib/backend/types';

/** Where a Circle is, and how many people are in it, on one line. */
export function circleMeta(t: TFunction, circle: Circle): string {
  const where = circle.isGlobal ? t('circles.worldwide') : (circle.city ?? '');
  const count = t('circles.members', { count: circle.memberCount });
  return where ? `${where} · ${count}` : count;
}

/** What the viewer's standing is, for the status chip. */
export function circleStanding(
  t: TFunction,
  circle: Circle,
): { label: string; tone: 'positive' | 'neutral' } | null {
  if (circle.viewerRole) return { label: t('circles.member'), tone: 'positive' };
  if (circle.viewerRequestPending) return { label: t('circles.requested'), tone: 'neutral' };
  return null;
}

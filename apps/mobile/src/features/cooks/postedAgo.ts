import type { TFunction } from 'i18next';
import { dayMonth } from '../../lib/dates';

/**
 * How long ago a post was shared ("2 h ago"), from the copy catalogue: Hermes has no
 * Intl.RelativeTimeFormat. After a week, the date.
 */
export function postedAgo(t: TFunction, iso: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (seconds < 60) return t('cooks.agoNow');
  if (seconds < 3600) return t('cooks.agoMinutes', { count: Math.round(seconds / 60) });
  if (seconds < 86_400) return t('cooks.agoHours', { count: Math.round(seconds / 3600) });
  if (seconds < 7 * 86_400) return t('cooks.agoDays', { count: Math.floor(seconds / 86_400) });
  return dayMonth(iso);
}

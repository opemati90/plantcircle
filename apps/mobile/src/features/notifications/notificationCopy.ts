import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import type { AppNotification } from '../../lib/backend/types';

const str = (payload: Record<string, unknown>, key: string): string => {
  const v = payload[key];
  return typeof v === 'string' ? v : '';
};

/** The Inbox line for a notification: a title, a note, and where it leads. */
export function describeNotification(t: TFunction, n: AppNotification): { title: string; note: string; href: Href | null } {
  const p = n.payload;
  const planHref = (id: string): Href | null => (id ? { pathname: '/plan/[id]', params: { id } } : null);
  const withId = (id: string, href: Href): Href | null => (id ? href : null);
  switch (n.type) {
    case 'rsvp_confirmed':
      return { title: t('notify.rsvpConfirmed', { plan: str(p, 'plan') }), note: t('notify.rsvpConfirmedNote'), href: planHref(str(p, 'plan_id')) };
    case 'reminder_day_before':
      return { title: t('notify.reminderDayBefore', { plan: str(p, 'plan'), time: str(p, 'time') }), note: t('notify.reminderNote'), href: planHref(str(p, 'plan_id')) };
    case 'address_unlocked':
      return { title: t('notify.addressUnlocked', { plan: str(p, 'plan') }), note: t('notify.addressUnlockedNote'), href: planHref(str(p, 'plan_id')) };
    case 'waitlist_offer':
      return { title: t('notify.waitlistOffer', { plan: str(p, 'plan') }), note: t('notify.waitlistOfferNote'), href: withId(str(p, 'plan_id'), { pathname: '/plan/[id]/waitlist-offer', params: { id: str(p, 'plan_id') } }) };
    case 'plan_changed':
      return { title: t('notify.planChanged', { plan: str(p, 'plan'), time: str(p, 'time') }), note: t('notify.planChangedNote'), href: planHref(str(p, 'plan_id')) };
    case 'plan_cancelled':
      return { title: t('notify.planCancelled', { plan: str(p, 'plan') }), note: t('notify.planCancelledNote'), href: planHref(str(p, 'plan_id')) };
    case 'plan_on_hold':
      return { title: t('notify.planOnHold', { plan: str(p, 'plan') }), note: t('notify.planOnHoldNote'), href: planHref(str(p, 'plan_id')) };
    case 'message_request':
      return { title: t('notify.messageRequest', { name: str(p, 'name') }), note: t('notify.messageRequestNote'), href: '/messages/requests' };
    case 'circle_approved':
      return { title: t('notify.circleApproved', { circle: str(p, 'circle') }), note: t('notify.circleApprovedNote'), href: withId(str(p, 'circle_id'), { pathname: '/circle/[id]', params: { id: str(p, 'circle_id') } }) };
    case 'order_decision':
      return { title: t('notify.orderDecision', { order: str(p, 'order') }), note: t(`notify.orderState.${str(p, 'state') || 'locked'}`), href: withId(str(p, 'plan_id'), { pathname: '/order/[id]', params: { id: str(p, 'plan_id') } }) };
    case 'order_ready':
      return { title: t('notify.orderReady', { order: str(p, 'order') }), note: t('notify.orderReadyNote'), href: withId(str(p, 'plan_id'), { pathname: '/order/[id]/pickup', params: { id: str(p, 'plan_id') } }) };
    case 'report_update':
      return { title: t('notify.reportUpdate', { ref: str(p, 'case_ref') }), note: t(`notify.reportStatus.${str(p, 'status') || 'open'}`), href: null };
    case 'moderation_notice':
      return {
        title: t('notify.moderationNotice'),
        note: t(`notify.moderationAction.${['warn', 'freeze_messages', 'remove_content', 'suspend', 'ban'].includes(str(p, 'action')) ? str(p, 'action') : 'other'}`),
        // Only a pause or a freeze has a notice screen; the rest is said here.
        href: ['suspend', 'ban', 'freeze_messages'].includes(str(p, 'action')) ? '/suspended' : null,
      };
    default:
      return { title: t('notify.generic'), note: '', href: null };
  }
}

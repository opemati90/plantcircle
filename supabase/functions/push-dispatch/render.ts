// Push text in the member's language, from the copy catalogues (copy.json, generated from
// packages/copy by apps/mobile/src/features/notifications/pushCopy.test.ts). The mapping from a
// notification type to its messages mirrors apps/mobile/src/features/notifications/notificationCopy.ts;
// a jest test there keeps the two in step. Plain TypeScript: no Deno or Node globals.

type Messages = Record<string, unknown>;
export type Copy = Record<string, { notify: Messages; appName: string }>;
type Payload = Record<string, unknown>;

const str = (p: Payload, key: string): string =>
  typeof p[key] === 'string' ? (p[key] as string) : '';
const num = (p: Payload, key: string): number =>
  typeof p[key] === 'number' ? (p[key] as number) : 0;

/** i18next's plural suffixes through Intl.PluralRules; `_other` is the fallback. */
function lookup(notify: Messages, key: string): string | undefined {
  const direct = notify[key];
  if (typeof direct === 'string') return direct;
  // Nested blocks (orderState.locked) are objects in the catalogue.
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      notify,
    );
  return typeof value === 'string' ? value : undefined;
}

function message(
  notify: Messages,
  language: string,
  key: string,
  vars: Record<string, string | number>,
): string {
  let template = lookup(notify, key);
  if (typeof vars['count'] === 'number') {
    let form = 'other';
    try {
      form = new Intl.PluralRules(language).select(vars['count']);
    } catch {
      form = 'other';
    }
    template = lookup(notify, `${key}_${form}`) ?? lookup(notify, `${key}_other`) ?? template;
  }
  if (template === undefined) return '';
  return template.replace(/\{\{\s*(\w+)(?:,\s*number)?\s*\}\}/g, (_m, name: string) => {
    const v = vars[name];
    if (typeof v === 'number') {
      try {
        return new Intl.NumberFormat(language).format(v);
      } catch {
        return String(v);
      }
    }
    return v === undefined ? '' : String(v);
  });
}

/** Title and body for a push, or null when the type is not in the catalogue (the caller falls back). */
export function renderPush(
  copy: Copy,
  language: string,
  type: string,
  p: Payload,
  lockScreenText: boolean,
  stored: { title: string; body: string },
): { title: string; body: string } | null {
  const pack = copy[language] ?? copy['en'];
  if (!pack) return null;
  const n = pack.notify;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    message(n, language, key, vars);
  // A message: the sender's name and, with lock-screen text on, the snippet notify() stored.
  if (type === 'new_message') {
    return { title: stored.title, body: lockScreenText ? stored.body : t('newMessageGeneric') };
  }
  switch (type) {
    case 'weekly_digest': {
      const inCity = num(p, 'in_city');
      const online = num(p, 'online');
      return {
        title:
          inCity > 0 && str(p, 'city')
            ? t('weeklyDigest', { count: inCity, city: str(p, 'city') })
            : t('weeklyDigestOnline', { count: online }),
        body: inCity > 0 ? t('weeklyDigestNote', { count: online }) : t('weeklyDigestNoteHome'),
      };
    }
    case 'rsvp_confirmed':
      return {
        title: t('rsvpConfirmed', { plan: str(p, 'plan') }),
        body: t('rsvpConfirmedNote'),
      };
    case 'reminder_day_before':
      return {
        title: t('reminderDayBefore', { plan: str(p, 'plan'), time: str(p, 'time') }),
        body: t('reminderNote'),
      };
    case 'reminder_2h':
      return {
        title: t('reminder2h', { plan: str(p, 'plan'), time: str(p, 'time') }),
        body: t('reminderNote'),
      };
    case 'address_unlocked':
      return {
        title: t('addressUnlocked', { plan: str(p, 'plan') }),
        body: t('addressUnlockedNote'),
      };
    case 'waitlist_offer':
      return {
        title: t('waitlistOffer', { plan: str(p, 'plan') }),
        body: t('waitlistOfferNote'),
      };
    case 'waitlist_expired':
      return {
        title: t('waitlistExpired', { plan: str(p, 'plan') }),
        body: t('waitlistExpiredNote'),
      };
    case 'plan_changed':
      return {
        title: t('planChanged', { plan: str(p, 'plan'), time: str(p, 'time') }),
        body: t('planChangedNote'),
      };
    case 'plan_cancelled':
      return {
        title: t('planCancelled', { plan: str(p, 'plan') }),
        body: t('planCancelledNote'),
      };
    case 'plan_on_hold':
      return { title: t('planOnHold', { plan: str(p, 'plan') }), body: t('planOnHoldNote') };
    case 'message_request':
      return {
        title: t('messageRequest', { name: str(p, 'name') }),
        body: t('messageRequestNote'),
      };
    case 'circle_approved':
      return {
        title: t('circleApproved', { circle: str(p, 'circle') }),
        body: t('circleApprovedNote'),
      };
    case 'order_closing':
      return {
        title: t('orderClosing', { order: str(p, 'order') }),
        body: t('orderClosingNote'),
      };
    case 'order_decision':
      return {
        title: t('orderDecision', { order: str(p, 'order') }),
        body: t(`orderState.${str(p, 'state') || 'locked'}`),
      };
    case 'order_ready':
      return { title: t('orderReady', { order: str(p, 'order') }), body: t('orderReadyNote') };
    case 'report_update':
      return {
        title: t('reportUpdate', { ref: str(p, 'case_ref') }),
        body: t(`reportStatus.${str(p, 'status') || 'open'}`),
      };
    case 'moderation_notice': {
      const action = str(p, 'action');
      const known = ['warn', 'freeze_messages', 'remove_content', 'suspend', 'ban'].includes(
        action,
      );
      return {
        title: t('moderationNotice'),
        body: t(`moderationAction.${known ? action : 'other'}`),
      };
    }
    default:
      return null;
  }
}

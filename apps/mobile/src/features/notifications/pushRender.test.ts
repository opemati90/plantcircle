import type { TFunction } from 'i18next';
import i18next from 'i18next';
import { catalogs } from '@plantcircle/copy';
import { renderPush, type Copy } from '../../../../../supabase/functions/push-dispatch/render';
import { describeNotification } from './notificationCopy';

/** push-dispatch renders the same title as the Inbox, in every language, for every shared type. */
const copy = Object.fromEntries(
  Object.entries(catalogs).map(([l, c]) => [l, { notify: c.notify, appName: 'PlantCircle' }]),
) as Copy;

const cases: { type: string; payload: Record<string, unknown> }[] = [
  { type: 'weekly_digest', payload: { in_city: 3, online: 2, city: 'Berlin' } },
  { type: 'weekly_digest', payload: { in_city: 0, online: 1, city: '' } },
  { type: 'rsvp_confirmed', payload: { plan: 'Lentil night', plan_id: 'x' } },
  {
    type: 'reminder_day_before',
    payload: { plan: 'Lentil night', time: '18:00', plan_id: 'x' },
  },
  { type: 'address_unlocked', payload: { plan: 'Lentil night', plan_id: 'x' } },
  { type: 'waitlist_offer', payload: { plan: 'Lentil night', plan_id: 'x' } },
  { type: 'plan_changed', payload: { plan: 'Lentil night', time: '19:00', plan_id: 'x' } },
  { type: 'plan_cancelled', payload: { plan: 'Lentil night', plan_id: 'x' } },
  { type: 'plan_on_hold', payload: { plan: 'Lentil night', plan_id: 'x' } },
  { type: 'message_request', payload: { name: 'Ama' } },
  { type: 'circle_approved', payload: { circle: 'Kitchen', circle_id: 'c' } },
  { type: 'order_decision', payload: { order: 'Chickpeas', state: 'extended', plan_id: 'x' } },
  { type: 'order_ready', payload: { order: 'Chickpeas', plan_id: 'x' } },
  { type: 'report_update', payload: { case_ref: 'PC-1', status: 'triaged' } },
  { type: 'moderation_notice', payload: { action: 'warn' } },
];

describe.each(Object.keys(catalogs))('push text in %s', (language) => {
  let t: TFunction;
  beforeAll(async () => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: language,
      resources: Object.fromEntries(
        Object.entries(catalogs).map(([l, c]) => [l, { translation: c }]),
      ),
      interpolation: { escapeValue: false },
    });
    t = instance.t;
  });
  it.each(cases)('$type matches the Inbox', ({ type, payload }) => {
    const push = renderPush(copy, language, type, payload, true, { title: 'x', body: 'y' });
    const inbox = describeNotification(t, {
      id: 'n',
      type,
      payload,
      createdAt: '',
      readAt: null,
    });
    expect(push).not.toBeNull();
    expect(push?.title).toBe(inbox.title);
    expect(push?.body).toBe(inbox.note);
  });
  it('keeps a message off the lock screen unless asked, and knows the push-only types', () => {
    const quiet = renderPush(copy, language, 'new_message', {}, false, {
      title: 'Ama',
      body: 'hi',
    });
    expect(quiet?.title).toBe('Ama');
    expect(quiet?.body).toBe(catalogs[language as 'en'].notify.newMessageGeneric);
    expect(
      renderPush(copy, language, 'new_message', {}, true, { title: 'Ama', body: 'hi' })?.body,
    ).toBe('hi');
    expect(
      renderPush(copy, language, 'reminder_2h', { plan: 'P', time: '18:00' }, true, {
        title: '',
        body: '',
      })?.title,
    ).toContain('18:00');
    expect(
      renderPush(copy, language, 'order_closing', { order: 'O' }, true, { title: '', body: '' })
        ?.title,
    ).toContain('O');
    expect(
      renderPush(copy, language, 'something_else', {}, true, { title: '', body: '' }),
    ).toBeNull();
  });
});

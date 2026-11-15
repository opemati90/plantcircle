const mockStore = new Map<string, string>();
jest.mock('./storage', () => ({
  appStorage: {
    get: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
    set: (k: string, v: string) => {
      mockStore.set(k, v);
      return Promise.resolve();
    },
    remove: (k: string) => {
      mockStore.delete(k);
      return Promise.resolve();
    },
  },
}));
let mockN = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${String((mockN += 1))}` }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.2.0' } }));
jest.mock('./i18n', () => ({ currentLanguage: () => 'en' }));

import { Platform } from 'react-native';
import {
  flush,
  forgetAnalytics,
  pendingEvents,
  setAnalyticsConsent,
  track,
  whenAnalyticsReady,
} from './analytics';

const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
  fetchMock.mockClear();
  mockStore.clear();
  await setAnalyticsConsent(null, false);
});

describe('analytics', () => {
  it('records nothing before consent, and never replays it after a yes', async () => {
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
    await setAnalyticsConsent('user-1', true);
    expect(pendingEvents()).toHaveLength(0);
    track('cook_shared', { challenge: true });
    expect(pendingEvents()).toHaveLength(1);
  });

  it('stops at once on a no, empties the queue and forgets the id', async () => {
    await setAnalyticsConsent('user-1', true);
    track('cook_reacted', {});
    const id = mockStore.get('pc.analytics.id.user-1');
    expect(id).toBeTruthy();
    await setAnalyticsConsent('user-1', false);
    expect(pendingEvents()).toHaveLength(0);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
    // The bridge forgets the id once the server has recorded it for deletion.
    await forgetAnalytics('user-1');
    expect(mockStore.has('pc.analytics.id.user-1')).toBe(false);
    await setAnalyticsConsent('user-1', true);
    expect(mockStore.get('pc.analytics.id.user-1')).not.toBe(id);
  });

  it('sends to the EU endpoint with a random id, the listed properties and location lookup off', async () => {
    await setAnalyticsConsent('user-1', true);
    track('rsvp_joined', { state: 'going' });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://eu.i.posthog.com/batch/');
    const body = JSON.parse(init.body) as {
      batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[];
    };
    const [sent] = body.batch;
    expect(sent?.event).toBe('rsvp_joined');
    expect(sent?.distinct_id).not.toBe('user-1');
    expect(sent?.properties).toEqual({
      platform: Platform.OS,
      app_version: '0.2.0',
      language: 'en',
      $geoip_disable: true,
      state: 'going',
    });
  });

  it('never switches on after a "no" that arrives while the id is still being read', async () => {
    const starting = setAnalyticsConsent('user-1', true);
    await setAnalyticsConsent('user-1', false);
    await starting;
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
  });

  it('never carries one account’s waiting events into another’s', async () => {
    await setAnalyticsConsent('user-1', true);
    track('cook_reacted', {});
    await setAnalyticsConsent('user-2', true);
    expect(pendingEvents()).toHaveLength(0);
  });

  it('records a visit made before consent loaded only once a yes is confirmed', async () => {
    whenAnalyticsReady(() => {
      track('circle_invite_opened', {});
    });
    expect(pendingEvents()).toHaveLength(0);
    await setAnalyticsConsent('user-1', true);
    expect(pendingEvents()).toHaveLength(1);
    whenAnalyticsReady(() => {
      track('circle_invite_opened', {});
    });
    await setAnalyticsConsent('user-1', false);
    await setAnalyticsConsent('user-1', true);
    expect(pendingEvents()).toHaveLength(0);
  });

  it('sends nothing at all without a project key', async () => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    await setAnalyticsConsent('user-1', true);
    track('cook_reacted', {});
    await flush();
    expect(pendingEvents()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps accounts on a shared phone apart, and forgets an account that is deleted', async () => {
    await setAnalyticsConsent('user-1', true);
    await setAnalyticsConsent('user-2', true);
    expect(mockStore.get('pc.analytics.id.user-1')).not.toBe(
      mockStore.get('pc.analytics.id.user-2'),
    );
    await forgetAnalytics('user-2');
    expect(mockStore.has('pc.analytics.id.user-2')).toBe(false);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
  });
});

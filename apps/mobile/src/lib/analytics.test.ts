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
  AnalyticsIdRetired,
  flush,
  forgetAnalytics,
  pendingEvents,
  setAnalyticsConsent,
  track,
  whenAnalyticsReady,
} from './analytics';

/** The server accepts the id. */
const registered = () => Promise.resolve();

const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
  fetchMock.mockClear();
  mockStore.clear();
  await setAnalyticsConsent(null, false, registered);
});

describe('analytics', () => {
  it('records nothing before consent, and never replays it after a yes', async () => {
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
    await setAnalyticsConsent('user-1', true, registered);
    expect(pendingEvents()).toHaveLength(0);
    track('cook_shared', { challenge: true });
    expect(pendingEvents()).toHaveLength(1);
  });

  it('stops at once on a no, empties the queue and forgets the id', async () => {
    await setAnalyticsConsent('user-1', true, registered);
    track('cook_reacted', {});
    const id = mockStore.get('pc.analytics.id.user-1');
    expect(id).toBeTruthy();
    await setAnalyticsConsent('user-1', false, registered);
    expect(pendingEvents()).toHaveLength(0);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
    // The bridge forgets the id once the server has recorded it for deletion.
    await forgetAnalytics('user-1');
    expect(mockStore.has('pc.analytics.id.user-1')).toBe(false);
    await setAnalyticsConsent('user-1', true, registered);
    expect(mockStore.get('pc.analytics.id.user-1')).not.toBe(id);
  });

  it('sends to the EU endpoint with a random id, the listed properties and location lookup off', async () => {
    await setAnalyticsConsent('user-1', true, registered);
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
    const starting = setAnalyticsConsent('user-1', true, registered);
    await setAnalyticsConsent('user-1', false, registered);
    await starting;
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
  });

  it('never carries one account’s waiting events into another’s', async () => {
    await setAnalyticsConsent('user-1', true, registered);
    track('cook_reacted', {});
    await setAnalyticsConsent('user-2', true, registered);
    expect(pendingEvents()).toHaveLength(0);
  });

  it('records a visit made before consent loaded only once a yes is confirmed', async () => {
    whenAnalyticsReady(() => {
      track('circle_invite_opened', {});
    });
    expect(pendingEvents()).toHaveLength(0);
    await setAnalyticsConsent('user-1', true, registered);
    expect(pendingEvents()).toHaveLength(1);
    whenAnalyticsReady(() => {
      track('circle_invite_opened', {});
    });
    await setAnalyticsConsent('user-1', false, registered);
    await setAnalyticsConsent('user-1', true, registered);
    expect(pendingEvents()).toHaveLength(0);
  });

  it('registers the id with the server first, and stays off if that fails', async () => {
    const register = jest.fn(() => Promise.reject(new Error('offline')));
    await setAnalyticsConsent('user-1', true, register);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
    const id = mockStore.get('pc.analytics.id.user-1');
    expect(register).toHaveBeenCalledWith(id);
    const ok = jest.fn(() => Promise.resolve());
    await setAnalyticsConsent('user-1', true, ok);
    expect(ok).toHaveBeenCalledWith(id);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(1);
  });

  it('starts a fresh id when the server has retired this one (deleted on another device)', async () => {
    await setAnalyticsConsent('user-1', true, registered);
    const old = mockStore.get('pc.analytics.id.user-1');
    await setAnalyticsConsent('user-1', false, registered);
    const register = jest.fn((id: string) =>
      id === old ? Promise.reject(new AnalyticsIdRetired()) : Promise.resolve(),
    );
    await setAnalyticsConsent('user-1', true, register);
    const fresh = mockStore.get('pc.analytics.id.user-1');
    expect(fresh).not.toBe(old);
    expect(register).toHaveBeenLastCalledWith(fresh);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(1);
  });

  it('while on, re-checks the id on each refresh and starts over if it was retired', async () => {
    await setAnalyticsConsent('user-1', true, registered);
    const old = mockStore.get('pc.analytics.id.user-1');
    track('cook_reacted', {});
    const register = jest.fn((id: string) =>
      id === old ? Promise.reject(new AnalyticsIdRetired()) : Promise.resolve(),
    );
    await setAnalyticsConsent('user-1', true, register);
    const fresh = mockStore.get('pc.analytics.id.user-1');
    expect(fresh).not.toBe(old);
    // Nothing queued under the retired id is sent under the new one.
    expect(pendingEvents()).toHaveLength(0);
    track('cook_reacted', {});
    await flush();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body) as { batch: { distinct_id: string }[] };
    expect(body.batch[0]?.distinct_id).toBe(fresh);
  });

  it('a "no" during the re-check wins over the restart', async () => {
    await setAnalyticsConsent('user-1', true, registered);
    const retire = () => Promise.reject(new AnalyticsIdRetired());
    const restarting = setAnalyticsConsent('user-1', true, retire);
    await setAnalyticsConsent('user-1', false, registered);
    await restarting;
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
  });

  it('sends nothing at all without a project key', async () => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    await setAnalyticsConsent('user-1', true, registered);
    track('cook_reacted', {});
    await flush();
    expect(pendingEvents()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps accounts on a shared phone apart, and forgets an account that is deleted', async () => {
    await setAnalyticsConsent('user-1', true, registered);
    await setAnalyticsConsent('user-2', true, registered);
    expect(mockStore.get('pc.analytics.id.user-1')).not.toBe(
      mockStore.get('pc.analytics.id.user-2'),
    );
    await forgetAnalytics('user-2');
    expect(mockStore.has('pc.analytics.id.user-2')).toBe(false);
    track('cook_reacted', {});
    expect(pendingEvents()).toHaveLength(0);
  });
});

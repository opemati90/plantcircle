import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useBackend } from '../../lib/backend/BackendProvider';
import {
  AnalyticsIdRetired,
  analyticsIdOf,
  analyticsOn,
  forgetAnalytics,
  setAnalyticsConsent,
  track,
} from '../../lib/analytics';
import { errorCode } from '../../lib/backend/backend';
import { appStorage } from '../../lib/storage';
import { useAuth } from '../auth/useAuth';
import { useSettings } from './queries';

/** One app_opened a day per account: the return-visit signal. */
async function noteOpened(userId: string): Promise<void> {
  // Not counted (or marked) unless analytics is really on.
  if (!analyticsOn()) return;
  const today = new Date().toISOString().slice(0, 10);
  const key = `pc.analytics.opened.${userId}`;
  const last = await appStorage.get(key).catch(() => null);
  if (last === today) return;
  await appStorage.set(key, today).catch(() => undefined);
  track('app_opened', {});
}

/**
 * Keeps analytics in step with the signed-in member's choice (Privacy choices). Only a yes the
 * server confirmed in this session counts: a yes from the saved cache (up to a week old) or a
 * failed refresh never switches analytics on, so a "no" given on another device is respected.
 * Coming back to the app checks the choice again and notes a return visit. Mount once.
 */
export function AnalyticsBridge() {
  const { session } = useAuth();
  const settings = useSettings();
  const userId = session?.userId ?? null;
  const backend = useBackend();
  const fresh = settings.isFetchedAfterMount && !settings.isError && !settings.isRefetchError;
  const consent = fresh && settings.data?.analyticsConsent === true;
  // A "no" the server confirmed, here or on another device.
  const withdrawn = fresh && settings.data?.analyticsConsent === false;

  useEffect(() => {
    let live = true;
    const register = async (id: string) => {
      try {
        await backend.registerAnalyticsId(id);
      } catch (error) {
        throw errorCode(error) === 'id_retired' ? new AnalyticsIdRetired() : error;
      }
    };
    void setAnalyticsConsent(userId, consent, register).then(() => {
      if (live && userId && consent) void noteOpened(userId);
    });
    return () => {
      live = false;
    };
    // Each confirmed refresh tries again after a failed registration (a no-op once on).
  }, [backend, userId, consent, settings.dataUpdatedAt]);

  // After a "no": the data sent under this account's id is deleted at PostHog. The id is
  // recorded with the server first and only then forgotten here; a failure tries again later.
  useEffect(() => {
    if (!userId || !withdrawn) return;
    void (async () => {
      const id = await analyticsIdOf(userId);
      if (!id) return;
      try {
        await backend.requestAnalyticsDeletion(id);
        await forgetAnalytics(userId);
      } catch {
        // Kept for the next check (foreground, next launch).
      }
    })();
  }, [backend, userId, withdrawn, settings.dataUpdatedAt]);

  // Back in the foreground: ask the server again (the choice may have changed elsewhere); the
  // effect above follows the answer and notes the day's visit.
  const { refetch } = settings;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !userId) return;
      void refetch().then((result) => {
        if (result.data?.analyticsConsent === true && !result.isError) void noteOpened(userId);
      });
    });
    return () => {
      subscription.remove();
    };
  }, [refetch, userId]);

  return null;
}

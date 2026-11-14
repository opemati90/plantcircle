import type { Query } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackendError } from './backend/backend';
import type { GroupOrder, PlanDetail } from './backend/types';

/**
 * What survives a restart and works offline (docs/02-architecture.md): My Plans, each Plan the
 * member is part of (with the address once unlocked and what they are bringing), the orders they
 * are in, the cities, the profile, settings and policies. Chats and discovery are always fetched
 * fresh. Nothing of another member's is kept: the cache is dropped on sign-out and account change.
 */
const PERSISTED_KEYS = new Set([
  'myPlans',
  'plan',
  'order',
  'cities',
  'profile',
  'settings',
  'policies',
]);
const MAX_AGE_MS = 7 * 86_400_000;
/** Bump when a persisted shape changes, so an old cache is dropped rather than misread. */
const CACHE_VERSION = 'v2';

export const offlinePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'pc.query-cache',
  throttleTime: 1_000,
});

/** A Plan is kept only when the member is in it (or hosts it); an order only with interest. */
function worthKeeping(query: Query): boolean {
  const key = String(query.queryKey[0]);
  const data = query.state.data;
  if (key === 'plan') {
    const detail = data as PlanDetail | undefined;
    // The host sees the address without an RSVP; so does a confirmed guest once it is revealed.
    return (
      !!detail &&
      (detail.address !== null ||
        ['going', 'checked_in', 'offered', 'waitlisted'].includes(detail.rsvp))
    );
  }
  if (key === 'order') {
    const order = data as GroupOrder | undefined;
    return !!order && order.items.some((i) => i.mine > 0);
  }
  return true;
}

export const persistOptions = {
  persister: offlinePersister,
  maxAge: MAX_AGE_MS,
  buster: CACHE_VERSION,
  dehydrateOptions: {
    // A refetch that failed offline keeps its saved answer; an answer older than a week is dropped.
    shouldDehydrateQuery: (query: Query) =>
      query.state.data !== undefined &&
      PERSISTED_KEYS.has(String(query.queryKey[0])) &&
      Date.now() - query.state.dataUpdatedAt < MAX_AGE_MS &&
      worthKeeping(query),
    // RSVPs and claims are never queued offline (docs/02-architecture.md): nothing to replay.
    shouldDehydrateMutation: () => false,
  },
};

/** Forgets everything saved on this device; awaited by sign-out and delete. */
export async function clearOfflineCache(): Promise<void> {
  try {
    await offlinePersister.removeClient();
  } catch {
    // Best effort: nothing readable is left behind on the next sign-in either way (keys are per member).
  }
}

/** True when the last fetch failed for want of a connection while cached data is still shown. */
export function isOffline(query: { isError: boolean; error: unknown; data: unknown }): boolean {
  return (
    query.isError &&
    query.data !== undefined &&
    query.error instanceof BackendError &&
    query.error.code === 'network'
  );
}

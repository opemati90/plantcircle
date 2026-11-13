import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BackendError } from '../../lib/backend/backend';
import { useBackend } from '../../lib/backend/BackendProvider';
import { clearOfflineCache } from '../../lib/offlineCache';
import { unregisterPush } from '../notifications/push';
import type { Backend } from '../../lib/backend/backend';
import type { Profile, Session } from '../../lib/backend/types';
import { getOnboarding } from '../onboarding/onboardingStore';
import { deriveDisplayName, TERMS_VERSION } from './authRules';

const SESSION_KEY = ['session'] as const;

/** Loads the member's profile, creating it on first sign-in. */
async function ensureProfile(backend: Backend, session: Session): Promise<Profile> {
  const existing = await backend.getProfile();
  if (existing) return existing;
  const onboarding = getOnboarding();
  return backend.createProfile({
    displayName: deriveDisplayName(session),
    cityId: onboarding.cityId,
    goals: onboarding.goals,
    termsVersion: TERMS_VERSION,
  });
}

export interface Auth {
  /** `undefined` while the stored session is still being read. */
  session: Session | null | undefined;
  profile: Profile | undefined;
  /** The profile could not be loaded after retries. */
  profileError: boolean;
  /** The profile load failed for want of a connection (a cached copy may still show). */
  profileErrorOffline: boolean;
  retryProfile: () => void;
  isLoading: boolean;
}

export function useAuth(): Auth {
  const backend = useBackend();
  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => backend.getSession(),
    staleTime: Infinity,
  });
  const session = sessionQuery.data;

  const profileQuery = useQuery({
    queryKey: ['profile', session?.userId],
    queryFn: () => {
      if (!session) throw new Error('profile query requires a session');
      return ensureProfile(backend, session);
    },
    enabled: Boolean(session),
    // A suspension or a lifted one applied elsewhere should show within a minute of coming back.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return {
    session: sessionQuery.isError ? null : session,
    profile: profileQuery.data,
    profileError: profileQuery.isError,
    profileErrorOffline: profileQuery.isError && profileQuery.error instanceof BackendError && profileQuery.error.code === 'network',
    retryProfile: () => {
      void profileQuery.refetch();
    },
    isLoading: sessionQuery.isPending,
  };
}

/** Keeps the cached session in step with the backend. Mount once. */
export function useSessionSync(): void {
  const backend = useBackend();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      backend.onSessionChange((session) => {
        const previous = queryClient.getQueryData<Session | null>(SESSION_KEY);
        queryClient.setQueryData(SESSION_KEY, session);
        // The first notice after start is not a change of hands; a real change forgets everything
        // the last member had, in memory and on the device.
        if (previous !== undefined && previous?.userId !== session?.userId) {
          queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
          void clearOfflineCache();
        }
      }),
    [backend, queryClient],
  );
}

/** Signing out also forgets this device's push token, so the next person here gets nothing of ours. */
export function useSignOut() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await unregisterPush(backend);
      await backend.signOut();
      await clearOfflineCache();
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

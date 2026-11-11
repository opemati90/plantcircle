import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useBackend } from '../../lib/backend/BackendProvider';
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
    staleTime: Infinity,
  });

  return {
    session: sessionQuery.isError ? null : session,
    profile: profileQuery.data,
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
        if (previous?.userId !== session?.userId) {
          // Never show one member's cached data to the next person on this device.
          queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
        }
      }),
    [backend, queryClient],
  );
}

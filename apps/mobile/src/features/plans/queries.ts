import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { CircleInput, MyPlansScope } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { getOnboarding, saveOnboardingStrict } from '../onboarding/onboardingStore';

const WEEK_MS = 7 * 86_400_000;

// User-specific results are keyed by user id so caches never cross accounts.

export function useCities() {
  const backend = useBackend();
  return useQuery({
    queryKey: ['cities'],
    queryFn: () => backend.listCities(),
    staleTime: 3_600_000,
  });
}

/** `cityIds: null` means Anywhere: Plans from every city. */
export function usePlansThisWeek(cityIds: string[] | null, enabled = true) {
  const backend = useBackend();
  return useQuery({
    enabled,
    queryKey: ['plans', cityIds?.join(',') ?? 'all'],
    queryFn: () => {
      const from = new Date();
      return backend.listUpcomingPlans({
        cityIds,
        from,
        to: new Date(from.getTime() + WEEK_MS),
      });
    },
  });
}

const MONTH_MS = 30 * 86_400_000;

/** Plans in the next month for Explore: the cities given, or every city when `null`. */
export function useExplorePlans(cityIds: string[] | null, enabled = true) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['explorePlans', cityIds?.join(',') ?? 'all'],
    enabled,
    queryFn: () => {
      const from = new Date();
      return backend.listUpcomingPlans({
        cityIds,
        from,
        to: new Date(from.getTime() + MONTH_MS),
      });
    },
  });
}

export function usePlan(planId: string) {
  const backend = useBackend();
  const { session, isLoading } = useAuth();
  return useQuery({
    queryKey: ['plan', planId, session?.userId ?? null],
    queryFn: () => backend.getPlan(planId),
    enabled: !isLoading,
    // A held spot is time-critical: the Plan must be read fresh each time it is opened, also
    // when it was restored from the offline cache before the session was known.
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useUpNext() {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['upNext', session?.userId ?? null],
    queryFn: () => backend.getUpNext(new Date()),
    enabled: Boolean(session),
  });
}

/** The signed-in person's own Plans for one tab; off until that tab is opened. */
export function useMyPlans(scope: MyPlansScope, enabled: boolean) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['myPlans', scope, session?.userId ?? null],
    queryFn: () => backend.listMyPlans({ scope, now: new Date() }),
    enabled: enabled && Boolean(session),
    refetchOnMount: 'always',
    // Restored from the offline cache it is still fetched again as soon as the session is known.
    staleTime: 0,
  });
}

/**
 * Saves the home city. Signed in, it is stored on the profile; before sign-up it is kept
 * with the onboarding answers, which are copied to the profile at sign-up.
 */
export function useSetCity() {
  const backend = useBackend();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cityId: string | null) => {
      if (session) {
        await backend.setCity(cityId);
      } else {
        await saveOnboardingStrict({ ...getOnboarding(), cityId });
      }
    },
    // Only a saved city changes what the screens show; a failed save must not refetch.
    onSuccess: () =>
      Promise.all(
        ['profile', 'plans', 'explorePlans'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

/** Circles anyone can see; the key includes the viewer, whose own standing is shown. */
/** Circles matching the search, searched on the server so none are missed. */
export function useCircles(search: string) {
  const backend = useBackend();
  const { session } = useAuth();
  const userId = session?.userId ?? null;
  return useQuery({
    queryKey: ['circles', userId, search.trim()],
    queryFn: () => backend.listCircles({ search }),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === userId ? previous : undefined,
  });
}

/** Every Circle the viewer is in, for pickers. Not filtered by the discovery search. */
export function useMyCircles() {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-circles', session?.userId ?? null],
    queryFn: () => backend.listMyCircles(),
  });
}

export function useCircle(circleId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['circle', circleId, session?.userId ?? null],
    queryFn: () => backend.getCircle(circleId),
  });
}

/** Joining an open Circle, or asking to join a request Circle with an answer. */
export function useJoinCircle(circleId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { answer: string | null; key: string }) =>
      backend.joinCircle(circleId, input.answer, input.key),
    onSuccess: () =>
      Promise.all(
        // Membership decides which recipes and pickers a person sees, so those refresh too.
        ['circles', 'circle', 'my-circles', 'recipes'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

export function useCreateCircle() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { circle: CircleInput; key: string }) =>
      backend.createCircle(input.circle, input.key),
    onSuccess: () =>
      Promise.all(
        ['circles', 'my-circles'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ),
  });
}

/** Waiting requests for a request Circle. Only its owner and moderators can read them. */
export function useCircleRequests(circleId: string, enabled: boolean) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['circle-requests', circleId, session?.userId ?? null],
    queryFn: () => backend.getCircleRequests(circleId),
    enabled,
  });
}

export function useRespondToCircleRequest() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; approve: boolean; key: string }) =>
      backend.respondToCircleRequest(input.requestId, input.approve, input.key),
    onSuccess: () =>
      Promise.all(
        ['circle-requests', 'circle', 'circles'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

/** Spots currently held for the signed-in person. */
export function useWaitlistOffers() {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['offers', session?.userId ?? null],
    queryFn: () => backend.getWaitlistOffers(),
    enabled: Boolean(session),
  });
}

/** One key per user action; pass the same key again to retry that action safely. */
export const newIdempotencyKey = (): string => randomUUID();

/** Join, cancel and claim only report success after the server has confirmed. */
export function useRsvpMutations(planId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const options = {
    onSettled: () =>
      Promise.all(
        ['plan', 'plans', 'explorePlans', 'upNext', 'offers', 'myPlans'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  };
  return {
    join: useMutation({
      mutationFn: (key: string) => backend.joinPlan(planId, key),
      ...options,
    }),
    cancel: useMutation({
      mutationFn: (key: string) => backend.cancelRsvp(planId, key),
      ...options,
    }),
    joinWaitlist: useMutation({
      mutationFn: (key: string) => backend.joinWaitlist(planId, key),
      ...options,
    }),
    confirmOffer: useMutation({
      mutationFn: (key: string) => backend.confirmWaitlistOffer(planId, key),
      ...options,
    }),
    claim: useMutation({
      mutationFn: (input: { itemId: string; key: string }) =>
        backend.claimBringItem(input.itemId, input.key),
      ...options,
    }),
    unclaim: useMutation({
      mutationFn: (input: { itemId: string; key: string }) =>
        backend.unclaimBringItem(input.itemId, input.key),
      ...options,
    }),
  };
}

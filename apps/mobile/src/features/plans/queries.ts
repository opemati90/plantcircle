import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';

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

/** `cityId: null` means the person has not picked a city: show Plans everywhere. */
export function usePlansThisWeek(cityId: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['plans', cityId],
    queryFn: () => {
      const from = new Date();
      return backend.listUpcomingPlans({
        cityId,
        from,
        to: new Date(from.getTime() + WEEK_MS),
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
        ['plan', 'plans', 'upNext', 'offers'].map((key) =>
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
  };
}

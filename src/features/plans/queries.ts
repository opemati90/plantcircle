import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../app/backend';
import { useAuth } from '../auth/useAuth';

const WEEK_MS = 7 * 86_400_000;

// User-specific results are keyed by user id so caches never cross accounts.

export function usePlansThisWeek(city: string) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['plans', city],
    queryFn: () => {
      const from = new Date();
      return backend.listUpcomingPlans({ city, from, to: new Date(from.getTime() + WEEK_MS) });
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

function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['plan', 'plans', 'upNext'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

/** Join, cancel and claim only report success after the server has confirmed. */
export function useRsvpMutations(planId: string) {
  const backend = useBackend();
  const invalidate = useInvalidatePlans();
  const options = { onSettled: invalidate };
  return {
    join: useMutation({ mutationFn: () => backend.joinPlan(planId), ...options }),
    cancel: useMutation({ mutationFn: () => backend.cancelRsvp(planId), ...options }),
    claim: useMutation({
      mutationFn: (itemId: string) => backend.claimBringItem(itemId),
      ...options,
    }),
  };
}

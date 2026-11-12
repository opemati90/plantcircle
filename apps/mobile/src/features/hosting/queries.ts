import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { BringItemInput } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

export function useGuests(planId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['guests', planId, session?.userId ?? null],
    queryFn: () => backend.listGuests(planId),
    staleTime: 0,
  });
}

export function useHostSummary(planId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['hostSummary', planId, session?.userId ?? null],
    queryFn: () => backend.getHostSummary(planId),
    staleTime: 0,
  });
}

/** Refreshes the host's view after any change to who is in, and to the Plan's own lists. */
function useRefreshHosting(planId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['guests', planId], ['hostSummary', planId], ['plan', planId], ['myPlans']].map((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      ),
    );
}

export function useCheckInGuest(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshHosting(planId);
  return useMutation({
    mutationFn: (input: { userId: string; checkedIn: boolean; key: string }) =>
      backend.checkInGuest(planId, input.userId, input.checkedIn, input.key),
    onSuccess: refresh,
  });
}

export function useEndPlan(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshHosting(planId);
  return useMutation({
    mutationFn: (input: { key: string }) => backend.endPlan(planId, input.key),
    onSuccess: refresh,
  });
}

export function useFeedback(planId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['feedback', planId, session?.userId ?? null],
    queryFn: () => backend.getFeedback(planId),
    enabled: session !== null && session !== undefined,
    staleTime: 0,
    // Until feedback opens, look again each minute, so the prompt appears once the Plan ends.
    refetchInterval: (query) => (query.state.data?.eligible ? false : 60_000),
  });
}

export function useSubmitFeedback(planId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; comment: string | null; key: string }) =>
      backend.submitFeedback(planId, input.rating, input.comment, input.key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback', planId] }),
  });
}

/** Bring items change the Plan's own list, so the Plan and its guest views are refreshed. */
function useRefreshBring(planId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['plan', planId], ['hostSummary', planId]].map((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      ),
    );
}

export function useAddBringItem(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshBring(planId);
  return useMutation({
    mutationFn: (input: { item: BringItemInput; key: string }) =>
      backend.addBringItem(planId, input.item, input.key),
    onSuccess: refresh,
  });
}

export function useUpdateBringItem(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshBring(planId);
  return useMutation({
    mutationFn: (input: { itemId: string; item: BringItemInput; key: string }) =>
      backend.updateBringItem(input.itemId, input.item, input.key),
    onSuccess: refresh,
  });
}

export function useRemoveBringItem(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshBring(planId);
  return useMutation({
    mutationFn: (input: { itemId: string; key: string }) =>
      backend.removeBringItem(input.itemId, input.key),
    onSuccess: refresh,
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { OrderDecision, OrderInput } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

export function useOrder(planId: string) {
  const backend = useBackend();
  const { session, isLoading } = useAuth();
  return useQuery({
    queryKey: ['order', planId, session?.userId ?? null],
    queryFn: () => backend.getOrder(planId),
    enabled: !isLoading,
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

function useRefreshOrder(planId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['order', planId], ['plans'], ['explorePlans'], ['myPlans'], ['inbox']].map((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      ),
    );
}

export function useCreateOrder() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { order: OrderInput; key: string }) =>
      backend.createOrder(input.order, input.key),
    onSuccess: () =>
      Promise.all(
        ['plans', 'explorePlans', 'myPlans'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

export function useSetInterest(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshOrder(planId);
  return useMutation({
    mutationFn: (input: { itemId: string; quantity: number; key: string }) =>
      backend.setOrderInterest(input.itemId, input.quantity, input.key),
    onSuccess: refresh,
  });
}

export function useDecideOrder(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshOrder(planId);
  return useMutation({
    mutationFn: (input: { decision: OrderDecision; key: string }) =>
      backend.decideOrder(planId, input.decision, input.key),
    onSuccess: refresh,
  });
}

export function useMarkCollected(planId: string) {
  const backend = useBackend();
  const refresh = useRefreshOrder(planId);
  return useMutation({
    mutationFn: (input: { key: string }) => backend.markOrderCollected(planId, input.key),
    onSuccess: refresh,
  });
}

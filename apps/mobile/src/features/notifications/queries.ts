import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';
import { features } from '../../lib/features';

/** The Inbox's Updates rows. Polled with the Inbox; Realtime is a later step. */
const ORDER_NOTICES: string[] = ['order_closing', 'order_decision', 'order_ready'];

export function useNotifications(enabled: boolean) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', session?.userId ?? null],
    queryFn: () => backend.listNotifications(),
    enabled,
    // Group orders are switched off at launch; their notices stay out of the Inbox.
    select: (rows) =>
      features.groupOrders ? rows : rows.filter((n) => !ORDER_NOTICES.includes(n.type)),
    refetchInterval: 15_000,
    staleTime: 0,
  });
}

export function useMarkNotificationRead() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backend.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => backend.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';

/** The Inbox's Updates rows. Polled with the Inbox; Realtime is a later step. */
export function useNotifications(enabled: boolean) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', session?.userId ?? null],
    queryFn: () => backend.listNotifications(),
    enabled,
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

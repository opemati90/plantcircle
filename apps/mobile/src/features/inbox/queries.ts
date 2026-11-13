import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';

/** Every chat the viewer can use. Polled while the inbox is open; Realtime arrives with C14. */
export function useInbox(enabled: boolean) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['inbox', session?.userId ?? null],
    queryFn: () => backend.listInbox(),
    enabled,
    refetchInterval: 15_000,
    staleTime: 0,
  });
}

export function useMarkRead() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; upTo: string }) =>
      backend.markConversationRead(input.conversationId, input.upTo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

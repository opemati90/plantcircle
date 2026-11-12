import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';

/** The conversation for a Plan or a Circle. Its id does not change, so it is kept. */
export function useConversation(kind: 'plan' | 'circle', refId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['conversation', kind, refId, session?.userId ?? null],
    queryFn: () => backend.openConversation(kind, refId),
    enabled: session !== null && session !== undefined,
    staleTime: Infinity,
  });
}

/** Messages, refreshed every five seconds while the chat is open. */
export function useMessages(conversationId: string | undefined) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['messages', conversationId ?? null, session?.userId ?? null],
    queryFn: () => backend.listMessages(conversationId ?? ''),
    enabled: conversationId !== undefined,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

export function useSendMessage(conversationId: string | undefined) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; clientId: string }) =>
      backend.sendMessage(conversationId ?? '', input.body, input.clientId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId ?? null] }),
  });
}

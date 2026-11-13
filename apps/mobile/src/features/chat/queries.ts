import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';

/** The conversation for a Plan or a Circle. Its id does not change, so it is kept. */
export function useConversation(kind: 'plan' | 'circle' | 'direct', refId: string) {
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

/** First-message requests waiting for the viewer. */
export function useDirectRequests() {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['directRequests', session?.userId ?? null],
    queryFn: () => backend.listDirectRequests(),
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

/** Asks to message someone. The answer may open the conversation at once. */
export function useRequestDirect(userId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { firstMessage: string; clientId: string }) =>
      backend.requestDirect(userId, input.firstMessage, input.clientId),
    onSuccess: (answer) => {
      // Only an accepted request changes what the chat shows; a pending one must not refetch the composer.
      if (answer.status === 'accepted') {
        return queryClient.invalidateQueries({ queryKey: ['conversation', 'direct', userId] });
      }
      return undefined;
    },
  });
}

export function useRespondDirect() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; accept: boolean }) =>
      backend.respondDirectRequest(input.requestId, input.accept),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['directRequests'] }),
  });
}

/** Your own mute and pin for one conversation. */
export function useConversationSettings(conversationId: string | undefined) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['settings', conversationId ?? null, session?.userId ?? null],
    queryFn: () => backend.getConversationSettings(conversationId ?? ''),
    enabled: conversationId !== undefined,
    staleTime: 0,
  });
}

export function useConversationPrefs(conversationId: string | undefined) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['settings', conversationId ?? null] });
  return {
    mute: useMutation({
      mutationFn: (until: string | null) =>
        backend.setMutedUntil(conversationId ?? '', until),
      onSuccess: refresh,
    }),
    pin: useMutation({
      mutationFn: (pinned: boolean) => backend.setPinned(conversationId ?? '', pinned),
      onSuccess: refresh,
    }),
  };
}

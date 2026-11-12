import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { Profile } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

/**
 * Visible members who share a Circle with you. Empty until someone chooses to be visible. Always
 * fetched fresh: a person who hides should disappear the next time the list is shown.
 */
export function usePeople(enabled: boolean) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['people', session?.userId ?? null],
    queryFn: () => backend.listPeople(),
    enabled,
    staleTime: 0,
  });
}

export function useConnectWithPerson() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; key: string }) =>
      backend.connectWithPerson(input.userId, input.key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });
}

/** The member's own visibility choice. Changing it refreshes the profile everywhere it is shown. */
export function useSetPeopleVisible() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.userId ?? null;
  return useMutation({
    mutationFn: (visible: boolean) => backend.setPeopleVisible(visible),
    onSuccess: (_data, visible) => {
      // The server accepted the choice, so show it now rather than wait for a refetch that may fail.
      queryClient.setQueryData<Profile | null>(['profile', userId], (old) =>
        old ? { ...old, peopleVisible: visible } : old,
      );
      return Promise.all(
        ['profile', 'people'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
}

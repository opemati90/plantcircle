import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { SettingsPatch, UserSettings } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { unregisterPush } from '../notifications/push';

export function useSettings() {
  const backend = useBackend();
  const { session, profile } = useAuth();
  return useQuery({
    queryKey: ['settings', session?.userId ?? null],
    queryFn: () => backend.getSettings(),
    // Settings hang off the profile, which the first sign-in is still creating.
    enabled: !!session && !!profile,
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => backend.updateSettings(patch),
    onSuccess: (next) => {
      // The server answered with the whole row, so show it now rather than wait for a refetch.
      queryClient.setQueryData<UserSettings>(['settings', session?.userId ?? null], next);
    },
  });
}

export function useRequestDataExport() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => backend.requestDataExport(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useDeleteAccount() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      await unregisterPush(backend);
      await backend.deleteAccount(key);
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

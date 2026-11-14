import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { PolicyName } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

/** Policy versions the member has not accepted. Checked on each app start and hourly after. */
export function usePendingPolicies() {
  const backend = useBackend();
  const { session, profile } = useAuth();
  return useQuery({
    queryKey: ['policies', session?.userId ?? null],
    queryFn: () => backend.getPendingPolicies(),
    enabled: !!session && !!profile,
    staleTime: 3_600_000,
    refetchInterval: 3_600_000,
    refetchOnWindowFocus: true,
  });
}

export function useAcceptPolicies() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versions: { policy: PolicyName; version: string }[]) =>
      backend.acceptPolicies(versions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { PlanInput } from '../../lib/backend/types';

/** Publishes a Plan. Every list of Plans is refreshed, since the new one may belong in any of them. */
export function useCreatePlan() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { plan: PlanInput; key: string }) =>
      backend.createPlan(input.plan, input.key),
    onSuccess: () =>
      Promise.all(
        ['plans', 'explorePlans', 'myPlans', 'upNext'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

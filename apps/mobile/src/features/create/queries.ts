import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { PlanInput } from '../../lib/backend/types';
import { track } from '../../lib/analytics';

/** Publishes a Plan. Every list of Plans is refreshed, since the new one may belong in any of them. */
export function useCreatePlan() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { plan: PlanInput; key: string }) =>
      backend.createPlan(input.plan, input.key),
    onSuccess: (_id, input) => {
      track('plan_published', { format: input.plan.format });
      return Promise.all(
        ['plans', 'explorePlans', 'myPlans', 'upNext'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}

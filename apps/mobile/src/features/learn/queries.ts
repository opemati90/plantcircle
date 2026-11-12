import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { RecipeInput } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

/** Recipes the viewer can see, searched on the server. */
export function useRecipes(search: string) {
  const backend = useBackend();
  const { session } = useAuth();
  const userId = session?.userId ?? null;
  return useQuery({
    queryKey: ['recipes', userId, search.trim()],
    queryFn: () => backend.listRecipes({ search }),
    // Only the same person's earlier list may stand in while typing; never another person's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === userId ? previous : undefined,
  });
}

export function useRecipe(recipeId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['recipe', recipeId, session?.userId ?? null],
    queryFn: () => backend.getRecipe(recipeId),
  });
}

export function useCreateRecipe() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recipe: RecipeInput; key: string }) =>
      backend.createRecipe(input.recipe, input.key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

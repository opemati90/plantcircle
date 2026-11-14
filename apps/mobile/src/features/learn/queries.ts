import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { Recipe, RecipeDetail, RecipeInput } from '../../lib/backend/types';
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

/** Upvote a recipe or take it back; the open recipe and the lists update in place. */
export function useSetRecipeVote() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recipeId: string; on: boolean }) =>
      backend.setRecipeVote(input.recipeId, input.on),
    // A read started before the tap must not land after it and undo the result.
    onMutate: (input) => queryClient.cancelQueries({ queryKey: ['recipe', input.recipeId] }),
    onSettled: (_result, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipe', input.recipeId] }),
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
      ]),
    onSuccess: (result, input) => {
      queryClient.setQueriesData<RecipeDetail>({ queryKey: ['recipe', input.recipeId] }, (r) =>
        r ? { ...r, votes: result.votes, voted: result.voted } : r,
      );
      queryClient.setQueriesData<Recipe[]>({ queryKey: ['recipes'] }, (list) =>
        list?.map((r) =>
          r.id === input.recipeId ? { ...r, votes: result.votes, voted: result.voted } : r,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ['hostLevel'] });
    },
  });
}

/** Follow or unfollow a recipe's author; every recipe by them shows the new state. */
export function useSetFollow() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; on: boolean }) =>
      backend.setFollow(input.userId, input.on),
    onMutate: () => queryClient.cancelQueries({ queryKey: ['recipe'] }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipe'] }),
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
      ]),
    onSuccess: (result, input) => {
      queryClient.setQueriesData<RecipeDetail>({ queryKey: ['recipe'] }, (r) =>
        r && r.authorId === input.userId ? { ...r, followingAuthor: result.following } : r,
      );
      queryClient.setQueriesData<Recipe[]>({ queryKey: ['recipes'] }, (list) =>
        list?.map((r) =>
          r.authorId === input.userId ? { ...r, followingAuthor: result.following } : r,
        ),
      );
    },
  });
}

export function useCreateRecipe() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recipe: RecipeInput; key: string }) =>
      backend.createRecipe(input.recipe, input.key),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['hostLevel'] }),
      ]),
  });
}

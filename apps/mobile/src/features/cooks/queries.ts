import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type {
  Cook,
  CookCommentPage,
  CookKind,
  CookPage,
  PreparedPhoto,
} from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { track } from '../../lib/analytics';

/** Feed pages. Signed photo URLs last 10 minutes, so a page is refreshed well before then. */
const PAGE = 20;
const FRESH_MS = 4 * 60_000;

/**
 * Posts in your Circles (or one Circle), newest first, a page at a time. `onlyCooked` keeps the
 * photos of what members cooked (Home and its feed), filtered by the server before paging.
 */
export function useCooks(circleId: string | null, enabled = true, onlyCooked = false) {
  const backend = useBackend();
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ['cooks', session?.userId ?? null, circleId, onlyCooked ? 'cooked' : 'all'],
    queryFn: ({ pageParam }) =>
      backend.listCooks({ circleId, cursor: pageParam, limit: PAGE, onlyCooked }),
    initialPageParam: null as CookPage['next'],
    getNextPageParam: (last) => last.next,
    enabled: enabled && Boolean(session),
    staleTime: FRESH_MS,
    refetchInterval: FRESH_MS * 2,
  });
}

export function useCook(cookId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['cook', cookId, session?.userId ?? null],
    queryFn: () => backend.getCook(cookId),
    enabled: Boolean(session),
    staleTime: FRESH_MS,
    // Opened from a notice (a removal, a comment), the post is always checked again.
    refetchOnMount: 'always',
  });
}

/** Your own posts, a page at a time, so every one of them can be found and deleted. */
export function useMyCooks(enabled = true) {
  const backend = useBackend();
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ['myCooks', session?.userId ?? null],
    queryFn: ({ pageParam }) => backend.listMyCooks({ cursor: pageParam, limit: PAGE }),
    initialPageParam: null as CookPage['next'],
    getNextPageParam: (last) => last.next,
    enabled: enabled && Boolean(session),
    staleTime: FRESH_MS,
  });
}

const patchCook = (cookId: string, change: Partial<Cook>) => (cook: Cook) =>
  cook.id === cookId ? { ...cook, ...change } : cook;

/** Yum or take it back; every list showing the post updates in place. */
export function useCookReaction() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cookId: string; on: boolean }) =>
      backend.setCookReaction(input.cookId, input.on),
    onMutate: (input) =>
      Promise.all([
        queryClient.cancelQueries({ queryKey: ['cooks'] }),
        queryClient.cancelQueries({ queryKey: ['cook', input.cookId] }),
      ]),
    onSuccess: (result, input) => {
      if (input.on) track('cook_reacted', {});
      const patch = patchCook(input.cookId, result);
      queryClient.setQueriesData<InfiniteData<CookPage>>({ queryKey: ['cooks'] }, (data) =>
        data
          ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map(patch) })) }
          : data,
      );
      queryClient.setQueriesData<Cook>({ queryKey: ['cook', input.cookId] }, (cook) =>
        cook ? patch(cook) : cook,
      );
    },
  });
}

/** Uploads the photo, if any (once per photo, kept for a retry), and shares the post. */
export function useShareCook() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: CookKind;
      photo: PreparedPhoto | null;
      uploadedPath: string | null;
      onUploaded: (path: string) => void;
      circleId: string;
      recipeId: string | null;
      caption: string;
      photoAlt: string | null;
      challengeWeek: string | null;
      key: string;
    }) => {
      let path = input.uploadedPath;
      if (!path && input.photo) {
        path = (await backend.uploadCookPhoto(input.photo)).path;
        input.onUploaded(path);
      }
      const id = await backend.createCook(
        {
          circleId: input.circleId,
          kind: input.kind,
          recipeId: input.recipeId,
          caption: input.caption,
          photoAlt: input.photoAlt,
          photoPath: path,
          challengeWeek: input.challengeWeek,
        },
        input.key,
      );
      track('cook_shared', { challenge: input.challengeWeek !== null });
      return id;
    },
    onSuccess: () =>
      Promise.all(
        ['cooks', 'myCooks', 'challenge', 'cookStreak', 'hostLevel'].map((name) =>
          queryClient.invalidateQueries({ queryKey: [name] }),
        ),
      ),
  });
}

/** This week's theme for a Circle's invite page, signed in or not. */
export function useCircleWeekPublic(circleId: string) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['circleWeekPublic', circleId],
    queryFn: () => backend.getCircleWeekPublic(circleId),
    staleTime: FRESH_MS,
  });
}

/** This week's challenge in a Circle (members only). */
export function useCircleChallenge(circleId: string | null, enabled = true) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['challenge', circleId, session?.userId ?? null],
    queryFn: () => backend.getCircleChallenge(circleId ?? ''),
    enabled: enabled && Boolean(session) && circleId !== null,
    staleTime: FRESH_MS,
  });
}

export function useSetCircleChallenge(circleId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { weekStart: string; theme: string | null; key: string }) =>
      backend.setCircleChallenge(circleId, input.weekStart, input.theme, input.key),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['challenge', circleId] }),
        queryClient.invalidateQueries({ queryKey: ['circleWeekPublic', circleId] }),
        queryClient.invalidateQueries({ queryKey: ['cooks'] }),
      ]),
  });
}

/** The viewer's own weeks with a post. */
export function useCookStreak(enabled = true) {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['cookStreak', session?.userId ?? null],
    queryFn: () => backend.getCookStreak(),
    enabled: enabled && Boolean(session),
    staleTime: FRESH_MS,
  });
}

export function useDeleteCook() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cookId: string; key: string }) =>
      backend.deleteCook(input.cookId, input.key),
    onSuccess: (_result, { cookId }) => {
      queryClient.setQueriesData<InfiniteData<CookPage>>({ queryKey: ['cooks'] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                items: p.items.filter((c) => c.id !== cookId),
              })),
            }
          : data,
      );
      queryClient.setQueriesData<InfiniteData<CookPage>>({ queryKey: ['myCooks'] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                items: p.items.filter((c) => c.id !== cookId),
              })),
            }
          : data,
      );
      queryClient.removeQueries({ queryKey: ['cook', cookId] });
      return Promise.all(
        ['cooks', 'myCooks', 'challenge', 'cookStreak', 'hostLevel'].map((name) =>
          queryClient.invalidateQueries({ queryKey: [name] }),
        ),
      );
    },
  });
}

/** Everything that shows a post's comments or its count. */
function refreshAfterComment(
  queryClient: ReturnType<typeof useQueryClient>,
  cookId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['cookComments', cookId] }),
    queryClient.invalidateQueries({ queryKey: ['cook', cookId] }),
    queryClient.invalidateQueries({ queryKey: ['cooks'] }),
  ]);
}

/**
 * A post's comments, the newest page first; each page is oldest first, and the next page is the
 * one before it ("Show earlier comments").
 */
export function useCookComments(cookId: string) {
  const backend = useBackend();
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ['cookComments', cookId, session?.userId ?? null],
    queryFn: ({ pageParam }) => backend.listCookComments(cookId, pageParam),
    initialPageParam: null as CookCommentPage['earlier'],
    getNextPageParam: (last) => last.earlier,
    enabled: Boolean(session),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAddCookComment(cookId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; key: string }) =>
      backend.addCookComment(cookId, input.body, input.key),
    onSuccess: () => refreshAfterComment(queryClient, cookId),
  });
}

export function useDeleteCookComment(cookId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { commentId: string; key: string }) =>
      backend.deleteCookComment(input.commentId, input.key),
    onSuccess: () => refreshAfterComment(queryClient, cookId),
  });
}

/** A host removes a comment on a post in their Circle. */
export function useRemoveCookComment(cookId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => backend.removeCookCommentAsHost(commentId),
    onSuccess: () => refreshAfterComment(queryClient, cookId),
  });
}

/** A host removes a post in their Circle: it leaves every list. */
export function useRemoveCook() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cookId: string) => backend.removeCookAsHost(cookId),
    onSuccess: (_result, cookId) => {
      queryClient.setQueriesData<InfiniteData<CookPage>>({ queryKey: ['cooks'] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                items: p.items.filter((c) => c.id !== cookId),
              })),
            }
          : data,
      );
      queryClient.removeQueries({ queryKey: ['cook', cookId] });
      return Promise.all(
        ['cooks', 'challenge'].map((name) =>
          queryClient.invalidateQueries({ queryKey: [name] }),
        ),
      );
    },
  });
}

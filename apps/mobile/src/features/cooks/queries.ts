import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { Cook, CookPage, PreparedPhoto } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

/** Feed pages. Signed photo URLs last 10 minutes, so a page is refreshed well before then. */
const PAGE = 20;
const FRESH_MS = 4 * 60_000;

/** Posts in your Circles (or one Circle), newest first, a page at a time. */
export function useCooks(circleId: string | null, enabled = true) {
  const backend = useBackend();
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ['cooks', session?.userId ?? null, circleId],
    queryFn: ({ pageParam }) => backend.listCooks({ circleId, cursor: pageParam, limit: PAGE }),
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

/** Uploads the photo (once per photo, kept for a retry) and shares the post. */
export function useShareCook() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      photo: PreparedPhoto;
      uploadedPath: string | null;
      onUploaded: (path: string) => void;
      circleId: string;
      recipeId: string | null;
      caption: string;
      photoAlt: string | null;
      key: string;
    }) => {
      let path = input.uploadedPath;
      if (!path) {
        path = (await backend.uploadCookPhoto(input.photo)).path;
        input.onUploaded(path);
      }
      return backend.createCook(
        {
          circleId: input.circleId,
          recipeId: input.recipeId,
          caption: input.caption,
          photoAlt: input.photoAlt,
          photoPath: path,
        },
        input.key,
      );
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cooks'] }),
        queryClient.invalidateQueries({ queryKey: ['myCooks'] }),
      ]),
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
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cooks'] }),
        queryClient.invalidateQueries({ queryKey: ['myCooks'] }),
      ]);
    },
  });
}

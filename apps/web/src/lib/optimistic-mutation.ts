import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Backlog 0.4b.10 — the optimistic-update + rollback pattern, written once.
 *
 * TanStack Query's own recipe is four steps that are easy to get subtly wrong
 * (forgetting `cancelQueries` causes an in-flight refetch to clobber the optimistic
 * value; forgetting `invalidateQueries` in `onSettled` leaves the cache holding a
 * guess). This wraps them so a mutation just declares *how* the cache changes:
 *
 *   const qc = useQueryClient();
 *   useMutation({
 *     mutationFn: (patch: ClientPatch) => api.updateClient(id, patch),
 *     ...optimisticUpdate<Client[], ClientPatch>(qc, ['clients'], (patch) => (list) =>
 *       (list ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
 *     ),
 *   });
 *
 * On error the previous cache snapshot is restored and the failure still propagates
 * to the mutation's own `onError` / the caller's `catch` (so a toast can fire).
 * `onSettled` refetches so the server stays the source of truth — matching the
 * "frontend calculation for display only" rule for anything money-related (4.2.3).
 */

interface OptimisticContext<TData> {
  previous: TData | undefined;
}

export interface OptimisticHandlers<TData, TVars> {
  onMutate: (vars: TVars) => Promise<OptimisticContext<TData>>;
  onError: (err: unknown, vars: TVars, context: OptimisticContext<TData> | undefined) => void;
  onSettled: () => void;
}

/**
 * @param apply  `(vars) => (currentCacheValue) => nextCacheValue`. Curried so the
 *               same declaration reads for create, update and delete.
 */
export function optimisticUpdate<TData, TVars>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  apply: (vars: TVars) => (current: TData | undefined) => TData,
): OptimisticHandlers<TData, TVars> {
  return {
    onMutate: async (vars) => {
      // Stop any in-flight fetch for this key so it can't land after us and undo
      // the optimistic write.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);
      queryClient.setQueryData<TData>(queryKey, (current) => apply(vars)(current));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData<TData>(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  };
}

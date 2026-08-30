import { QueryClient } from '@tanstack/react-query';

import { isClientError } from './http-error';

/**
 * Single QueryClient for the app (task 0.1.5).
 *
 * These defaults are what make the five mandatory UI states cheap to implement: every
 * screen reads `isPending` / `isError` / `data` / `isFetching` off the query itself,
 * so no feature ever invents a parallel loading boolean (backlog Epic 0.4b).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Invoice, client and template data does not change behind the user's back in
      // a single-user-per-tenant app, so a short stale window kills the refetch
      // storm on every navigation without serving genuinely old data.
      staleTime: 30_000,

      // Retrying a 401 or a 404 just delays the error state the user needs to see.
      retry: (failureCount, error) => !isClientError(error) && failureCount < 2,

      // Keep the previous page's data on screen while the next loads, so lists show
      // a subtle refreshing indicator instead of collapsing to a skeleton (X.7.25).
      placeholderData: <T>(previous: T): T => previous,
    },
    mutations: {
      // Never automatically retry a write. Creating an invoice, sending an email or
      // charging a card twice is worse than surfacing the failure once.
      retry: false,
    },
  },
});

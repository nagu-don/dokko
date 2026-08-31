import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query client with defaults tuned for a mobile app that replaces
 * the web apps' polling loops (Phase 0: vendor polls 3s, customer 5s).
 * Per-query options override these later — the ones below are the safe base.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile: no window to refocus, and lists re-fetch via refetchInterval / focus effect.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Tip the balance toward responsiveness for market data.
      staleTime: 30_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      retry: 0,
    },
  },
});
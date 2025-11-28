import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cards rarely change - use longer cache times
      staleTime: 30 * 60 * 1000, // 30 minutes before refetch
      gcTime: 60 * 60 * 1000,    // 1 hour in cache
      refetchOnWindowFocus: false,
      refetchOnMount: false,     // Don't refetch if data exists
      refetchOnReconnect: false, // Don't refetch on reconnect
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors except 401 (handled by axios interceptor)
        if (error?.response?.status >= 400 && error?.response?.status < 500 && error?.response?.status !== 401) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});
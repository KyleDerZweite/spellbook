'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { queryClient } from '../lib/query-client';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth';

function HydrationHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Hydrate auth store on client side
    console.log('Hydrating auth store...');
    useAuthStore.persist.rehydrate();
    const state = useAuthStore.getState();
    console.log('Auth state after hydration:', { 
      hasTokens: !!state.tokens, 
      hasUser: !!state.user,
      tokens: state.tokens ? 'present' : 'missing'
    });
    useAuthStore.setState({ hydrated: true });
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <HydrationHandler>
          {children}
        </HydrationHandler>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tokens, User } from '../lib/types';

interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  hydrated: boolean;
  setTokens: (tokens: Tokens | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      hydrated: false,
      setTokens: (tokens) => set({ tokens }),
      setUser: (user) => set({ user }),
      logout: () => set({ tokens: null, user: null }),
    }),
    { 
      name: 'spellbook-auth',
      // Only persist tokens and user data
      partialize: (state) => ({ 
        tokens: state.tokens, 
        user: state.user 
      }),
      // Skip hydration for SSR compatibility
      skipHydration: true,
    }
  )
);
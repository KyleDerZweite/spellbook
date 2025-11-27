import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
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
      setTokens: (tokens) => {
        set({ tokens });
        if (tokens?.refresh_token) {
          Cookies.set('refresh_token', tokens.refresh_token, { expires: 7, secure: true, sameSite: 'strict' });
        } else {
          Cookies.remove('refresh_token');
        }
      },
      setUser: (user) => set({ user }),
      logout: () => {
        set({ tokens: null, user: null });
        Cookies.remove('refresh_token');
      },
    }),
    {
      name: 'spellbook-auth',
      partialize: (state) => ({ 
        tokens: state.tokens,
        user: state.user 
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
        }
      },
    }
  )
);
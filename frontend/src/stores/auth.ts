import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import type { Tokens, User } from '../lib/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  hydrated: boolean;
  setTokens: (tokens: Tokens) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      hydrated: false,
      setTokens: (tokens) => {
        set({ accessToken: tokens.access_token });
        if (tokens.refresh_token) {
          Cookies.set('refresh_token', tokens.refresh_token, { expires: 7, secure: true, sameSite: 'strict' });
        }
      },
      setUser: (user) => set({ user }),
      logout: () => {
        set({ accessToken: null, user: null });
        Cookies.remove('refresh_token');
      },
    }),
    {
      name: 'spellbook-auth',
      partialize: (state) => ({ 
        accessToken: state.accessToken,
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
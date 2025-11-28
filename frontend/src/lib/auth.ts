import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from '../stores/auth';
import type { Tokens, User } from './types';

export function useAuth() {
  const { tokens, user, setTokens, setUser, logout, hydrated } = useAuthStore();
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: api.auth.me,
    enabled: hydrated && Boolean(tokens?.access_token) && !user,
    retry: false,
  });

  const login = useMutation({
    mutationFn: api.auth.login,
    onSuccess: async (tokens: Tokens) => {
      console.log('Login successful, received tokens:', tokens);
      setTokens(tokens);
      try {
        console.log('Fetching user data...');
        const userData = await api.auth.me();
        console.log('User data received:', userData);
        setUser(userData);
        await queryClient.invalidateQueries({ queryKey: ['auth'] });
      } catch (error) {
        console.error('Failed to fetch user data after login:', error);
        // Clear tokens if user fetch fails
        setTokens(null);
        setUser(null);
      }
    },
    onError: (error) => {
      console.error('Login failed:', error);
    },
  });

  const register = useMutation({
    mutationFn: api.auth.register,
    onError: (error) => {
      console.error('Registration failed:', error);
    },
  });

  const doLogout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      logout();
      queryClient.clear();
    }
  };

  return {
    tokens,
    user: user ?? userQuery.data ?? null,
    isLoading: !hydrated || userQuery.isLoading,
    isAuthenticated: hydrated && Boolean(tokens?.access_token && (user || userQuery.data)),
    login,
    register,
    logout: doLogout,
  };
}

export function useRequireAuth() {
  const { user, isLoading, isAuthenticated } = useAuth();
  
  return {
    user,
    isLoading,
    isAuthenticated,
    canAccess: isAuthenticated,
  };
}
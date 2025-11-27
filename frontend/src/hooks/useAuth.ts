import { useAuthStore } from '../stores/auth';
import { useEffect } from 'react';
import { refreshAccessToken } from '../lib/api';
import { jwtDecode } from 'jwt-decode';

export const useAuth = () => {
  const { tokens, setTokens, logout } = useAuthStore();

  useEffect(() => {
    if (!tokens?.access_token) return;

    const decodedToken = jwtDecode(tokens.access_token);
    const buffer = 5 * 60 * 1000; // 5 minutes

    const timeout = setTimeout(async () => {
      try {
        const newTokens = await refreshAccessToken();
        setTokens(newTokens);
      } catch (error) {
        logout();
      }
    }, (decodedToken.exp ?? 0) * 1000 - Date.now() - buffer);

    return () => clearTimeout(timeout);
  }, [tokens, setTokens, logout]);
};
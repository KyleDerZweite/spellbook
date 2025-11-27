import { useAuthStore } from '../stores/auth';
import { useEffect } from 'react';
import { refreshAccessToken } from '../lib/api';
import { jwtDecode } from 'jwt-decode';

export const useAuth = () => {
  const { accessToken, setTokens, logout } = useAuthStore();

  useEffect(() => {
    if (!accessToken) return;

    const decodedToken = jwtDecode(accessToken);
    const buffer = 5 * 60 * 1000; // 5 minutes

    const timeout = setTimeout(async () => {
      try {
        const newTokens = await refreshAccessToken();
        setTokens(newTokens);
      } catch (error) {
        logout();
      }
    }, decodedToken.exp * 1000 - Date.now() - buffer);

    return () => clearTimeout(timeout);
  }, [accessToken, setTokens, logout]);
};
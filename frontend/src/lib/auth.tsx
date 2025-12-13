/**
 * Zitadel OIDC Authentication for Spellbook
 * 
 * Uses react-oidc-context for OIDC state management with Zitadel IdP.
 */

import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from "react-oidc-context";
import { ReactNode } from "react";

// OIDC Configuration
const authConfig = {
  authority: import.meta.env.VITE_ZITADEL_AUTHORITY,
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_ZITADEL_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_ZITADEL_POST_LOGOUT_URI,
  scope: "openid profile email",
  response_type: "code",
};

// Validate config on load
const requiredVars = [
  "VITE_ZITADEL_AUTHORITY",
  "VITE_ZITADEL_CLIENT_ID",
  "VITE_ZITADEL_REDIRECT_URI",
  "VITE_ZITADEL_POST_LOGOUT_URI",
];

for (const varName of requiredVars) {
  if (!import.meta.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
  }
}

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider wraps the application with OIDC authentication context.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const onSigninCallback = () => {
    // Remove the code and state from URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  return (
    <OidcAuthProvider {...authConfig} onSigninCallback={onSigninCallback}>
      {children}
    </OidcAuthProvider>
  );
}

/**
 * Custom auth hook with Kylehub-specific helpers.
 */
export function useAuth() {
  const auth = useOidcAuth();
  const authority = import.meta.env.VITE_ZITADEL_AUTHORITY;

  // Extract roles from ID token claims
  const getRoles = (): string[] => {
    const claims = auth.user?.profile;
    if (!claims) return [];

    // Zitadel stores roles in this claim
    const rolesObj = claims["urn:zitadel:iam:org:project:roles"] as
      | Record<string, unknown>
      | undefined;

    if (!rolesObj) return [];
    return Object.keys(rolesObj);
  };

  // Get avatar URL from Zitadel
  const getAvatar = (): string | undefined => {
    const claims = auth.user?.profile;
    if (!claims) return undefined;
    return claims.picture as string | undefined;
  };

  // Check if user has a specific role
  const hasRole = (role: string): boolean => {
    return getRoles().includes(role);
  };

  // Check if user is admin
  const isAdmin = (): boolean => {
    return hasRole("ADMIN");
  };

  // Open Zitadel account settings in new tab
  const openSettings = (): void => {
    window.open(`${authority}/ui/console/users/me`, "_blank");
  };

  // User object compatible with existing code
  const user = auth.user?.profile ? {
    id: auth.user.profile.sub || "",
    email: auth.user.profile.email || "",
    username: auth.user.profile.preferred_username || auth.user.profile.email || "",
    is_active: true,
    is_admin: isAdmin(),
    created_at: new Date().toISOString(),
  } : null;

  return {
    // User info (compatible with existing User type)
    user,
    avatar: getAvatar(),
    accessToken: auth.user?.access_token,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,

    // Auth actions
    login: () => auth.signinRedirect(),
    logout: () =>
      auth.signoutRedirect({
        post_logout_redirect_uri: import.meta.env.VITE_ZITADEL_POST_LOGOUT_URI,
      }),
    openSettings,

    // Role helpers
    roles: getRoles(),
    hasRole,
    isAdmin,
  };
}

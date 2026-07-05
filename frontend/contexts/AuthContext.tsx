/**
 * frontend/contexts/AuthContext.tsx
 * ----------------------------------
 * Authentication context provider.
 *
 * On mount, calls GET /api/auth/me on the backend to determine if the user
 * has a valid JWT cookie. Exposes the authenticated user state and a logout
 * function to the entire component tree.
 *
 * Usage:
 *   // In any Client Component:
 *   const { user, isLoading, logout } = useAuth();
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  githubId: number;
  login: string;
  avatarUrl: string;
}

interface AuthContextValue {
  /** The authenticated user, or null if not logged in */
  user: AuthUser | null;
  /** True while the initial /me request is in flight */
  isLoading: boolean;
  /** Call this to log the user out — clears the JWT cookie and resets state */
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /**
   * Checks the current authentication state by calling the backend /me endpoint.
   * Called once on mount. If the JWT cookie is valid, populates the user state.
   */
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'GET',
        credentials: 'include', // Send the HttpOnly cookie
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = (await response.json()) as { user: AuthUser };
        setUser(data.user);
      } else {
        // 401 or other error — user is not authenticated
        setUser(null);
      }
    } catch (error) {
      // Network error or backend not running
      console.error('[AuthContext] Failed to check auth status:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Logs the user out by calling the backend logout endpoint,
   * which clears the HttpOnly cookie, then resets local state.
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('[AuthContext] Logout request failed:', error);
    } finally {
      setUser(null);
      // Redirect to the landing page
      window.location.href = '/';
    }
  }, []);

  // Run the auth check once when the provider mounts
  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const value: AuthContextValue = {
    user,
    isLoading,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Custom hook to consume the AuthContext.
 * Throws if used outside of an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

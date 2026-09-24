'use client';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, clearToken, ApiError } from '@/lib/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // isLoading stays true until we've checked for an existing token
  // and (if present) restored the session via GET /api/auth/me.
  const [isLoading, setIsLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const { user: me } = await api.get('/auth/me');
      setUser(me);
    } catch (err) {
      // Invalid/expired token — drop it silently and fall back to logged-out state
      clearToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (email, password) => {
    try {
      const { token, user: loggedInUser } = await api.post(
        '/auth/login',
        { email, password },
        { auth: false }
      );
      setToken(token);
      setUser(loggedInUser);
      return { success: true, user: loggedInUser };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
      return { success: false, error: message };
    }
  }, []);

  const logout = useCallback(() => {
    // Logout is a frontend-only operation — there is no server session to destroy.
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isAuthenticated: !!user, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

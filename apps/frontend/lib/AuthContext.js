'use client';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, clearToken, ApiError } from '@/lib/apiClient';
import { disconnectRealtime } from '@/lib/realtimeClient';

const AuthContext = createContext(null);

async function loadApplicationApis(role) {
  if (role === 'ADMIN') {
    const [me, dashboard] = await Promise.all([
      api.get('/admin/me'),
      api.get('/admin/dashboard'),
    ]);
    return { me, dashboard };
  }
  if (role === 'STUDENT') {
    const [me, dashboard] = await Promise.all([
      api.get('/student/me'),
      api.get('/student/dashboard'),
    ]);
    return { me, dashboard };
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [applicationError, setApplicationError] = useState(null);
  // isLoading stays true until we've checked for an existing token
  // and (if present) restored the session via GET /api/auth/me.
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthenticatedUser = useCallback(async (authenticatedUser) => {
    setUser(authenticatedUser);
    setApplicationError(null);
    try {
      const app = await loadApplicationApis(authenticatedUser?.role);
      setApplication(app);
    } catch (err) {
      setApplication(null);
      setApplicationError(err instanceof ApiError ? err.message : 'Unable to load application data.');
    }
  }, []);

  const restoreSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const { user: me } = await api.get('/auth/me');
      await applyAuthenticatedUser(me);
    } catch (err) {
      clearToken();
      setUser(null);
      setApplication(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyAuthenticatedUser]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (email, password) => {
    try {
      const { token } = await api.post(
        '/auth/login',
        { email, password },
        { auth: false }
      );
      setToken(token);
      const { user: me } = await api.get('/auth/me');
      await applyAuthenticatedUser(me);
      return { success: true, user: me };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
      return { success: false, error: message };
    }
  }, [applyAuthenticatedUser]);

  const register = useCallback(async (email, password) => {
    try {
      await api.post('/auth/register', { email, password }, { auth: false });
      return login(email, password);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        return { success: false, error: 'Registration failed. Please try again.' };
      }
      const fieldMessage = err.payload?.errors?.[0]?.message;
      return { success: false, error: fieldMessage || err.message };
    }
  }, [login]);

  const logout = useCallback(() => {
    // Logout is a frontend-only operation — there is no server session to destroy.
    disconnectRealtime();
    clearToken();
    setUser(null);
    setApplication(null);
    setApplicationError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        application,
        applicationError,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
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

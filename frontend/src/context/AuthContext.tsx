'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, onSessionGone } from '../lib/api';

export interface User {
  id: number;
  username: string;
  email: string;
  phone: string;
  role: 'CUSTOMER' | 'MANAGER' | 'ADMIN';
  first_name: string;
  last_name: string;
  date_joined: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** True once the server told us the session is no longer valid. */
  sessionExpired: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  /** Call this when any API call answers 401 so polling can stop. */
  reportUnauthorized: () => void;
  register: (data: {
    username: string;
    email: string;
    phone?: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const parseResponseData = async (res: Response) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  const text = await res.text();
  if (res.status >= 500) {
    throw new Error(`Server error (${res.status}). Please try again shortly.`);
  }
  throw new Error(`Error (${res.status}): ${text.slice(0, 80)}`);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const reportUnauthorized = useCallback(() => {
    setSessionExpired(true);
    setUser(null);
  }, []);

  const checkAuth = async () => {
    try {
      // apiFetch transparently refreshes an expired access cookie and replays the
      // request, so a returning visitor with a stale access token but a live
      // refresh token is restored instead of being logged out.
      const res = await apiFetch('/api/v1/auth/me/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const userData = await parseResponseData(res);
        if (userData.authenticated === false) {
          setSessionExpired(false);
          setUser(null);
        } else {
          setSessionExpired(false);
          setUser(userData);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // When a refresh fails anywhere in the app, the session is truly over. Drop
  // the cached user so every consumer re-renders against a signed-out state
  // instead of each call site having to notice its own 401.
  useEffect(() => onSessionGone(() => {
    setSessionExpired(true);
    setUser(null);
  }), []);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await fetch('/api/v1/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      const errorMsg = data.non_field_errors?.[0] || data.detail || (typeof data === 'object' ? Object.values(data)[0] : null) || 'Login failed';
      const formatted = Array.isArray(errorMsg) ? errorMsg.join(' ') : errorMsg;
      throw new Error(typeof formatted === 'string' ? formatted : JSON.stringify(formatted));
    }

    setSessionExpired(false);
    setUser(data.user);
  };

  const register = async (reqData: {
    username: string;
    email: string;
    phone?: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }) => {
    const res = await fetch('/api/v1/auth/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(reqData),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      const errorMsg = data.non_field_errors?.[0] || data.detail || (typeof data === 'object' ? Object.values(data)[0] : null) || 'Registration failed';
      const formatted = Array.isArray(errorMsg) ? errorMsg.join(' ') : errorMsg;
      throw new Error(typeof formatted === 'string' ? formatted : JSON.stringify(formatted));
    }

    setUser(data.user);
  };

  const logout = async () => {
    try {
      // Logout requires authentication, so an expired access token would
      // otherwise block it and leave the refresh cookie alive on the server.
      await apiFetch('/api/v1/auth/logout/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setSessionExpired(false);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionExpired, reportUnauthorized, login, register, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

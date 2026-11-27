'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  setUser: (user: User | null) => void;
  loading: boolean;
  /** True once the server told us the session is no longer valid. */
  sessionExpired: boolean;
  /**
   * Set when the backend could not be reached at all (cold start, 502, offline).
   * This is NOT a signed-out session: the cookies may be perfectly valid, so the
   * UI must offer a retry instead of bouncing the user to the sign-in form.
   */
  authError: string | null;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  phoneLogin: (phone: string, name?: string, otpCode?: string) => Promise<User>;
  sendPhoneOTP: (phone: string, name?: string) => Promise<{ success: boolean; message: string; debug_otp?: string; sms_note?: string }>;
  verifyPhoneOTP: (phone: string, otpCode: string, name?: string) => Promise<User>;
  /** Call this when any API call answers 401 so polling can stop. */
  reportUnauthorized: () => void;
  register: (data: {
    username?: string;
    email?: string;
    phone?: string;
    password: string;
    confirm_password?: string;
    full_name?: string;
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

const AUTH_STORAGE_KEY = 'buna_auth_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Start with deterministic SSR-safe defaults so server HTML and initial client
  // hydration match cleanly; hydrate cached user from localStorage on mount.
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const userRef = useRef<User | null>(null);

  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const setUser = useCallback((newUser: User | null) => {
    userRef.current = newUser;
    setUserState(newUser);
    if (typeof window !== 'undefined') {
      try {
        if (newUser) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
          if (newUser.phone) {
            localStorage.setItem('last_customer_phone', newUser.phone);
          }
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      } catch {}
    }
  }, []);

  const reportUnauthorized = useCallback(() => {
    setSessionExpired(true);
    setUser(null);
  }, [setUser]);

  const checkAuth = useCallback(async () => {
    // Only show loading if we don't already have a cached user:
    // this ensures the profile icon and dashboard remain rock-solid and stable!
    if (!userRef.current) {
      setLoading(true);
    }

    const MAX_ATTEMPTS = 3;
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        let transient = false;
        try {
          const res = await apiFetch('/api/v1/auth/me/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            timeoutMs: 10_000,
          });
          if (res.ok) {
            const userData = await parseResponseData(res);
            setAuthError(null);
            setSessionExpired(false);
            const verifiedUser = userData.authenticated === false ? null : userData;
            setUser(verifiedUser);
            return;
          }
          if (res.status < 500) {
            // A real answer: the caller is not signed in.
            setAuthError(null);
            setUser(null);
            return;
          }
          transient = true;
        } catch {
          transient = true;
        }

        if (!transient) return;
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
      // If server unreachable, keep existing cached user session
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as User;
        if (parsed) {
          userRef.current = parsed;
          setUserState(parsed);
          setLoading(false);
        }
      }
    } catch {}
    checkAuth();
  }, [checkAuth]);

  // When a refresh fails anywhere in the app, the session is truly over. Drop
  // the cached user so every consumer re-renders against a signed-out state
  // instead of each call site having to notice its own 401.
  useEffect(() => onSessionGone(() => {
    setSessionExpired(true);
    setUser(null);
  }), [setUser]);

function formatAuthError(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(item => formatAuthError(item, '')).filter(Boolean).join(' ');
  if (typeof data === 'object') {
    if (data.detail && typeof data.detail === 'string') return data.detail;
    if (data.error && typeof data.error === 'string') return data.error;
    if (data.error && typeof data.error === 'object' && data.error.message) return String(data.error.message);
    if (data.non_field_errors && Array.isArray(data.non_field_errors)) return data.non_field_errors.join(' ');
    const entries = Object.entries(data)
      .map(([key, val]) => {
        const valStr = formatAuthError(val, '');
        if (key === 'error' || key === 'detail' || key === 'message') return valStr;
        return `${key.replace(/_/g, ' ')}: ${valStr}`;
      })
      .filter(Boolean);
    if (entries.length > 0) return entries.join('. ');
  }
  return fallback;
}

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await fetch('/api/v1/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      throw new Error(formatAuthError(data, 'Login failed. Please check your credentials.'));
    }

    setSessionExpired(false);
    setAuthError(null);
    setUser(data.user);
  };

  const phoneLogin = async (phone: string, name?: string, otpCode?: string): Promise<User> => {
    const res = await fetch('/api/v1/auth/phone-login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, name, otp_code: otpCode }),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      throw new Error(formatAuthError(data, 'Phone sign-in failed. Please check your phone number.'));
    }

    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  };

  const sendPhoneOTP = async (phone: string, name?: string) => {
    const res = await fetch('/api/v1/auth/phone-otp/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, name }),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      throw new Error(formatAuthError(data, 'Failed to send verification code. Please check your phone number.'));
    }
    return data;
  };

  const verifyPhoneOTP = async (phone: string, otpCode: string, name?: string): Promise<User> => {
    const res = await fetch('/api/v1/auth/phone-otp/verify/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, otp_code: otpCode, name }),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      throw new Error(formatAuthError(data, 'Verification failed. Please check the code and try again.'));
    }

    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  };

  const register = async (reqData: {
    username?: string;
    email?: string;
    phone?: string;
    password: string;
    confirm_password?: string;
    full_name?: string;
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
      throw new Error(formatAuthError(data, 'Registration failed. Please check your details.'));
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
      if (typeof window !== 'undefined') {
        window.location.href = '/?welcome=1';
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        sessionExpired,
        authError,
        reportUnauthorized,
        login,
        phoneLogin,
        sendPhoneOTP,
        verifyPhoneOTP,
        register,
        logout,
        checkAuth,
      }}
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

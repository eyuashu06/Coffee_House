'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

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
  login: (usernameOrEmail: string, password: string) => Promise<void>;
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

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/v1/auth/me/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const userData = await parseResponseData(res);
        if (userData.authenticated === false) {
          setUser(null);
        } else {
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

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await fetch('/api/v1/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
    });

    const data = await parseResponseData(res);
    if (!res.ok) {
      const errorMsg = data.detail || data.non_field_errors?.[0] || (typeof data === 'object' ? Object.values(data)[0] : null) || 'Login failed';
      const formatted = Array.isArray(errorMsg) ? errorMsg.join(' ') : errorMsg;
      throw new Error(typeof formatted === 'string' ? formatted : JSON.stringify(formatted));
    }

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
      const errorMsg = data.detail || data.non_field_errors?.[0] || (typeof data === 'object' ? Object.values(data)[0] : null) || 'Registration failed';
      const formatted = Array.isArray(errorMsg) ? errorMsg.join(' ') : errorMsg;
      throw new Error(typeof formatted === 'string' ? formatted : JSON.stringify(formatted));
    }

    setUser(data.user);
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
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

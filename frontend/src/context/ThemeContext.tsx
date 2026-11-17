'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_COOKIE = 'app_theme';

export function ThemeProvider({
  children,
  initialTheme = 'dark',
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const pathname = usePathname();

  // On mount, synchronize with stored theme in localStorage or cookie
  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') {
        if (stored !== theme) {
          setThemeState(stored);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to sync DOM class, localStorage, and cookie
  const applyTheme = useCallback((targetTheme: Theme) => {
    if (typeof document !== 'undefined') {
      const isDark = targetTheme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
    }
    try {
      localStorage.setItem('theme', targetTheme);
    } catch {}
    try {
      document.cookie = `${THEME_COOKIE}=${targetTheme}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
  }, []);

  // Enforce theme whenever theme state changes
  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme } }));
    }
  }, [theme, applyTheme]);

  // Ensure theme remains enforced when navigating between routes (e.g. entering /manager)
  useEffect(() => {
    applyTheme(theme);
  }, [pathname, theme, applyTheme]);

  // Listen to cross-component or cross-tab theme changes
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
      }
    };
    const handleCustomChange = (e: any) => {
      if (e.detail?.theme && (e.detail.theme === 'light' || e.detail.theme === 'dark')) {
        setThemeState(e.detail.theme);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('app-theme-change', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app-theme-change', handleCustomChange);
    };
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, [applyTheme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
  }), [theme, setTheme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

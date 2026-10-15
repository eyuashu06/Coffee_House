'use client';

import React, { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Sun/moon switch for the light/dark palettes defined in globals.css.
 *
 * The `dark` class lives on <html>; a tiny inline script in layout.tsx applies the
 * stored preference before first paint, and this component just flips it afterwards.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode — the toggle still works for this visit */
    }
  }, [theme]);

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={theme === 'dark'}
      data-testid="theme-toggle"
      className={`h-9 w-9 rounded-full border border-[var(--border)] text-[var(--muted)] flex items-center justify-center hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors ${className}`}
    >
      <span
        className="material-symbols-outlined text-[19px] leading-none"
        style={{ fontSize: 19, lineHeight: 1, display: 'inline-block' }}
      >
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  );
}

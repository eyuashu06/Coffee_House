'use client';

import React from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * Sun/moon switch for the light/dark palettes defined in globals.css.
 *
 * Connected directly to ThemeContext so all toggles stay perfectly in sync
 * and the user's choice is preserved across route changes and server renders.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
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

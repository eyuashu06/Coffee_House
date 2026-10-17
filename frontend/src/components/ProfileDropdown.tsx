'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface ProfileDropdownProps {
  onOpenSignIn?: () => void;
  onOpenSignUp?: () => void;
  align?: 'left' | 'right';
  className?: string;
  isManagerPage?: boolean;
}

export default function ProfileDropdown({
  onOpenSignIn,
  onOpenSignUp,
  align = 'right',
  className = '',
  isManagerPage = false,
}: ProfileDropdownProps) {
  const { user, loading, logout } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  if (loading) {
    return (
      <div className="h-9 w-24 bg-surface-2 animate-pulse rounded-full border border-[var(--border)]" />
    );
  }

  if (!user) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {onOpenSignIn ? (
          <button
            onClick={onOpenSignIn}
            className="h-9 px-3.5 sm:px-4 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] sm:text-[14px] flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <i className="ph ph-sign-in text-[16px]"></i>
            <span>{t('Sign In')}</span>
          </button>
        ) : (
          <Link
            href="/account"
            className="h-9 px-3.5 sm:px-4 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] sm:text-[14px] flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <i className="ph ph-sign-in text-[16px]"></i>
            <span>{t('Sign In')}</span>
          </Link>
        )}

        {onOpenSignUp && (
          <button
            onClick={onOpenSignUp}
            className="hidden sm:flex h-9 px-4 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold text-[13.5px] sm:text-[14px] items-center hover:brightness-110 transition-all shadow-sm"
          >
            {t('Sign Up')}
          </button>
        )}
      </div>
    );
  }

  const displayName = user.first_name
    ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
    : user.username;

  const initial = (user.first_name?.[0] || user.username?.[0] || 'U').toUpperCase();
  const isStaff = user.role === 'ADMIN' || user.role === 'MANAGER';

  const roleLabel =
    user.role === 'ADMIN'
      ? t('Admin')
      : user.role === 'MANAGER'
      ? t('Manager')
      : t('Customer');

  const roleBadgeColor =
    user.role === 'ADMIN'
      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800'
      : user.role === 'MANAGER'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800'
      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]';

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    router.push('/?welcome=1');
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button on the Top Right */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={t('Account')}
        className={`h-9.5 px-2.5 sm:px-3 rounded-full border transition-all flex items-center gap-2 select-none group ${
          isOpen
            ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-md'
            : 'bg-surface-2 border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
        }`}
      >
        {/* User Avatar Circle */}
        <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-xs flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
          {initial}
        </div>

        {/* Display Name */}
        <span className="text-[13.5px] font-medium max-w-[110px] sm:max-w-[140px] truncate leading-none">
          {displayName}
        </span>

        {/* Staff Role Badge on Trigger (if admin/manager) */}
        {isStaff && (
          <span
            className={`hidden md:inline-block px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border ${roleBadgeColor}`}
          >
            {roleLabel}
          </span>
        )}

        {/* Caret Chevron */}
        <i
          className={`ph ph-caret-down text-[13px] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[var(--accent)]' : 'text-[var(--muted)] group-hover:text-[var(--accent)]'
          }`}
        ></i>
      </button>

      {/* Dropdown Menu Box */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 w-64 sm:w-72 bg-surface-2 border border-[var(--border)] rounded-[20px] shadow-2xl py-2 z-50 animate-fade-in text-[var(--text)] backdrop-blur-md`}
        >
          {/* User Profile Card Header */}
          <div className="px-4 py-3 border-b border-[var(--border)] bg-surface/50 rounded-t-[19px] mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-base flex items-center justify-center shrink-0 shadow-md">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-bold text-[var(--text)] truncate leading-tight">
                  {displayName}
                </p>
                <p className="text-[11.5px] text-[var(--muted)] truncate leading-tight mt-0.5">
                  {user.email || user.username}
                </p>
                <div className="mt-1.5">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${roleBadgeColor}`}
                  >
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Menu Links */}
          <div className="px-1.5 py-1 space-y-0.5">
            {/* Edit Profile */}
            <Link
              href="/account?tab=profile"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group"
            >
              <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                <i className="ph ph-user-gear text-[16px]"></i>
              </span>
              <span>{t('Edit Profile')}</span>
            </Link>

            {/* My Orders */}
            <Link
              href="/account?tab=orders"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group"
            >
              <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                <i className="ph ph-receipt text-[16px]"></i>
              </span>
              <span>{t('My Orders')}</span>
            </Link>

            {/* Table Reservations */}
            <Link
              href="/account?tab=reservations"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group"
            >
              <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                <i className="ph ph-calendar-check text-[16px]"></i>
              </span>
              <span>{t('Table Reservations')}</span>
            </Link>

            {/* Delivery Addresses */}
            <Link
              href="/account?tab=addresses"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group"
            >
              <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                <i className="ph ph-map-pin text-[16px]"></i>
              </span>
              <span>{t('Delivery Addresses')}</span>
            </Link>

            {/* Manager Dashboard (Staff only) */}
            {isStaff && (
              <Link
                href="/manager"
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-2 rounded-xl text-[13.5px] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors flex items-center gap-2.5 font-semibold group"
              >
                <span className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] transition-colors">
                  <i className="ph ph-chart-line-up text-[16px]"></i>
                </span>
                <span>{t('Manager Dashboard')}</span>
              </Link>
            )}

            {/* If on manager page or staff, offer quick link back to store */}
            {isManagerPage && (
              <Link
                href="/?welcome=1"
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group"
              >
                <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                  <i className="ph ph-storefront text-[16px]"></i>
                </span>
                <span>{t('View Storefront')}</span>
              </Link>
            )}
          </div>

          {/* Sign Out Button */}
          <div className="pt-1 mt-1 border-t border-[var(--border)] px-1.5">
            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 rounded-xl text-[13.5px] text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/40 hover:text-red-400 transition-colors flex items-center gap-2.5 font-semibold group"
            >
              <span className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 group-hover:bg-red-500/20 transition-colors">
                <i className="ph ph-sign-out text-[16px]"></i>
              </span>
              <span>{t('Sign Out')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

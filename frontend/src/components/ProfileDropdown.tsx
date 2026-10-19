'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import EthiopianPhoneInput from './EthiopianPhoneInput';

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
  const { user, loading, logout, checkAuth } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Populate form with current user data whenever user or modal state changes
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setPhone(user.phone || '');
    }
  }, [user, isEditModalOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsEditModalOpen(false);
      }
    }
    if (isOpen || isEditModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isEditModalOpen]);

  const handleNavigate = (url: string) => {
    setIsOpen(false);
    if (typeof window === 'undefined') return;

    const currentPath = window.location.pathname;
    const targetPath = url.split('?')[0];

    if (currentPath === targetPath) {
      // If already on this page (e.g. /account switching tabs), push state and notify listeners
      window.history.pushState({}, '', url);
      window.dispatchEvent(new Event('popstate'));
      window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { targetUrl: url } }));
      router.push(url);
    } else {
      router.push(url);
      setTimeout(() => {
        if (window.location.pathname !== targetPath) {
          window.location.href = url;
        }
      }, 250);
    }
  };

  const handleLogout = async () => {
    setIsOpen(false);
    try {
      await logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Hard refresh to landing page to completely clear any lingering session or cache
    window.location.href = '/?welcome=1';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setEditMsg(null);
    try {
      const res = await apiFetch('/api/v1/auth/me/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        }),
      });

      if (res.ok) {
        setEditMsg({ type: 'success', text: t('Profile updated successfully!') });
        await checkAuth();
        setTimeout(() => {
          setIsEditModalOpen(false);
          setEditMsg(null);
        }, 1200);
      } else {
        const err = await res.json().catch(() => ({}));
        setEditMsg({ type: 'error', text: err.detail || t('Failed to update profile.') });
      }
    } catch {
      setEditMsg({ type: 'error', text: t('Network error. Please try again.') });
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="h-9.5 w-9.5 sm:w-24 bg-surface-2 animate-pulse rounded-full border border-[var(--border)] shrink-0" />
    );
  }

  if (!user) {
    return (
      <div className={`flex items-center gap-1.5 sm:gap-2 shrink-0 ${className}`}>
        {onOpenSignIn ? (
          <button
            type="button"
            onClick={onOpenSignIn}
            className="h-9.5 w-9.5 sm:w-auto p-0 sm:px-3.5 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] sm:text-[14px] flex items-center justify-center sm:justify-start gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer shrink-0"
            title={t('Sign In')}
            aria-label={t('Sign In')}
          >
            <i className="ph ph-user text-[17px]"></i>
            <span className="hidden sm:inline">{t('Sign In')}</span>
          </button>
        ) : (
          <Link
            href="/account"
            className="h-9.5 w-9.5 sm:w-auto p-0 sm:px-3.5 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] sm:text-[14px] flex items-center justify-center sm:justify-start gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer shrink-0"
            title={t('Sign In')}
            aria-label={t('Sign In')}
          >
            <i className="ph ph-user text-[17px]"></i>
            <span className="hidden sm:inline">{t('Sign In')}</span>
          </Link>
        )}

        {onOpenSignUp && (
          <button
            type="button"
            onClick={onOpenSignUp}
            className="hidden sm:flex h-9.5 px-4 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold text-[13.5px] sm:text-[14px] items-center hover:brightness-110 transition-all shadow-sm cursor-pointer shrink-0"
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

  return (
    <>
      <div className={`relative shrink-0 ${className}`} ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label={t('Account')}
          className={`h-9.5 w-9.5 sm:w-auto p-0 sm:px-3 rounded-full border transition-all flex items-center justify-center sm:justify-start gap-2 select-none cursor-pointer group shrink-0 ${
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
          <span className="hidden sm:inline text-[13.5px] font-medium max-w-[110px] sm:max-w-[140px] truncate leading-none">
            {displayName}
          </span>

          {/* Staff Role Badge on Trigger */}
          {isStaff && (
            <span
              className={`hidden md:inline-block px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase rounded-full border ${roleBadgeColor}`}
            >
              {roleLabel}
            </span>
          )}

          {/* Caret Chevron */}
          <i
            className={`hidden sm:inline ph ph-caret-down text-[13px] transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[var(--accent)]' : 'text-[var(--muted)] group-hover:text-[var(--accent)]'
            }`}
          ></i>
        </button>

        {/* Dropdown Menu Box */}
        {isOpen && (
          <div
            className={`absolute ${
              align === 'right' ? 'right-0' : 'left-0'
            } mt-2 w-[calc(100vw-32px)] max-w-[280px] sm:max-w-xs sm:w-72 bg-surface-2 border border-[var(--border)] rounded-[20px] shadow-2xl py-2 z-[100] animate-fade-in text-[var(--text)] backdrop-blur-md`}
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
              {/* Edit Profile Action */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsEditModalOpen(true);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                  <i className="ph ph-user-gear text-[16px]"></i>
                </span>
                <span>{t('Edit Profile')}</span>
              </button>

              {/* For Customers or when outside manager page */}
              {!isManagerPage && (
                <>
                  <button
                    type="button"
                    onClick={() => handleNavigate('/account?tab=orders')}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                      <i className="ph ph-receipt text-[16px]"></i>
                    </span>
                    <span>{t('My Orders')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavigate('/account?tab=reservations')}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                      <i className="ph ph-calendar-check text-[16px]"></i>
                    </span>
                    <span>{t('Table Reservations')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNavigate('/account?tab=addresses')}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                      <i className="ph ph-map-pin text-[16px]"></i>
                    </span>
                    <span>{t('Delivery Addresses')}</span>
                  </button>
                </>
              )}

              {/* Manager Dashboard (Staff only, when not already on manager page) */}
              {isStaff && !isManagerPage && (
                <button
                  type="button"
                  onClick={() => handleNavigate('/manager')}
                  className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors flex items-center gap-2.5 font-semibold group cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] transition-colors">
                    <i className="ph ph-chart-line-up text-[16px]"></i>
                  </span>
                  <span>{t('Manager Dashboard')}</span>
                </button>
              )}

              {/* View Customer Storefront (when on manager or account page) */}
              <button
                type="button"
                onClick={() => handleNavigate('/?welcome=1')}
                className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors flex items-center gap-2.5 font-medium group cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-surface border border-[var(--border)] flex items-center justify-center text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)] transition-colors">
                  <i className="ph ph-storefront text-[16px]"></i>
                </span>
                <span>{t('View Storefront')}</span>
              </button>
            </div>

            {/* Sign Out Button */}
            <div className="pt-1 mt-1 border-t border-[var(--border)] px-1.5">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-3 py-2 rounded-xl text-[13.5px] text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/40 hover:text-red-400 transition-colors flex items-center gap-2.5 font-semibold group cursor-pointer"
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

      {/* INLINE EDIT PROFILE MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md bg-surface-2 border border-[var(--border)] rounded-[24px] shadow-2xl overflow-hidden p-6 text-[var(--text)] relative animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] flex items-center justify-center text-lg">
                  <i className="ph ph-user-gear"></i>
                </div>
                <div>
                  <h3 className="font-display text-[20px] font-bold text-[var(--text)] leading-tight">
                    {t('Edit Profile')}
                  </h3>
                  <p className="text-[12px] text-[var(--muted)]">{user.email || user.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <i className="ph ph-x text-base"></i>
              </button>
            </div>

            {/* Alert Message */}
            {editMsg && (
              <div
                className={`mb-4 p-3 rounded-[12px] text-xs font-semibold flex items-center gap-2 ${
                  editMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
                }`}
              >
                <i className={`ph ${editMsg.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'} text-base`}></i>
                <span>{editMsg.text}</span>
              </div>
            )}

            {/* Edit Form */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t('First Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Abebe"
                    className="w-full h-10 px-3 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t('Last Name')}
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Bikila"
                    className="w-full h-10 px-3 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Phone Number')}
                </label>
                <EthiopianPhoneInput
                  value={phone}
                  onChange={(val) => setPhone(val)}
                  className="h-10 text-[14px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Role')}
                </label>
                <div className="h-10 px-3 rounded-[12px] bg-surface/60 border border-[var(--border)] text-[var(--muted)] text-[13px] flex items-center justify-between font-mono">
                  <span>{roleLabel}</span>
                  <i className="ph ph-lock text-sm opacity-60"></i>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 h-11 rounded-[12px] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] font-semibold text-[13.5px] transition-colors cursor-pointer"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-1 h-11 rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-[13.5px] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isSavingProfile ? (
                    <>
                      <i className="ph ph-spinner animate-spin"></i>
                      <span>{t('Saving...')}</span>
                    </>
                  ) : (
                    <>
                      <i className="ph ph-floppy-disk"></i>
                      <span>{t('Save Changes')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-2 text-center border-t border-[var(--border)]/50 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    handleNavigate('/account?tab=profile');
                  }}
                  className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <span>{t('Open Full Account Settings')}</span>
                  <i className="ph ph-arrow-right"></i>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

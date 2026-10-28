'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthModal from './AuthModal';
import NotificationsDropdown from './NotificationsDropdown';
import LanguageToggle from './LanguageToggle';
import Link from 'next/link';

interface HeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  onOpenSommelier: () => void;
}

export default function Header({ cartCount, onOpenCart, onOpenSommelier }: HeaderProps) {
  const { user, loading, logout } = useAuth();
  const { t } = useLanguage();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 w-full z-50 pt-safe bg-surface-2 border-b border-[var(--border)] shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
        <div className="max-w-7xl mx-auto h-16 px-2.5 sm:px-6 flex items-center justify-between gap-1.5 sm:gap-4">
          {/* Brand Emblem */}
          <Link href="/?welcome=1" className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer group shrink">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[var(--accent-soft)] flex items-center justify-center border border-[var(--accent)] group-hover:scale-105 transition-transform shrink-0">
              <span className="material-symbols-outlined text-[var(--accent)] text-lg sm:text-xl">local_cafe</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-display text-sm sm:text-lg text-[var(--accent)] tracking-wide font-bold truncate">{t('Artisanal Reserve')}</span>
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-[var(--muted)] truncate">{t('Craft Micro-Lot Roasters')}</span>
            </div>
          </Link>

          {/* Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Language Switcher */}
            <LanguageToggle className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-surface-container-high/80 hover:bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] text-[11px] sm:text-xs font-bold flex items-center gap-1 transition-all shadow-sm" />

            {/* AI Sommelier Button */}
            <button
              onClick={onOpenSommelier}
              title={t('Ask AI Sommelier')}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-surface-container-high/80 hover:bg-surface-bright text-[var(--accent)] border border-[var(--accent)] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              <span className="hidden sm:inline">{t('Ask AI Sommelier')}</span>
            </button>

            {/* Cart Drawer Trigger */}
            <button
              onClick={onOpenCart}
              aria-label="Shopping Cart"
              className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-surface-container/60 border border-white/5 shrink-0"
            >
              <span className="material-symbols-outlined text-[19px] sm:text-[22px]">shopping_bag</span>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full bg-secondary-container text-on-secondary text-[9px] sm:text-[10px] font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(223,134,0,0.5)]">
                  {cartCount}
                </span>
              )}
            </button>

            <NotificationsDropdown />

            {/* Auth Button / User Dropdown */}
            {loading ? (
              <div className="w-8 sm:w-[88px] h-8 sm:h-[32px] bg-white/10 animate-pulse rounded-full" />
            ) : user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] text-xs font-semibold hover:bg-[#f7b5be]/25 transition-all"
                >
                  <span className="material-symbols-outlined text-base">account_circle</span>
                  <span className="hidden sm:inline max-w-[80px] sm:max-w-[100px] truncate">{user.username}</span>
                  {user.role !== 'CUSTOMER' && (
                    <span className="px-1.5 py-0.5 text-[9px] rounded uppercase bg-[#f7b5be] text-[#4e232b] font-bold">
                      {user.role}
                    </span>
                  )}
                  <span className="material-symbols-outlined text-xs">arrow_drop_down</span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface-2 border border-[var(--border)] rounded-xl shadow-xl py-2 z-50 animate-fade-in">
                    <div className="px-4 py-2 border-b border-[var(--border)] text-xs">
                      <p className="font-semibold text-[var(--text)] truncate">{user.first_name || user.username}</p>
                      <p className="text-[var(--muted)] text-[11px] truncate">{user.email}</p>
                    </div>

                    {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                      <Link
                        href="/manager"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full px-4 py-2 text-left text-xs text-[var(--accent)] hover:bg-[#20201f] flex items-center gap-2 font-medium"
                      >
                        <span className="material-symbols-outlined text-base">dashboard</span>
                        {t('Manager Dashboard')}
                      </Link>
                    )}

                    <Link
                      href="/account"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full px-4 py-2 text-left text-xs text-[var(--text)] hover:bg-[#20201f] flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">person</span>
                      {t('My Orders & Profile')}
                    </Link>

                    <button
                      onClick={async () => {
                        setIsUserMenuOpen(false);
                        try {
                          await logout();
                        } catch (e) {
                          console.error('Logout error:', e);
                        }
                        if (typeof window !== 'undefined') {
                          window.location.href = '/?welcome=1';
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-[#20201f] flex items-center gap-2 border-t border-[var(--border)] mt-1"
                    >
                      <span className="material-symbols-outlined text-base">logout</span>
                      {t('Sign Out')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setAuthMode('LOGIN'); setIsAuthModalOpen(true); }}
                className="px-2.5 sm:px-3.5 py-1.5 rounded-full bg-[#f7b5be] text-[#4e232b] text-xs font-bold hover:brightness-110 transition-all shadow-[0_2px_10px_rgba(251,187,80,0.25)] flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">login</span>
                <span className="hidden sm:inline">{t('Sign In')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authMode}
      />
    </>
  );
}

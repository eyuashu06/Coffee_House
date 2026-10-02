'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthModal from './AuthModal';
import NotificationsDropdown from './NotificationsDropdown';
import Link from 'next/link';

interface HeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  onOpenSommelier: () => void;
}

export default function Header({ cartCount, onOpenCart, onOpenSommelier }: HeaderProps) {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 w-full z-50 pt-safe bg-primary-container/90 backdrop-blur-xl border-b border-primary/20 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Brand Emblem */}
          <Link href="/" className="flex items-center gap-3 min-w-0 cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-tertiary/20 flex items-center justify-center border border-tertiary/40 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-tertiary text-xl">local_cafe</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline text-lg text-tertiary tracking-wide font-bold truncate">{t('Artisanal Reserve')}</span>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant truncate">{t('Craft Micro-Lot Roasters')}</span>
            </div>
          </Link>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              title="Switch Language / ቋንቋ ቀይር"
              className="px-2.5 py-1.5 rounded-full bg-surface-container-high/80 hover:bg-tertiary/20 text-tertiary border border-tertiary/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-base">translate</span>
              <span>{language === 'en' ? '🇪🇹 አማ' : '🇬🇧 EN'}</span>
            </button>

            {/* AI Sommelier Button */}
            <button
              onClick={onOpenSommelier}
              className="px-3 py-1.5 rounded-full bg-surface-container-high/80 hover:bg-surface-bright text-tertiary border border-tertiary/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              <span className="hidden sm:inline">{t('Ask AI Sommelier')}</span>
            </button>

            {/* Cart Drawer Trigger */}
            <button
              onClick={onOpenCart}
              aria-label="Shopping Cart"
              className="relative w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:text-tertiary transition-colors bg-surface-container/60 border border-white/5"
            >
              <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-secondary-container text-on-secondary text-[10px] font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(223,134,0,0.5)]">
                  {cartCount}
                </span>
              )}
            </button>

            <NotificationsDropdown />

            {/* Auth Button / User Dropdown */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-tertiary/15 border border-tertiary/30 text-tertiary text-xs font-semibold hover:bg-tertiary/25 transition-all"
                >
                  <span className="material-symbols-outlined text-base">account_circle</span>
                  <span className="max-w-[100px] truncate">{user.username}</span>
                  {user.role !== 'CUSTOMER' && (
                    <span className="px-1.5 py-0.5 text-[9px] rounded uppercase bg-tertiary text-on-tertiary font-bold">
                      {user.role}
                    </span>
                  )}
                  <span className="material-symbols-outlined text-xs">arrow_drop_down</span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-primary-container border border-white/10 rounded-xl shadow-xl py-2 z-50 animate-fade-in">
                    <div className="px-4 py-2 border-b border-white/10 text-xs">
                      <p className="font-semibold text-on-surface truncate">{user.first_name || user.username}</p>
                      <p className="text-on-surface-variant text-[11px] truncate">{user.email}</p>
                    </div>

                    {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                      <Link
                        href="/manager"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full px-4 py-2 text-left text-xs text-tertiary hover:bg-white/5 flex items-center gap-2 font-medium"
                      >
                        <span className="material-symbols-outlined text-base">dashboard</span>
                        Manager Dashboard
                      </Link>
                    )}

                    <Link
                      href="/account"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full px-4 py-2 text-left text-xs text-on-surface hover:bg-white/5 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">person</span>
                      My Orders & Profile
                    </Link>

                    <button
                      onClick={() => { setIsUserMenuOpen(false); logout(); }}
                      className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2 border-t border-white/10 mt-1"
                    >
                      <span className="material-symbols-outlined text-base">logout</span>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setAuthMode('LOGIN'); setIsAuthModalOpen(true); }}
                className="px-3.5 py-1.5 rounded-full bg-tertiary text-on-tertiary text-xs font-bold hover:brightness-110 transition-all shadow-[0_2px_10px_rgba(251,187,80,0.25)] flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">login</span>
                <span>Sign In</span>
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

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'LOGIN' | 'REGISTER';
  promptMessage?: string | null;
  onSuccessCallback?: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'LOGIN',
  promptMessage = null,
  onSuccessCallback,
}: AuthModalProps) {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form states
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [rawPhone, setRawPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  if (!isOpen) return null;

  // Format phone number into +251 format
  const formatPhone = (val: string) => {
    const cleaned = val.replace(/[\s\-\(\)]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+251')) return cleaned;
    if (cleaned.startsWith('0')) return `+251${cleaned.slice(1)}`;
    if (cleaned.startsWith('9') || cleaned.startsWith('7')) return `+251${cleaned}`;
    return cleaned;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      if (mode === 'LOGIN') {
        await login(usernameOrEmail, password);
        setSuccess('Logged in successfully!');
        setTimeout(() => {
          onClose();
          fetch('/api/v1/auth/me/', { credentials: 'include' })
            .then(r => r.json())
            .then(userData => {
              if (userData?.role === 'MANAGER' || userData?.role === 'ADMIN') {
                router.push('/manager');
              } else if (onSuccessCallback) {
                onSuccessCallback();
              }
            })
            .catch(() => { if (onSuccessCallback) onSuccessCallback(); });
        }, 400);
      } else if (mode === 'REGISTER') {
        const formattedPhone = formatPhone(rawPhone);
        await register({
          username,
          email,
          phone: formattedPhone || undefined,
          password,
          first_name: firstName,
          last_name: lastName,
        });
        setSuccess('Account created successfully!');
        setTimeout(() => {
          onClose();
          if (onSuccessCallback) onSuccessCallback();
        }, 500);
      } else if (mode === 'FORGOT_PASSWORD') {
        const res = await fetch('/api/v1/auth/password-reset/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetEmail }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Server error sending reset email.');
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.email?.[0] || 'Password reset request failed.');
        }
        setSuccess('Password reset link sent to your email.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      {/* Dynamic responsive card size for all devices */}
      <div className="relative w-[95%] sm:w-full max-w-md my-auto bg-primary-container/95 border border-tertiary/30 rounded-2xl shadow-2xl p-5 sm:p-7 text-on-surface max-h-[90vh] overflow-y-auto">
        {/* Ambient background glow */}
        <div className="absolute -top-20 -right-20 w-36 h-36 bg-tertiary/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-tertiary text-2xl">
              {mode === 'LOGIN' ? 'login' : mode === 'REGISTER' ? 'person_add' : 'lock_reset'}
            </span>
            <h3 className="font-headline text-lg sm:text-xl font-bold text-tertiary">
              {mode === 'LOGIN' ? t('Welcome Back') : mode === 'REGISTER' ? t('Join Artisanal Reserve') : 'Reset Password'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-tertiary bg-white/5 hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Prompt Message Banner (e.g. for Order Checkout requirement) */}
        {promptMessage && (
          <div className="mt-3.5 p-3 rounded-lg bg-tertiary/15 border border-tertiary/30 text-tertiary text-xs flex items-center gap-2 font-medium">
            <span className="material-symbols-outlined text-base shrink-0">info</span>
            <span>{promptMessage}</span>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mt-3.5 p-3 rounded-lg bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
            <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">error</span>
            <span className="break-words leading-relaxed">{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-3.5 p-3 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2">
            <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">check_circle</span>
            <span>{success}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {mode === 'LOGIN' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  {t('Username or Email')}
                </label>
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="e.g. Abebe or abebe@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  {t('Password')}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary transition-colors"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setError(null); setSuccess(null); setMode('FORGOT_PASSWORD'); }}
                  className="text-xs text-tertiary hover:underline"
                >
                  {t('Forgot password?')}
                </button>
              </div>
            </>
          )}

          {mode === 'REGISTER' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    {t('First Name')}
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Abebe"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Bikila"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a unique username"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="abebe@example.com"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  {t('Phone Number')}
                </label>
                <div className="flex items-center rounded-lg bg-surface-container/80 border border-white/10 focus-within:border-tertiary overflow-hidden">
                  <span className="px-3 py-2 bg-white/5 border-r border-white/10 text-tertiary font-bold text-xs shrink-0 select-none flex items-center gap-1">
                    🇪🇹 +251
                  </span>
                  <input
                    type="tel"
                    value={rawPhone.replace(/^\+251/, '')}
                    onChange={(e) => setRawPhone(e.target.value)}
                    placeholder="911223344 or 711223344"
                    className="w-full px-3 py-2 bg-transparent text-on-surface text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  {t('Password')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary"
                />
              </div>
            </>
          )}

          {mode === 'FORGOT_PASSWORD' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Registered Email Address
              </label>
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="Enter your account email"
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface-container/80 border border-white/10 text-on-surface text-sm focus:outline-none focus:border-tertiary"
              />
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-3 py-2.5 rounded-xl bg-tertiary text-on-tertiary font-bold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_rgba(251,187,80,0.25)] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-on-tertiary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'LOGIN' ? t('Sign In') : mode === 'REGISTER' ? t('Create Account') : 'Send Reset Link'}
                </span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Mode Footer Switch */}
        <div className="mt-5 pt-3.5 border-t border-white/10 text-center text-xs text-on-surface-variant">
          {mode === 'LOGIN' ? (
            <p>
              {t("Don't have an account? Sign Up")}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('REGISTER'); }}
                className="text-tertiary font-semibold hover:underline ml-1"
              >
                Sign Up
              </button>
            </p>
          ) : (
            <p>
              {t('Already have an account? Sign In')}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('LOGIN'); }}
                className="text-tertiary font-semibold hover:underline ml-1"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

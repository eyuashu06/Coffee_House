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
  /** Where to send the user after a successful sign-in (e.g. /account). */
  postLoginRedirect?: string | null;
}

const DEMO_ACCOUNTS = [
  { label: 'Administrator', role: 'Admin', email: 'admin@gmail.com', password: 'AdminPassword123!' },
  { label: 'Manager / Staff', role: 'Manager', email: 'manager@gmail.com', password: 'ManagerPassword123!' },
  { label: 'Customer', role: 'Customer', email: 'customer@gmail.com', password: 'CustomerPassword123!' },
];

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'LOGIN',
  promptMessage = null,
  onSuccessCallback,
  postLoginRedirect = null,
}: AuthModalProps) {
  const { login, register } = useAuth();
  const { t, language } = useLanguage();
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

  // Reject placeholder / undeliverable domains client-side (we email receipts there,
  // and the payment gateway refuses domains without mail infrastructure).
  const validateSignupEmail = (value: string): string | null => {
    const emailValue = value.trim();
    if (!emailValue) return t('Email address is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailValue)) {
      return t('Enter a valid email address, e.g. name@gmail.com.');
    }
    const domain = emailValue.split('@')[1].toLowerCase();
    const blocked = ['example.com', 'example.net', 'example.org', 'test.com', 'localhost',
                     'artisanalreserve.com', 'artisanalcoffee.com', 'bunahub.et', 'mailinator.com'];
    if (blocked.includes(domain)) {
      return language === 'am'
        ? `«${domain}» መልእክት ሊቀበል አይችልም። በእውነት የራስዎ የሆነ አድራሻ ይጠቀሙ።`
        : `'${domain}' cannot receive email. Please use an address you actually control.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === 'REGISTER') {
      const emailError = validateSignupEmail(email);
      if (emailError) {
        setError(emailError);
        return;
      }
      if (!username.trim() || username.trim().length < 3) {
        setError(t('Username must be at least 3 characters long.'));
        return;
      }
      if (!password || password.length < 6) {
        setError(t('Password must be at least 6 characters long.'));
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === 'LOGIN') {
        await login(usernameOrEmail, password);
        setSuccess(t('Logged in successfully!'));
        setTimeout(() => {
          onClose();
          fetch('/api/v1/auth/me/', { credentials: 'include' })
            .then(r => r.json())
            .then(userData => {
              if (userData?.role === 'MANAGER' || userData?.role === 'ADMIN') {
                router.push('/manager');
              } else if (postLoginRedirect) {
                router.push(postLoginRedirect);
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
        setSuccess(t('Account created successfully!'));
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
      <div className="relative w-[95%] sm:w-full max-w-md my-auto bg-[#131313] border border-[#514345] rounded-2xl shadow-2xl p-5 sm:p-7 text-[#e5e2e1] max-h-[90vh] overflow-y-auto">
        {/* Ambient background glow */}
        <div className="absolute -top-20 -right-20 w-36 h-36 bg-[#2b1b1e] rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#514345]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#f7b5be] text-2xl">
              {mode === 'LOGIN' ? 'login' : mode === 'REGISTER' ? 'person_add' : 'lock_reset'}
            </span>
            <h3 className="font-display text-lg sm:text-xl font-bold text-[#f7b5be]">
              {mode === 'LOGIN' ? t('Welcome Back') : mode === 'REGISTER' ? t('Join Artisanal Reserve') : t('Reset Password')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#9e8d8e] hover:text-[#f7b5be] bg-[#20201f] hover:bg-[#2c2b2a] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Prompt Message Banner (e.g. for Order Checkout requirement) */}
        {promptMessage && (
          <div className="mt-3.5 p-3 rounded-lg bg-[#2b1b1e] border border-[#683941] text-[#f7b5be] text-xs flex items-center gap-2 font-medium">
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
                <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                  {t('Username or Email')}
                </label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder={language === 'am' ? 'abebe@gmail.com ወይም አበበ' : 'abebe@gmail.com or Abebe'}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                  {t('Password')}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('Enter your password')}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be] transition-colors"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setError(null); setSuccess(null); setMode('FORGOT_PASSWORD'); }}
                  className="text-xs text-[#f7b5be] hover:underline"
                >
                  {t('Forgot password?')}
                </button>
              </div>

              {/* Demo accounts - tap to fill, then Sign in */}
              <div className="rounded-xl border border-[#514345] bg-[#131313]/70 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#9e8d8e] mb-2">
                  {t('Demo accounts — tap to fill')}
                </p>
                <div className="grid gap-1.5">
                  {DEMO_ACCOUNTS.map(acct => (
                    <button
                      key={acct.email}
                      type="button"
                      onClick={() => {
                        setUsernameOrEmail(acct.email);
                        setPassword(acct.password);
                        setError(null);
                      }}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#1c1b1b] border border-[#514345]/70 hover:border-[#f7b5be] transition-colors text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-[#e5e2e1] truncate">{t(acct.label)}</span>
                        <span className="block text-[11px] text-[#9e8d8e] truncate">{acct.email} · {acct.password}</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#f7b5be] shrink-0">{t(acct.role)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === 'REGISTER' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                    {t('First Name')}
                  </label>
                  <input
                    type="text"
                    name="given-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={language === 'am' ? 'ለምሳሌ አበበ' : 'e.g. Abebe'}
                    className="w-full px-3 py-2 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="family-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={language === 'am' ? 'ለምሳሌ ብክል' : 'e.g. Bikila'}
                    className="w-full px-3 py-2 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                  Username
                </label>
<input
                    type="text"
                    name="username"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={language === 'am' ? 'ልዩ የተጠቃሚ ስም ይምረጡ' : 'Choose a unique username'}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="abebe@gmail.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
                <p className="text-[10.5px] text-[#9e8d8e] mt-1 leading-relaxed">
                  {t('Use an email you can open — your receipt and payment confirmation are sent there.')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                  {t('Phone Number')}
                </label>
                <div className="flex items-center rounded-lg bg-[#1c1b1b] border border-[#514345] focus-within:border-tertiary overflow-hidden">
                  <span className="px-3 py-2 bg-[#20201f] border-r border-[#514345] text-[#f7b5be] font-bold text-xs shrink-0 select-none flex items-center gap-1">
                    🇪🇹 +251
                  </span>
                  <input
                    type="tel"
                    value={rawPhone.replace(/^\+251/, '')}
                    onChange={(e) => setRawPhone(e.target.value)}
                    placeholder="911223344 or 711223344"
                    className="w-full px-3 py-2 bg-transparent text-[#e5e2e1] text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                  {t('Password')}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('Enter your password')}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
              </div>
            </>
          )}

          {mode === 'FORGOT_PASSWORD' && (
            <div>
              <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1">
                Registered Email Address
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={t('Enter your account email')}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-sm focus:outline-none focus:border-[#f7b5be]"
              />
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-3 py-2.5 rounded-[28px] bg-[#f7b5be] text-[#1b1212] font-bold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_rgba(247,181,190,0.25)] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-[#1b1212] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'LOGIN' ? t('Sign In') : mode === 'REGISTER' ? t('Create Account') : t('Send Reset Link')}
                </span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Mode Footer Switch */}
        <div className="mt-5 pt-3.5 border-t border-[#514345] text-center text-xs text-[#9e8d8e]">
          {mode === 'LOGIN' ? (
            <p>
              {t("Don't have an account? Sign Up")}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('REGISTER'); }}
                className="text-[#f7b5be] font-semibold hover:underline ml-1"
              >
                {t('Sign Up')}
              </button>
            </p>
          ) : (
            <p>
              {t('Already have an account? Sign In')}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('LOGIN'); }}
                className="text-[#f7b5be] font-semibold hover:underline ml-1"
              >
                {t('Sign In')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

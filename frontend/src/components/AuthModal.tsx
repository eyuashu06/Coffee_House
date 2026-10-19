'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import EthiopianPhoneInput from './EthiopianPhoneInput';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'LOGIN' | 'REGISTER';
  promptMessage?: string | null;
  onSuccessCallback?: () => void;
  /** Where to send the user after a successful sign-in (e.g. /account). */
  postLoginRedirect?: string | null;
}

/**
 * Seeded demo logins, shown so a reviewer can try each role.
 *
 * Development only. These were rendered on the sign-in page unconditionally, which
 * published the administrator and manager passwords to anyone who loaded the site.
 * Set NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=true to see them locally; it stays off in a build.
 */
const SHOW_DEMO_ACCOUNTS = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true';

const DEMO_ACCOUNTS = [
  { label: 'Administrator', role: 'Admin', email: 'admin@gmail.com', password: 'password' },
  { label: 'Manager / Staff', role: 'Manager', email: 'manager@gmail.com', password: 'password' },
  { label: 'Customer', role: 'Customer', email: 'customer@gmail.com', password: 'password' },
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

  // 6-digit OTP Password Recovery States
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

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
          if (postLoginRedirect) {
            router.push(postLoginRedirect);
          } else if (onSuccessCallback) {
            onSuccessCallback();
          }
        }, 500);
      } else if (mode === 'FORGOT_PASSWORD') {
        if (forgotStep === 'EMAIL') {
          const emailError = validateSignupEmail(resetEmail);
          if (emailError) {
            setError(emailError);
            return;
          }
          const res = await fetch('/api/v1/auth/password-reset/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('Server error sending reset code.');
          }
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.email?.[0] || data.detail || 'Password reset request failed.');
          }
          setForgotStep('OTP');
          setSuccess(
            language === 'am'
              ? 'ባለ 6-አሃዝ የማረጋገጫ ኮድ ወደ Gmail ኢሜይልዎ ተልኳል። እባክዎ ከዚህ በታች ያስገቡት።'
              : 'A 6-digit verification code was sent to your Gmail inbox. Enter it below.'
          );
        } else {
          // Verify OTP and reset password
          if (!otpCode || otpCode.trim().length !== 6) {
            setError(language === 'am' ? 'እባክዎ ባለ 6-አሃዝ የማረጋገጫ ኮድ ያስገቡ።' : 'Please enter the 6-digit OTP code.');
            return;
          }
          if (newPassword !== confirmNewPassword) {
            setError(language === 'am' ? 'የይለፍ ቃሎቹ አይዛመዱም።' : 'The passwords do not match.');
            return;
          }
          if (newPassword.length < 6) {
            setError(language === 'am' ? 'የይለፍ ቃል ቢያንስ 6 ቁምፊዎች መሆን አለበት።' : 'Password must be at least 6 characters long.');
            return;
          }

          const res = await fetch('/api/v1/auth/password-reset/confirm/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: resetEmail,
              otp_code: otpCode.trim(),
              new_password: newPassword,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('Server error confirming password reset.');
          }
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.otp_code?.[0] || data.new_password?.[0] || data.detail || 'Failed to reset password.');
          }
          setSuccess(
            language === 'am'
              ? 'የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል! አሁን መግባት ይችላሉ።'
              : 'Password reset successfully! You can now sign in.'
          );
          setTimeout(() => {
            setMode('LOGIN');
            setForgotStep('EMAIL');
            setOtpCode('');
            setNewPassword('');
            setConfirmNewPassword('');
            setError(null);
            setSuccess(null);
          }, 1500);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-fade-in overflow-y-auto">
      {/* Dynamic responsive card size for all devices */}
      <div className="relative w-[95%] sm:w-full max-w-md my-auto bg-surface border border-[var(--border)] rounded-2xl shadow-2xl p-5 sm:p-7 text-[var(--text)] max-h-[90vh] overflow-y-auto">
        {/* Ambient background glow */}
        <div className="absolute -top-20 -right-20 w-36 h-36 bg-[var(--accent-soft)]/50 rounded-full pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[var(--accent)] text-2xl">
              {mode === 'LOGIN' ? 'login' : mode === 'REGISTER' ? 'person_add' : 'lock_reset'}
            </span>
            <h3 className="font-display text-lg sm:text-xl font-bold text-[var(--accent)]">
              {mode === 'LOGIN' ? t('Welcome Back') : mode === 'REGISTER' ? t('Join Artisanal Reserve') : t('Reset Password')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--accent)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--accent-soft)] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Prompt Message Banner (e.g. for Order Checkout requirement) */}
        {promptMessage && (
          <div className="mt-3.5 p-3 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] text-xs flex items-center gap-2 font-medium">
            <span className="material-symbols-outlined text-base shrink-0">info</span>
            <span>{promptMessage}</span>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mt-3.5 p-3 rounded-lg dark:bg-red-950/70 dark:border-red-500/40 dark:text-red-200 bg-red-50 border border-red-300 text-red-800 text-xs flex items-start gap-2">
            <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">error</span>
            <span className="break-words leading-relaxed">{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-3.5 p-3 rounded-lg dark:bg-emerald-950/70 dark:border-emerald-500/40 dark:text-emerald-200 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-start gap-2">
            <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">check_circle</span>
            <span>{success}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {mode === 'LOGIN' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
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
                  className="w-full px-3.5 py-2.5 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Password')}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('Enter your password')}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be] transition-colors"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setError(null); setSuccess(null); setMode('FORGOT_PASSWORD'); }}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {t('Forgot password?')}
                </button>
              </div>

              {/* Demo accounts - tap to fill, then Sign in. Development builds only. */}
              {SHOW_DEMO_ACCOUNTS && (
              <div className="rounded-xl border border-[var(--border)] bg-surface/70 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">
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
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-[var(--border)]/70 hover:border-[#f7b5be] transition-colors text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-[var(--text)] truncate">{t(acct.label)}</span>
                        <span className="block text-[11px] text-[var(--muted)] truncate">{acct.email} · {acct.password}</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] shrink-0">{t(acct.role)}</span>
                    </button>
                  ))}
                </div>
              </div>
              )}
            </>
          )}

          {mode === 'REGISTER' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t('First Name')}
                  </label>
                  <input
                    type="text"
                    name="given-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={language === 'am' ? 'ለምሳሌ አበበ' : 'e.g. Abebe'}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                    {t('Last Name')}
                  </label>
                  <input
                    type="text"
                    name="family-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={language === 'am' ? 'ለምሳሌ ብክል' : 'e.g. Bikila'}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Username')}
                </label>
<input
                    type="text"
                    name="username"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={language === 'am' ? 'ልዩ የተጠቃሚ ስም ይምረጡ' : 'Choose a unique username'}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Email Address')}
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="abebe@gmail.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
                <p className="text-[10.5px] text-[var(--muted)] mt-1 leading-relaxed">
                  {t('Use an email you can open — your receipt and payment confirmation are sent there.')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Phone Number')}
                </label>
                <EthiopianPhoneInput
                  value={rawPhone}
                  onChange={(val) => setRawPhone(val)}
                  inputClassName="py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
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
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </>
          )}

          {mode === 'FORGOT_PASSWORD' && forgotStep === 'EMAIL' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                {t('Registered Email Address')}
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={t('Enter your account email')}
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />
              <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
                {language === 'am'
                  ? 'የይለፍ ቃል መልሶ ማግኛ ባለ 6-አሃዝ የማረጋገጫ ኮድ በቀጥታ ወደ Gmail ኢሜይልዎ ይላካል።'
                  : "We'll send a 6-digit OTP verification code directly to your Gmail inbox."}
              </p>
            </div>
          )}

          {mode === 'FORGOT_PASSWORD' && forgotStep === 'OTP' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface-2 border border-[var(--border)] flex items-center justify-between text-xs">
                <div className="truncate mr-2">
                  <span className="text-[var(--muted)] block text-[10.5px] uppercase font-bold tracking-wider">
                    {language === 'am' ? 'ኮድ የተላከበት ኢሜይል' : 'Code sent to'}
                  </span>
                  <span className="font-medium text-[var(--text)]">{resetEmail}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setForgotStep('EMAIL'); setError(null); setSuccess(null); }}
                  className="text-[var(--accent)] hover:underline shrink-0 font-semibold"
                >
                  {language === 'am' ? 'ቀይር' : 'Change'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1 text-center">
                  {language === 'am' ? 'ባለ 6-አሃዝ የማረጋገጫ ኮድ (OTP)' : '6-Digit Verification Code (OTP)'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full h-12 text-center text-xl font-mono tracking-[0.4em] rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--accent)] focus:outline-none focus:border-[var(--accent)] font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {language === 'am' ? 'አዲስ የይለፍ ቃል' : 'New Password'}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={language === 'am' ? 'አዲስ የይለፍ ቃል ያስገቡ (ቢያንስ 6 ፊደላት)' : 'At least 6 characters'}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {language === 'am' ? 'የይለፍ ቃል ያረጋግጡ' : 'Confirm New Password'}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder={language === 'am' ? 'የይለፍ ቃሉን በድጋሚ ያስገቡ' : 'Re-enter your password'}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-3 py-2.5 rounded-[28px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-[var(--accent-contrast)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'LOGIN'
                    ? t('Sign In')
                    : mode === 'REGISTER'
                    ? t('Create Account')
                    : forgotStep === 'EMAIL'
                    ? (language === 'am' ? 'የማረጋገጫ ኮድ ላክ' : 'Send 6-Digit OTP Code')
                    : (language === 'am' ? 'ኮዱን አረጋግጥ እና ይለፍ ቃል ቀይር' : 'Verify OTP & Reset Password')}
                </span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </>
            )}
          </button>

          {mode === 'FORGOT_PASSWORD' && forgotStep === 'OTP' && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                setIsSubmitting(true);
                setError(null);
                try {
                  const res = await fetch('/api/v1/auth/password-reset/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: resetEmail }),
                  });
                  if (res.ok) {
                    setSuccess(
                      language === 'am'
                        ? 'አዲስ የማረጋገጫ ኮድ ወደ Gmail ኢሜይልዎ ተልኳል!'
                        : 'A new OTP code has been sent to your Gmail inbox!'
                    );
                  }
                } catch {
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full text-center text-xs text-[var(--accent)] hover:underline mt-2 font-medium"
            >
              {language === 'am' ? 'ኮዱ አልደረሰዎትም? በድጋሚ ላክ' : "Didn't receive the code? Resend OTP"}
            </button>
          )}
        </form>

        {/* Mode Footer Switch */}
        <div className="mt-5 pt-3.5 border-t border-[var(--border)] text-center text-xs text-[var(--muted)]">
          {mode === 'LOGIN' ? (
            <p>
              {t("Don't have an account? Sign Up")}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('REGISTER'); }}
                className="text-[var(--accent)] font-semibold hover:underline ml-1"
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
                className="text-[var(--accent)] font-semibold hover:underline ml-1"
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

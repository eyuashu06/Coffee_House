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
  const { login, phoneLogin, sendPhoneOTP, verifyPhoneOTP, register } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<'CUSTOMER_PHONE' | 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'>(
    initialMode === 'REGISTER' ? 'REGISTER' : 'CUSTOMER_PHONE'
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Phone OTP Verification States (eSMS Africa)
  const [phoneOtpStep, setPhoneOtpStep] = useState<'ENTER_PHONE' | 'VERIFY_OTP'>('ENTER_PHONE');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [phoneOtpHint, setPhoneOtpHint] = useState<string | null>(null);

  // Form states
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [rawPhone, setRawPhone] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  // 6-digit OTP Password Recovery States
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  React.useEffect(() => {
    if (isOpen) {
      if (initialMode === 'REGISTER') {
        setMode('REGISTER');
      } else {
        setMode('CUSTOMER_PHONE');
      }
      setPhoneOtpStep('ENTER_PHONE');
      setPhoneOtpCode('');
      setPhoneOtpHint(null);
      setResendCountdown(0);
      setConfirmPassword('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, initialMode]);

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

  const handleResendPhoneOTP = async () => {
    if (resendCountdown > 0 || isSubmitting) return;
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const formattedPhone = formatPhone(customerPhone);
      const res = await sendPhoneOTP(formattedPhone, customerName.trim() || undefined);
      setResendCountdown(60);
      if (res.debug_otp) {
        setPhoneOtpHint((language === 'am' ? 'የማረጋገጫ ኮድ፦ ' : 'Verification code: ') + res.debug_otp);
      }
      setSuccess(
        language === 'am'
          ? 'አዲስ የማረጋገጫ ኮድ በ SMS ተልኳል!'
          : 'A new verification code has been sent via SMS!'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject placeholder / undeliverable domains client-side (we email receipts there,
  // and the payment gateway refuses domains without mail infrastructure).
  const validateSignupEmail = (value: string): string | null => {
    const emailValue = value.trim();
    if (!emailValue) return null; // Email is now optional
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

    if (mode === 'CUSTOMER_PHONE') {
      const cleanDigits = customerPhone.replace(/[\s\-\(\)\+]/g, '');
      if (!cleanDigits || cleanDigits.length < 9) {
        setError(language === 'am' ? 'እባክዎ ትክክለኛ ስልክ ቁጥር (ቢያንስ 9 አሃዝ) ያስገቡ።' : 'Please enter a valid phone number (at least 9 digits).');
        return;
      }
      if (phoneOtpStep === 'VERIFY_OTP' && (!phoneOtpCode || phoneOtpCode.trim().length !== 6)) {
        setError(language === 'am' ? 'እባክዎ ባለ 6-አሃዝ የማረጋገጫ ኮድ ያስገቡ።' : 'Please enter the 6-digit verification code.');
        return;
      }
    }

    if (mode === 'REGISTER') {
      if (!fullName.trim()) {
        setError(language === 'am' ? 'ሙሉ ስም ማስገባት ግዴታ ነው።' : t('Full Name is strictly required.'));
        return;
      }
      const cleanPhoneDigits = rawPhone.replace(/[\s\-\(\)\+]/g, '');
      if (!cleanPhoneDigits || cleanPhoneDigits.length < 9) {
        setError(language === 'am' ? 'እባክዎ ትክክለኛ የኢትዮጵያ ስልክ ቁጥር (ቢያንስ 9 አሃዝ) ያስገቡ።' : 'Please enter a valid Ethiopian phone number (at least 9 digits).');
        return;
      }
      if (email.trim()) {
        const emailError = validateSignupEmail(email);
        if (emailError) {
          setError(emailError);
          return;
        }
      }
      if (username.trim() && username.trim().length < 3) {
        setError(t('Username must be at least 3 characters long.'));
        return;
      }
      if (!password || password.length < 6) {
        setError(t('Password must be at least 6 characters long.'));
        return;
      }
      if (password !== confirmPassword) {
        setError(language === 'am' ? 'የይለፍ ቃሎቹ አይዛመዱም።' : 'The passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === 'CUSTOMER_PHONE') {
        const formattedPhone = formatPhone(customerPhone);
        if (phoneOtpStep === 'ENTER_PHONE') {
          const res = await sendPhoneOTP(formattedPhone, customerName.trim() || undefined);
          setPhoneOtpStep('VERIFY_OTP');
          setResendCountdown(60);
          if (res.debug_otp) {
            setPhoneOtpHint(
              (language === 'am' ? 'የማረጋገጫ ኮድ፦ ' : 'Verification code: ') + res.debug_otp
            );
          }
          if (res.sms_note) {
            const note = res.sms_note;
            setPhoneOtpHint((prev) => (prev ? `${prev} · ${note}` : note));
          }
          setSuccess(
            language === 'am'
              ? 'ባለ 6-አሃዝ የማረጋገጫ ኮድ በ SMS ተልኳል። እባክዎ ከዚህ በታች ያስገቡት።'
              : 'A 6-digit verification code has been sent via SMS. Please enter it below.'
          );
        } else {
          await verifyPhoneOTP(formattedPhone, phoneOtpCode.trim(), customerName.trim() || undefined);
          setSuccess(language === 'am' ? 'እንኳን ደህና መጡ! በተሳካ ሁኔታ ገብተዋል።' : 'Welcome! Signed in successfully.');
          setTimeout(() => {
            onClose();
            if (postLoginRedirect) {
              router.push(postLoginRedirect);
            } else if (onSuccessCallback) {
              onSuccessCallback();
            }
          }, 400);
        }
      } else if (mode === 'LOGIN') {
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
        const nameParts = fullName.trim().split(/\s+/);
        const firstName = nameParts[0] || fullName.trim();
        const lastName = nameParts.slice(1).join(' ');
        await register({
          username,
          email: email.trim() || undefined,
          phone: formattedPhone || undefined,
          password,
          confirm_password: confirmPassword,
          full_name: fullName.trim(),
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
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[var(--accent)] text-2xl">
              {mode === 'CUSTOMER_PHONE'
                ? 'phone_iphone'
                : mode === 'LOGIN'
                ? 'lock_open'
                : mode === 'REGISTER'
                ? 'person_add'
                : 'lock_reset'}
            </span>
            <h3 className="font-display text-lg sm:text-xl font-bold text-[var(--accent)]">
              {mode === 'CUSTOMER_PHONE'
                ? (language === 'am' ? 'የስልክ መግቢያ' : 'Sign In with Phone')
                : mode === 'LOGIN'
                ? (language === 'am' ? 'የይለፍ ቃል መግቢያ' : 'Unified Account Sign In')
                : mode === 'REGISTER'
                ? t('Join Artisanal Reserve')
                : t('Reset Password')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--accent)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--accent-soft)] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Unified Tab Switcher: Phone vs Password */}
        {(mode === 'CUSTOMER_PHONE' || mode === 'LOGIN') && (
          <div className="grid grid-cols-2 p-1 bg-surface-2 rounded-xl border border-[var(--border)] mt-3.5">
            <button
              type="button"
              onClick={() => { setError(null); setSuccess(null); setMode('CUSTOMER_PHONE'); }}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'CUSTOMER_PHONE'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">phone_iphone</span>
              <span>{language === 'am' ? 'በስልክ ቁጥር' : 'Phone Number'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setError(null); setSuccess(null); setMode('LOGIN'); }}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'LOGIN'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">lock</span>
              <span>{language === 'am' ? 'በይለፍ ቃል' : 'Password (All Users)'}</span>
            </button>
          </div>
        )}

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
          {mode === 'CUSTOMER_PHONE' && phoneOtpStep === 'ENTER_PHONE' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Phone Number')}
                </label>
                <EthiopianPhoneInput
                  value={customerPhone}
                  onChange={(val) => setCustomerPhone(val)}
                  inputClassName="py-2.5"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-relaxed">
                  {language === 'am'
                    ? 'ትክክለኛውን ተጠቃሚ ለማረጋገጥ ባለ 6-አሃዝ የማረጋገጫ ኮድ (OTP) በ SMS ይላካል።'
                    : 'To verify your phone number and ensure authenticity, a 6-digit OTP code will be sent to your phone via SMS.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {language === 'am' ? 'ሙሉ ስም (አማራጭ)' : 'Full Name (Optional)'}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={language === 'am' ? 'ለምሳሌ አበበ ካሳ' : 'e.g. Abebe Kassa'}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </>
          )}

          {mode === 'CUSTOMER_PHONE' && phoneOtpStep === 'VERIFY_OTP' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-surface-2 border border-[var(--border)] flex items-center justify-between text-xs">
                <div className="truncate mr-2">
                  <span className="text-[var(--muted)] block text-[10.5px] uppercase font-bold tracking-wider">
                    {language === 'am' ? 'ኮድ የተላከበት ስልክ ቁጥር' : 'Verification code sent to'}
                  </span>
                  <span className="font-bold text-[var(--accent)] font-mono text-sm">{customerPhone}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setPhoneOtpStep('ENTER_PHONE'); setError(null); setSuccess(null); }}
                  className="text-[var(--accent)] hover:underline shrink-0 font-semibold cursor-pointer text-xs"
                >
                  {language === 'am' ? 'ስልክ ቀይር' : 'Change Phone'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 text-center">
                  {language === 'am' ? 'ባለ 6-አሃዝ የኤስኤምኤስ ማረጋገጫ ኮድ (OTP)' : '6-Digit SMS Verification Code (OTP)'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  value={phoneOtpCode}
                  onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full h-12 text-center text-2xl font-mono tracking-[0.4em] rounded-xl bg-surface-2 border border-[var(--border)] text-[var(--accent)] focus:outline-none focus:border-[var(--accent)] font-bold"
                />
              </div>

              {phoneOtpHint && (
                <div className="p-2.5 rounded-xl bg-[var(--accent-soft)]/50 border border-[var(--accent)]/30 text-[11.5px] text-[var(--text)] flex items-start gap-2">
                  <span className="material-symbols-outlined text-base text-[var(--accent)] shrink-0 mt-0.5">info</span>
                  <span className="leading-relaxed">{phoneOtpHint}</span>
                </div>
              )}
            </div>
          )}

          {mode === 'LOGIN' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Phone, Username, or Email')}
                </label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder={language === 'am' ? '0911223344 ወይም abebe@gmail.com' : '0911223344 or abebe@gmail.com'}
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
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {language === 'am' ? 'ሙሉ ስም' : 'Full Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={language === 'am' ? 'ለምሳሌ አበበ ቢቂላ' : 'e.g. Abebe Bikila'}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Phone Number')} <span className="text-red-500">*</span>
                </label>
                <EthiopianPhoneInput
                  value={rawPhone}
                  onChange={(val) => setRawPhone(val)}
                  required
                  inputClassName="py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Email Address')} <span className="text-[10.5px] font-normal lowercase text-[var(--muted)]">({language === 'am' ? 'አማራጭ' : 'optional'})</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="abebe@gmail.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-2 border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[#f7b5be]"
                />
                <p className="text-[10.5px] text-[var(--muted)] mt-1 leading-relaxed">
                  {t('Optional: If provided, your receipt and payment confirmation will be sent here.')}
                </p>
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

              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
                  {t('Confirm Password')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={language === 'am' ? 'የይለፍ ቃሉን በድጋሚ ያስገቡ' : 'Re-enter your password'}
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
            className="w-full mt-3 py-2.5 rounded-[28px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-[var(--accent-contrast)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'CUSTOMER_PHONE'
                    ? phoneOtpStep === 'ENTER_PHONE'
                      ? (language === 'am' ? 'የማረጋገጫ ኮድ ላክ' : 'Send Verification Code')
                      : (language === 'am' ? 'አረጋግጥና ግባ' : 'Verify & Sign In')
                    : mode === 'LOGIN'
                    ? (language === 'am' ? 'ይግቡ' : 'Sign In')
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

          {mode === 'CUSTOMER_PHONE' && phoneOtpStep === 'VERIFY_OTP' && (
            <button
              type="button"
              disabled={isSubmitting || resendCountdown > 0}
              onClick={handleResendPhoneOTP}
              className="w-full text-center text-xs text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors pt-1 cursor-pointer font-medium"
            >
              {resendCountdown > 0
                ? (language === 'am' ? `ኮዱን በድጋሚ ለመላክ ${resendCountdown} ሰከንድ ይጠብቁ` : `Resend code in ${resendCountdown}s`)
                : (language === 'am' ? 'ኮዱ አልደረሰዎትም? በድጋሚ ላክ' : "Didn't receive SMS code? Resend")}
            </button>
          )}

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
          {mode === 'REGISTER' ? (
            <p>
              {language === 'am' ? 'የይለፍ ቃል የሌለው መግቢያ ይፈልጋሉ?' : 'Prefer passwordless sign in?'}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('CUSTOMER_PHONE'); }}
                className="text-[var(--accent)] font-semibold hover:underline ml-1"
              >
                {language === 'am' ? 'በስልክ ይግቡ' : 'Sign in with phone'}
              </button>
            </p>
          ) : mode === 'FORGOT_PASSWORD' ? (
            <p>
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('LOGIN'); setForgotStep('EMAIL'); }}
                className="text-[var(--accent)] font-semibold hover:underline"
              >
                {language === 'am' ? '← ወደ መግቢያ ተመለስ' : '← Back to Sign In'}
              </button>
            </p>
          ) : (
            <p>
              {language === 'am' ? 'በባህላዊ ኢሜይል እና ይለፍ ቃል መመዝገብ ይፈልጋሉ?' : 'Want an account with email & password?'}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setSuccess(null); setMode('REGISTER'); }}
                className="text-[var(--accent)] font-semibold hover:underline ml-1"
              >
                {t('Sign Up')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Shell />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-5 bg-surface-2 p-8 rounded-2xl border border-[var(--border)] shadow-xl">
        <h1 className="font-display text-3xl text-[var(--text)]">Reset your password</h1>
        {children}
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // The backend builds this URL as
  //   {FRONTEND_URL}/reset-password?uid=<uidb64>&token=<token>
  const params = new URLSearchParams(
    typeof window === 'undefined' ? '' : window.location.search
  );
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';
  const hasLinkTokens = Boolean(uid && token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }

    if (!hasLinkTokens && (!otpCode.trim() || !email.trim())) {
      setError('Please provide your email and 6-digit OTP code.');
      return;
    }

    setStatus('submitting');
    try {
      const payload: Record<string, string> = { new_password: password };
      if (hasLinkTokens) {
        payload.uidb64 = uid;
        payload.token = token;
      } else {
        payload.email = email.trim();
        payload.otp_code = otpCode.trim();
      }

      const res = await fetch('/api/v1/auth/password-reset/confirm/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('done');
      } else {
        setError(
          data.otp_code?.[0] ||
          data.new_password?.[0] ||
          data.email?.[0] ||
          Object.values(data).flat().join(' ') ||
          'Invalid or expired recovery details. Please request a new code.'
        );
        setStatus('idle');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStatus('idle');
    }
  };

  if (status === 'done') {
    return (
      <Shell>
        <p className="text-[var(--accent)] font-semibold">
          Your password has been changed successfully. You can sign in with it now.
        </p>
        <Link
          href="/"
          className="inline-block py-3 px-7 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-colors"
        >
          Back to the Coffee House
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {!hasLinkTokens && (
        <div className="p-3 rounded-xl bg-surface border border-[var(--border)] text-xs text-[var(--muted)] leading-relaxed">
          Enter your registered email and the 6-digit OTP code received in your Gmail inbox to reset your password.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!hasLinkTokens && (
          <>
            <div>
              <label htmlFor="reset-email" className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Registered Email
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="e.g. name@gmail.com"
                className="w-full h-12 px-4 rounded-xl bg-surface border border-[var(--border)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="otp-code" className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                6-Digit OTP Code
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                placeholder="••••••"
                className="w-full h-12 px-4 rounded-xl bg-surface border border-[var(--border)] text-[var(--accent)] font-mono text-center tracking-[0.4em] text-lg font-bold focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full h-12 px-4 rounded-xl bg-surface border border-[var(--border)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full h-12 px-4 rounded-xl bg-surface border border-[var(--border)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        {error && <p className="text-red-600 dark:text-red-300 text-sm leading-relaxed">{error}</p>}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full h-12 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? 'Saving...' : 'Set new password'}
        </button>

        <div className="text-center pt-2">
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
            ← Back to Home
          </Link>
        </div>
      </form>
    </Shell>
  );
}
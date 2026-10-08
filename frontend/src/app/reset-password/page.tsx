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
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-5">
        <h1 className="font-display text-3xl">Reset your password</h1>
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

  // The backend builds this URL as
  //   {FRONTEND_URL}/reset-password?uid=<uidb64>&token=<token>
  const params = new URLSearchParams(
    typeof window === 'undefined' ? '' : window.location.search
  );
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';
  const linkLooksValid = Boolean(uid && token);

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

    setStatus('submitting');
    try {
      const res = await fetch('/api/v1/auth/password-reset/confirm/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uidb64: uid, token, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('done');
      } else {
        setError(
          Object.values(data).flat().join(' ') ||
            'That reset link is no longer valid. Please request a new one.'
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
        <p className="text-[#f7b5be] font-semibold">
          Your password has been changed. You can sign in with it now.
        </p>
        <Link
          href="/"
          className="inline-block py-3 px-7 rounded-full bg-[#f7b5be] text-[#4e232b] font-bold text-sm uppercase tracking-wider"
        >
          Back to the Coffee House
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {!linkLooksValid && (
        <p className="text-red-300 text-sm leading-relaxed">
          This link is missing its reset code. Open the link from your reset email, or{' '}
          <Link href="/" className="text-[#f7b5be] underline">
            request a new one
          </Link>
          .
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1.5">
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
            className="w-full h-12 px-4 rounded-xl bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] focus:border-[#f7b5be] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1.5">
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
            className="w-full h-12 px-4 rounded-xl bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] focus:border-[#f7b5be] focus:outline-none"
          />
        </div>

        {error && <p className="text-red-300 text-sm leading-relaxed">{error}</p>}

        <button
          type="submit"
          disabled={status === 'submitting' || !linkLooksValid}
          className="w-full h-12 rounded-full bg-[#f7b5be] text-[#4e232b] font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? 'Saving...' : 'Set new password'}
        </button>
      </form>
    </Shell>
  );
}
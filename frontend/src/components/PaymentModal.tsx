'use client';

import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  totalAmountEtb: string;
  onPaymentComplete: (status: string, txRef: string, message: string) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  totalAmountEtb,
  onPaymentComplete,
}: PaymentModalProps) {
  const { t, language } = useLanguage();
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'telebirr' | 'cbebirr' | 'mpesa' | 'awashbirr' | 'ebirr' | 'cash'>('card');
  const [phone, setPhone] = useState('251900000000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const birr = language === 'am' ? 'ብር' : 'ETB';

  if (!isOpen) return null;

  const handleTestPreset = (testPhone: string) => {
    setPhone(testPhone);
    setError(null);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // apiFetch, not raw fetch: an expired access cookie is refreshed and the
      // request replayed. Without it a long-idle customer gets
      // "Authentication credentials were not provided" instead of a payment page.
      const res = await apiFetch('/api/v1/payments/initialize/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: paymentMethod,
          phone_number: phone,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.detail || t('Payment initialization failed.'));
      }

      const payment = data.payment;
      const checkoutUrl = data.checkout_url;
      const mode = data.mode;

      if (payment.status === 'SUCCESS') {
        onPaymentComplete(
          'SUCCESS',
          payment.tx_ref,
          `${t('Payment of')} ${birr} ${totalAmountEtb} ${t('via')} ${t(paymentMethod.toUpperCase())} — ${t('successful!')}`
        );
      } else if (payment.status === 'FAILED') {
        setError(`${t('Payment Failed:')} ${payment.failure_reason || t('INSUFFICIENT_FUNDS or processing error.')}`);
      } else if (payment.status === 'ABANDONED') {
        setError(`${t('Payment Cancelled:')} ${payment.failure_reason || t('USER_CANCELLED.')}`);
      } else {
        // PENDING status or fallback mode
        if (checkoutUrl && checkoutUrl.startsWith('http')) {
          // For fallback mode, give user a moment to read the message then redirect
          if (mode === 'fallback') {
            setError('⚠️ ' + (data.message || t('Payment gateway is temporarily unavailable. Redirecting to your orders...')));
            setTimeout(() => { window.location.href = checkoutUrl; }, 2500);
          } else {
            // Real Chapa checkout — redirect immediately
            window.location.href = checkoutUrl;
          }
        } else {
          onPaymentComplete('PENDING', payment.tx_ref, t('Payment initialized. Please complete payment via Chapa gateway.'));
        }
      }
    } catch (err: any) {
      setError(err.message || t('Payment processing error.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-[95%] sm:w-full max-w-lg my-auto bg-surface-container border border-[#514345] rounded-2xl shadow-2xl p-5 sm:p-7 text-[#e5e2e1] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#514345]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#f7b5be] text-2xl">account_balance_wallet</span>
            <div>
              <h3 className="font-display text-lg sm:text-xl font-bold text-[#f7b5be]">{t('Chapa Payment Gateway')}</h3>
              <p className="text-[11px] text-[#9e8d8e]">Order #{orderNumber} • ETB {totalAmountEtb}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#9e8d8e] hover:text-[#f7b5be] hover:bg-outline-variant/10 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Chapa Banner */}
        <div className="mt-3.5 p-3 rounded-xl bg-[#2b1b1e] border border-[#683941] text-[#f7b5be] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">verified_user</span>
            <span className="font-semibold">{t('Chapa ETB Payment Active')}</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#f7b5be] text-[#4e232b] text-[10px] font-bold uppercase">{t('Official')}</span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className={`mt-3.5 p-3 rounded-lg text-xs flex items-start gap-2 border ${
            error.startsWith('⚠️')
              ? 'bg-amber-950/70 border-amber-500/40 text-amber-200'
              : 'bg-red-950/70 border-red-500/40 text-red-200'
          }`}>
            <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">
              {error.startsWith('⚠️') ? 'warning' : 'error'}
            </span>
            <span className="break-words leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handlePay} className="mt-4 space-y-4">
          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-2">
              {t('Select Payment Method')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'card', name: 'Chapa Hosted Redirect', icon: 'open_in_new' },
                { id: 'telebirr', name: 'Telebirr', icon: 'smartphone' },
                { id: 'cbebirr', name: 'CBE Birr', icon: 'account_balance' },
                { id: 'mpesa', name: 'M-Pesa', icon: 'send_to_mobile' },
                { id: 'awashbirr', name: 'Awash Birr', icon: 'payments' },
                { id: 'ebirr', name: 'E-Birr', icon: 'credit_score' },
                { id: 'cash', name: 'Cash on Delivery', icon: 'local_atm' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    paymentMethod === m.id
                      ? 'bg-[#2b1b1e] border-tertiary text-[#f7b5be] shadow-sm'
                      : 'bg-surface-container border-[#514345] text-[#9e8d8e] hover:bg-outline-variant/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{m.icon}</span>
                  <span className="text-xs font-bold truncate">{t(m.name)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Test Phone Presets for Mobile Money */}
          {paymentMethod !== 'cash' && paymentMethod !== 'card' && (
            <div>
              <label className="block text-xs font-semibold text-[#9e8d8e] uppercase tracking-wider mb-1.5">
                {t('Chapa Mobile Test Phone Scenarios')}
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => handleTestPreset('251900000000')}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${
                    phone === '251900000000'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                      : 'bg-transparent border-[#514345] text-[#9e8d8e] hover:bg-outline-variant/10'
                  }`}
                >
                  <p className="font-bold">🟢 251900000000</p>
                  <p className="text-[10px] text-emerald-400/80">{t('Success Scenario')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleTestPreset('251911111111')}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${
                    phone === '251911111111'
                      ? 'bg-red-950/60 border-red-500 text-red-300'
                      : 'bg-transparent border-[#514345] text-[#9e8d8e] hover:bg-outline-variant/10'
                  }`}
                >
                  <p className="font-bold">🔴 251911111111</p>
                  <p className="text-[10px] text-red-400/80">{t('Insufficient Funds')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleTestPreset('251922222222')}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${
                    phone === '251922222222'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                      : 'bg-transparent border-[#514345] text-[#9e8d8e] hover:bg-outline-variant/10'
                  }`}
                >
                  <p className="font-bold">🟡 251922222222</p>
                  <p className="text-[10px] text-amber-400/80">{t('User Cancellation')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleTestPreset('251933333333')}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${
                    phone === '251933333333'
                      ? 'bg-blue-950/60 border-blue-500 text-blue-300'
                      : 'bg-transparent border-[#514345] text-[#9e8d8e] hover:bg-outline-variant/10'
                  }`}
                >
                  <p className="font-bold">⏱️ 251933333333</p>
                  <p className="text-[10px] text-blue-400/80">{t('Timeout / Pending')}</p>
                </button>
              </div>

              {/* Phone Input */}
              <div className="flex items-center rounded-lg bg-surface-container border border-[#514345] focus-within:border-tertiary overflow-hidden">
                <span className="px-3 py-2 bg-transparent border-r border-[#514345] text-[#f7b5be] font-bold text-xs shrink-0">
                  🇪🇹
                </span>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="251900000000"
                  className="w-full px-3 py-2 bg-transparent text-[#e5e2e1] text-sm focus:outline-none"
                />
              </div>
            </div>
          )}

          {paymentMethod === 'card' && (
            <div className="p-3.5 rounded-xl bg-surface-container-high/70 border border-tertiary/20 text-xs space-y-1.5">
              <p className="font-bold text-[#f7b5be] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">open_in_new</span>
                {t('Redirect to Chapa Hosted Checkout')}
              </p>
              <p className="text-[#9e8d8e] text-[11px] leading-relaxed">
                {t("Clicking the button below will open Chapa's official hosted checkout page where you can pay using Telebirr, CBE Birr, Debit/Credit Card, or Bank Transfer.")}
              </p>
            </div>
          )}

          {/* Pay Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-6 rounded-full bg-[#f7b5be] text-[#4A2B29] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-on-tertiary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {paymentMethod === 'card'
                    ? `${t('Proceed to Chapa Payment')} (${birr} ${totalAmountEtb})`
                    : `${t('Pay')} ${birr} ${totalAmountEtb} ${t('via')} ${t(paymentMethod.toUpperCase())}`}
                </span>
                <span className="material-symbols-outlined text-base">east</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

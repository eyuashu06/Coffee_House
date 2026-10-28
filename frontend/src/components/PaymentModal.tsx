'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import EthiopianPhoneInput from './EthiopianPhoneInput';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  totalAmountEtb: string;
  onPaymentComplete: (status: string, txRef: string, message: string) => void;
}

/** The identifiers Chapa and cafe accounts accept, plus cash on delivery. */
type PaymentMethodId =
  | 'telebirr'
  | 'cbebirr'
  | 'awashbirr'
  | 'ebirr'
  | 'cash'
  | 'card'
  | 'mpesa';

interface PaymentAccount {
  id: number;
  method: string;
  method_display: string;
  account_name: string;
  account_number: string;
  bank_name?: string;
  instructions?: string;
  is_active: boolean;
}

const PAYMENT_METHODS: { id: PaymentMethodId; name: string; icon: string; category: string }[] = [
  { id: 'telebirr', name: 'Telebirr', icon: 'smartphone', category: 'digital' },
  { id: 'cbebirr', name: 'CBE Birr / CBE', icon: 'account_balance', category: 'digital' },
  { id: 'awashbirr', name: 'Awash Bank / Birr', icon: 'payments', category: 'digital' },
  { id: 'ebirr', name: 'E-Birr', icon: 'credit_score', category: 'digital' },
  { id: 'cash', name: 'Cash (Delivery/Onsite/Table)', icon: 'local_atm', category: 'cash' },
  { id: 'card', name: 'Chapa Online (Card/Bank)', icon: 'open_in_new', category: 'online' },
];

export default function PaymentModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  totalAmountEtb,
  onPaymentComplete,
}: PaymentModalProps) {
  const { t, language } = useLanguage();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('telebirr');
  const [phone, setPhone] = useState('+251911223344');
  const [transactionRef, setTransactionRef] = useState('');
  const [proofMode, setProofMode] = useState<'FILE' | 'CODE'>('CODE');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTestPresets, setShowTestPresets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const birr = language === 'am' ? 'ብር' : 'ETB';

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setTransactionRef('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setReceiptBase64(null);
      // Load payment accounts managed by admin
      apiFetch('/api/v1/payments/accounts/')
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data.results || [];
          setAccounts(list);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentAccount = accounts.find((a) => a.method === paymentMethod);

  const handleTestPreset = (testPhone: string) => {
    setPhone(testPhone);
    setError(null);
  };

  const handleCopyAccount = (number: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const processReceiptFile = (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      setError(t('Only image files (PNG, JPG, WEBP) or PDF documents are accepted.'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('File size must be under 10MB.'));
      return;
    }
    setError(null);
    setReceiptFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setReceiptBase64(result);
    };
    reader.readAsDataURL(file);

    if (isImage) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview('pdf');
    }
    const sizeKb = (file.size / 1024).toFixed(0);
    const cleanName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
    if (!transactionRef || transactionRef.startsWith('Receipt:')) {
      setTransactionRef(`Receipt: ${cleanName} (${sizeKb}KB)`.slice(0, 140));
    }
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processReceiptFile(file);
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptBase64(null);
    if (transactionRef.startsWith('Receipt:')) {
      setTransactionRef('');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Flexible Validation: customer can provide EITHER a transaction code / link OR a receipt file
    const isManualDigital = ['telebirr', 'cbebirr', 'awashbirr', 'ebirr', 'mpesa'].includes(paymentMethod);
    const hasCode = transactionRef.trim().length >= 4 && !transactionRef.startsWith('Receipt:');
    const hasFile = Boolean(receiptFile);
    const isTest = phone.includes('900000000');

    if (isManualDigital && !hasCode && !hasFile && !isTest) {
      setError(
        language === 'am'
          ? 'እባክዎ የግብይቱን ኮድ/ሊንክ ያስገቡ ወይም የደረሰኝ ፋይል (ምስል/PDF) ይጫኑ።'
          : t('Please enter the transaction reference / receipt link OR upload a receipt file.')
      );
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await apiFetch('/api/v1/payments/initialize/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: paymentMethod,
          phone_number: phone,
          transaction_reference: transactionRef.trim(),
          receipt_base64: receiptBase64 || undefined,
          original_filename: receiptFile?.name || '',
          frontend_url: typeof window !== 'undefined' ? window.location.origin : undefined,
          return_url: typeof window !== 'undefined' ? `${window.location.origin}/account` : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.detail || t('Payment initialization failed.'));
      }

      const payment = data.payment;
      const checkoutUrl = data.checkout_url;
      const mode = data.mode;

      if (payment.status === 'SUCCESS' || data.verified === true) {
        onPaymentComplete(
          'SUCCESS',
          payment.tx_ref,
          data.message || `${t('Payment of')} ${birr} ${totalAmountEtb} ${t('via')} ${t(paymentMethod.toUpperCase())} — ${t('successful!')}`
        );
      } else if (payment.status === 'FAILED') {
        setError(`${t('Payment Failed:')} ${payment.failure_reason || t('Processing error.')}`);
      } else if (payment.status === 'ABANDONED') {
        setError(`${t('Payment Cancelled:')} ${payment.failure_reason || t('USER_CANCELLED.')}`);
      } else {
        // PENDING status
        if (checkoutUrl && checkoutUrl.startsWith('http')) {
          if (mode === 'fallback') {
            setError('⚠️ ' + (data.message || t('Payment gateway is temporarily unavailable. Redirecting to your orders...')));
            setTimeout(() => { window.location.href = checkoutUrl; }, 2500);
          } else {
            // Real Chapa hosted checkout
            window.location.href = checkoutUrl;
          }
        } else if (paymentMethod === 'cash') {
          onPaymentComplete(
            'CASH_PENDING',
            payment.tx_ref,
            t('Cash order placed! Staff will confirm payment upon delivery, pickup, or at your table.')
          );
        } else {
          onPaymentComplete(
            'PENDING',
            payment.tx_ref,
            data.message || t('Transfer reference submitted! Manager will verify the account and approve your order.')
          );
        }
      }
    } catch (err: any) {
      setError(err.message || t('Payment processing error.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-fade-in">
      <div className="relative w-[95%] sm:w-full max-w-lg my-auto bg-surface-2 border border-[var(--border)] rounded-2xl shadow-2xl p-5 sm:p-6 text-[var(--text)] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)]">
              <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
            </div>
            <div>
              <h3 className="font-display text-lg sm:text-xl font-bold text-[var(--accent)]">{t('Choose Payment Method')}</h3>
              <p className="text-[12px] text-[var(--muted)]">Order #{orderNumber} • <strong className="text-[var(--text)]">{birr} {totalAmountEtb}</strong></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--border)]/20 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className={`mt-3.5 p-3 rounded-lg text-xs flex items-start gap-2 border ${
            error.startsWith('⚠️')
              ? 'dark:bg-amber-950/70 dark:border-amber-500/40 dark:text-amber-200 bg-amber-50 border-amber-300 text-amber-800'
              : 'dark:bg-red-950/70 dark:border-red-500/40 dark:text-red-200 bg-red-50 border-red-300 text-red-800'
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
            <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              {t('Select Payment Method')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    paymentMethod === m.id
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/40 font-bold'
                      : 'bg-surface border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)]/20 hover:text-[var(--text)]'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{m.icon}</span>
                  <span className="text-xs truncate">{t(m.name)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Account Details for Manual Digital Payments (Telebirr, CBE, Awash, E-Birr) */}
          {['telebirr', 'cbebirr', 'awashbirr', 'ebirr', 'mpesa'].includes(paymentMethod) && (
            <div className="p-3.5 rounded-xl bg-surface border border-[var(--border)] space-y-3 animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]/60">
                <span className="text-xs font-bold text-[var(--accent)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">savings</span>
                  {currentAccount?.bank_name || t(paymentMethod.toUpperCase())}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {t('Direct Transfer')}
                </span>
              </div>

              {currentAccount ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[var(--muted)]">{t('Account / Business Name')}</p>
                      <p className="text-sm font-bold text-[var(--text)]">{currentAccount.account_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-[var(--border)]">
                    <div>
                      <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{t('Account / Mobile Number')}</p>
                      <p className="font-mono text-base font-bold text-[var(--accent)] tracking-wider">{currentAccount.account_number}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyAccount(currentAccount.account_number)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                      {copied ? t('Copied!') : t('Copy')}
                    </button>
                  </div>

                  {currentAccount.instructions && (
                    <p className="text-[11px] text-[var(--muted)] italic leading-relaxed">
                      💡 {currentAccount.instructions}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  {t('Transfer')} <strong className="text-[var(--accent)]">{birr} {totalAmountEtb}</strong> {t('via your')} {t(paymentMethod)} {t('app, then upload your transaction receipt slip below.')}
                </p>
              )}

              {/* Payment Proof: Choose between Code/Link OR File Upload */}
              <div className="pt-2 border-t border-[var(--border)]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <i className="ph ph-shield-check text-[15px] text-[var(--accent)]"></i>
                    <span>{language === 'am' ? 'የክፍያ ማረጋገጫ ዘዴ' : 'Payment Proof Method'}</span>
                    <span className="text-red-500">*</span>
                  </span>

                  <div className="flex p-0.5 rounded-lg bg-surface-2 border border-[var(--border)] text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setProofMode('CODE')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                        proofMode === 'CODE'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <i className="ph ph-link-simple text-xs"></i>
                      <span>{language === 'am' ? 'ኮድ / ሊንክ' : 'Code / Link'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProofMode('FILE')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                        proofMode === 'FILE'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <i className="ph ph-file-arrow-up text-xs"></i>
                      <span>{language === 'am' ? 'ፋይል ጫን' : 'Upload File'}</span>
                    </button>
                  </div>
                </div>

                {proofMode === 'CODE' ? (
                  <div className="space-y-2 animate-fade-in">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                        {paymentMethod === 'cbebirr'
                          ? (language === 'am' ? 'የCBE ደረሰኝ ሊንክ ወይም ኮድ' : 'CBE Receipt Link or Transaction Code')
                          : (language === 'am' ? 'የግብይት ቁጥር ወይም የደረሰኝ ሊንክ' : 'Transaction Reference or Receipt Link')}
                      </label>
                      <input
                        type="text"
                        value={transactionRef.startsWith('Receipt:') ? '' : transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder={
                          paymentMethod === 'cbebirr'
                            ? 'https://mbreciept.cbe.com.et/... ወይም v2-hfHCxNHQzq8MIgKx3LKC'
                            : language === 'am'
                            ? 'ለምሳሌ RA... ወይም https://...'
                            : 'e.g. RA1234567 or receipt URL'
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-[var(--border)] text-[var(--text)] text-xs focus:border-[var(--accent)] focus:outline-none transition-colors font-mono"
                      />
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--accent-soft)]/20 border border-[var(--accent)]/30 text-[11px] text-[var(--text)] leading-relaxed">
                      {paymentMethod === 'cbebirr' ? (
                        <span>
                          💡 {language === 'am'
                            ? 'ሙሉውን የCBE ደረሰኝ ሊንክ (https://mbreciept.cbe.com.et/...) ወይም ኮዱን ብቻ (ለምሳሌ v2-hfHCxNHQzq8MIgKx3LKC) እዚህ መለጠፍ ይችላሉ። በ links.et በቅጽበት ይረጋገጣል!'
                            : 'Tip: You can paste the full CBE receipt link (https://mbreciept.cbe.com.et/...) or just the code (e.g. v2-hfHCxNHQzq8MIgKx3LKC) for instant verification via links.et!'}
                        </span>
                      ) : (
                        <span>
                          💡 {language === 'am'
                            ? 'የተላከውን የማረጋገጫ ኮድ ወይም የደረሰኝ ሊንክ ያስገቡ። በ links.et በኩል በቅጽበት ይረጋገጣል።'
                            : 'Enter the confirmation code or digital receipt URL for instant verification via links.et.'}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 animate-fade-in">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                      className="hidden"
                      onChange={handleReceiptFileChange}
                    />

                    {!receiptFile ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file) processReceiptFile(file);
                        }}
                        className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-2xl p-4 text-center cursor-pointer transition-all bg-surface/50 hover:bg-[var(--accent-soft)]/20 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform shadow-sm">
                          <i className="ph ph-file-arrow-up text-xl"></i>
                        </div>
                        <p className="text-[13px] font-bold text-[var(--text)]">
                          {t('Upload Receipt (Image or PDF)')}
                        </p>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5">
                          {t('Screenshot of Telebirr, CBE Birr, Awash, or bank deposit slip')}
                        </p>
                        <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface border border-[var(--border)] text-[10.5px] font-semibold text-[var(--muted)]">
                          <i className="ph ph-image text-[13px] text-[var(--accent)]"></i>
                          <span>PNG, JPG, WEBP, PDF</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)]/25 flex items-center justify-between gap-3 animate-fade-in">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {receiptPreview === 'pdf' ? (
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
                              <i className="ph ph-file-pdf text-2xl"></i>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl overflow-hidden border border-[var(--border)] shrink-0 bg-surface shadow-sm">
                              <img src={receiptPreview || ''} alt="Receipt preview" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-bold text-[var(--text)] truncate">{receiptFile.name}</p>
                            <p className="text-[10.5px] text-[var(--muted)] font-mono">
                              {(receiptFile.size / 1024).toFixed(1)} KB · {receiptPreview === 'pdf' ? t('PDF Document') : t('Receipt Image')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-[var(--border)] bg-surface text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                          >
                            {t('Change')}
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveReceipt}
                            className="w-7 h-7 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
                            title={t('Remove File')}
                          >
                            <i className="ph ph-trash text-sm"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[10.5px] text-[var(--muted)] mt-1.5 leading-relaxed">
                  {t('Manager will verify your receipt document in the cafe account before the chef prepares your order.')}
                </p>
              </div>

              {/* Sender Phone Input */}
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] mb-1">
                  {t('Sender Phone Number')}
                </label>
                <EthiopianPhoneInput
                  value={phone}
                  onChange={setPhone}
                  required
                />
              </div>

              {/* Quick toggle for developer test numbers */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowTestPresets(!showTestPresets)}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">{showTestPresets ? 'expand_less' : 'expand_more'}</span>
                  {showTestPresets ? t('Hide test presets') : t('Developer test phone presets')}
                </button>
                {showTestPresets && (
                  <div className="grid grid-cols-2 gap-2 mt-2 p-2 rounded-lg bg-surface-2 border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => handleTestPreset('+251900000000')}
                      className="p-1.5 rounded text-left text-[11px] text-emerald-500 hover:bg-emerald-500/10"
                    >
                      🟢 900 000 000 (Mock Auto-Pass)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTestPreset('+251911111111')}
                      className="p-1.5 rounded text-left text-[11px] text-red-500 hover:bg-red-500/10"
                    >
                      🔴 911 111 111 (Mock Fail)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cash Payment Information */}
          {paymentMethod === 'cash' && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2 animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-700 dark:text-amber-300">
                <span className="material-symbols-outlined text-xl">payments</span>
                <span>{t('Cash on Delivery / Onsite / Table Service')}</span>
              </div>
              <p className="text-[12px] text-[var(--muted)] leading-relaxed">
                {t('No advance digital payment needed right now. Please have cash ready when your order is delivered, when picking up at the counter, or at your reserved table.')}
              </p>
              <div className="p-2 rounded bg-surface border border-[var(--border)] text-[11px] text-[var(--text)] flex items-center gap-1.5 font-medium">
                <span className="material-symbols-outlined text-sm text-[var(--accent)]">info</span>
                {t('Cafe staff will verify and approve your payment upon receipt before final completion.')}
              </div>
            </div>
          )}

          {/* Chapa Hosted Checkout Information */}
          {paymentMethod === 'card' && (
            <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] text-xs space-y-2 animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--accent)]">
                <span className="material-symbols-outlined text-xl">open_in_new</span>
                <span>{t('Chapa Official Hosted Payment')}</span>
              </div>
              <p className="text-[12px] text-[var(--muted)] leading-relaxed">
                {t("Clicking the button below redirects you to Chapa's secure checkout page where you can pay using Debit/Credit cards or bank cards with automated online confirmation.")}
              </p>
            </div>
          )}

          {/* Pay Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-[var(--accent-contrast)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {paymentMethod === 'cash'
                    ? `${t('Place Cash Order')} (${birr} ${totalAmountEtb})`
                    : paymentMethod === 'card'
                      ? `${language === 'am' ? 'ክፍያ ፈፅመው ይዘዙ (ኦንላይን)' : 'Pay to Order (Online Card/Bank)'} (${birr} ${totalAmountEtb})`
                      : `${language === 'am' ? 'ክፍያ ፈፅመው ይዘዙ (አረጋግጥ)' : 'Pay to Order (Verify Transfer)'} (${birr} ${totalAmountEtb})`}
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

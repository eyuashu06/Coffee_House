'use client';

import React, { useState } from 'react';
import { CoffeeItemData } from './MenuSection';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthModal from './AuthModal';
import PaymentModal from './PaymentModal';

export interface CartItem {
  coffee: CoffeeItemData;
  quantity: number;
  temperature: string;
  milk: string;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQty: (index: number, delta: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
}: CartDrawerProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isAuthRequiredOpen, setIsAuthRequiredOpen] = useState(false);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<{ id: number; orderNumber: string; totalAmount: string } | null>(null);

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + Number(item.coffee.price) * item.quantity,
    0
  );

  const processOrderSubmission = async () => {
    if (cartItems.length === 0) return;

    setIsSubmitting(true);
    setOrderSuccess(null);
    setOrderError(null);

    const payload = {
      order_type: 'DINE_IN',
      contact_name: user ? `${user.first_name || user.username}`.trim() || user.username : 'Customer',
      contact_phone: user?.phone || '+251911000000',
      total_amount_etb: totalAmount.toFixed(2),
      items: cartItems.map(item => ({
        menu_item: item.coffee.id,
        quantity: item.quantity,
        unit_price_etb: Number(item.coffee.price).toFixed(2),
        temperature: item.temperature,
        milk_choice: item.milk,
      })),
    };

    try {
      const res = await fetch('/api/v1/orders/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const orderData = await res.json();
        setActiveOrder({
          id: orderData.id,
          orderNumber: orderData.order_number || `ORD-${orderData.id}`,
          totalAmount: totalAmount.toFixed(2),
        });
        setIsPaymentModalOpen(true);
      } else {
        let errMsg = 'Failed to place order.';
        try {
          const errData = await res.json();
          errMsg = errData.detail || errData.error || JSON.stringify(errData);
        } catch {}
        setOrderError(`Order failed: ${errMsg}`);
      }
    } catch (err: any) {
      setOrderError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckoutClick = () => {
    if (cartItems.length === 0) return;

    // Requirement: Customer must be logged in to complete checkout
    if (!user) {
      setIsAuthRequiredOpen(true);
      return;
    }

    processOrderSubmission();
  };

  const handlePaymentComplete = (payStatus: string, txRef: string, message: string) => {
    setIsPaymentModalOpen(false);
    if (payStatus === 'SUCCESS') {
      setOrderSuccess(`✅ Order #${activeOrder?.orderNumber || ''} confirmed! ${message}`);
      onClearCart();
    } else if (payStatus === 'PENDING') {
      // Chapa redirect – cart cleared, user goes to account to verify
      setOrderSuccess(`⏳ Redirecting to Chapa for payment...`);
      onClearCart();
    } else {
      // Payment failed/cancelled – keep cart so user can retry
      setOrderError(`Payment ${payStatus.toLowerCase()} for Order #${activeOrder?.orderNumber || ''}. Your order is saved — visit My Account to retry payment.`);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Overlay Backdrop */}
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        />

        {/* Slide-over Drawer Panel */}
        <div className="relative w-full max-w-md bg-surface-container h-full shadow-2xl flex flex-col justify-between z-10 border-l border-white/10">
          {/* Header */}
          <div className="p-5 bg-primary-container border-b border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-tertiary">
              <span className="material-symbols-outlined text-xl">shopping_bag</span>
              <h3 className="font-headline text-lg font-bold text-white">{t('Your Cart')}</h3>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {orderSuccess ? (
              <div className="text-center py-12 px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                  <span className="material-symbols-outlined text-3xl">check</span>
                </div>
                <h4 className="font-headline text-xl text-white font-bold">Order Placed!</h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">{orderSuccess}</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setOrderSuccess(null); onClose(); }}
                    className="py-2.5 px-6 rounded-full bg-tertiary text-on-tertiary font-bold text-xs uppercase tracking-wider shadow-md hover:brightness-110"
                  >
                    Back to Menu
                  </button>
                  <a
                    href="/account"
                    className="py-2 px-6 rounded-full border border-tertiary/40 text-tertiary font-semibold text-xs text-center hover:bg-tertiary/10 transition-all"
                  >
                    View My Orders
                  </a>
                </div>
              </div>
            ) : orderError ? (
              <div className="py-8 px-4 space-y-4">
                <div className="p-4 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs leading-relaxed flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">error</span>
                  <span>{orderError}</span>
                </div>
                <button
                  onClick={() => setOrderError(null)}
                  className="w-full py-2.5 rounded-xl bg-white/10 text-on-surface text-xs font-semibold hover:bg-white/20 transition-all"
                >
                  Try Again
                </button>
                <a
                  href="/account"
                  className="block w-full py-2.5 rounded-xl border border-tertiary/40 text-tertiary text-xs font-semibold text-center hover:bg-tertiary/10 transition-all"
                >
                  View My Account & Retry Payment
                </a>
              </div>
            ) : cartItems.length === 0 ? (
              <div className="text-center py-16 text-outline space-y-3">
                <span className="material-symbols-outlined text-5xl text-tertiary/60">local_cafe</span>
                <p className="text-sm">{t('Cart is Empty')}</p>
                <button
                  onClick={onClose}
                  className="py-2 px-6 rounded-full bg-primary-container text-tertiary text-xs font-semibold border border-tertiary/30"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              cartItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-high/60 border border-white/5">
                  <img
                    src={item.coffee.image_url}
                    alt={item.coffee.name}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-headline text-sm font-semibold text-white truncate">{item.coffee.name}</h4>
                    <span className="text-[11px] text-tertiary block font-semibold">ETB {Number(item.coffee.price).toFixed(2)}</span>
                    <span className="text-[10px] text-outline block">{item.temperature} • {item.milk}</span>
                  </div>

                  {/* Quantity Controller */}
                  <div className="flex items-center gap-2 bg-surface-container px-2 py-1 rounded-lg border border-white/5">
                    <button 
                      onClick={() => onUpdateQty(idx, -1)}
                      className="w-5 h-5 rounded bg-surface-bright flex items-center justify-center text-xs font-bold hover:text-tertiary text-on-surface"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-white min-w-[14px] text-center">{item.quantity}</span>
                    <button 
                      onClick={() => onUpdateQty(idx, 1)}
                      className="w-5 h-5 rounded bg-surface-bright flex items-center justify-center text-xs font-bold hover:text-tertiary text-on-surface"
                    >
                      +
                    </button>
                  </div>

                  {/* Remove */}
                  <button 
                    onClick={() => onRemoveItem(idx)}
                    className="p-1 text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer Checkout */}
          {cartItems.length > 0 && !orderSuccess && (
            <div className="p-5 bg-surface-container-lowest border-t border-white/10 space-y-4">
              <div className="flex items-center justify-between text-base font-bold">
                <span className="text-on-surface">{t('Subtotal')}:</span>
                <span className="text-tertiary text-xl font-headline">ETB {totalAmount.toFixed(2)}</span>
              </div>

              <button
                onClick={handleCheckoutClick}
                disabled={isSubmitting}
                className="w-full py-3.5 px-6 rounded-full bg-tertiary hover:brightness-110 text-on-tertiary font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Processing Order...' : t('Pay with Chapa')}</span>
                <span className="material-symbols-outlined text-base">east</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Auth Modal Triggered when Guest attempts checkout */}
      <AuthModal
        isOpen={isAuthRequiredOpen}
        onClose={() => setIsAuthRequiredOpen(false)}
        initialMode="LOGIN"
        promptMessage="Please sign in or create an account to complete your order."
        onSuccessCallback={() => {
          setIsAuthRequiredOpen(false);
          processOrderSubmission();
        }}
      />

      {/* Chapa Mobile Payment Modal */}
      {activeOrder && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          orderId={activeOrder.id}
          orderNumber={activeOrder.orderNumber}
          totalAmountEtb={activeOrder.totalAmount}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </>
  );
}

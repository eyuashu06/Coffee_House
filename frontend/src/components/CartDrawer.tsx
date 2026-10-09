'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../lib/api';
import AuthModal from './AuthModal';
import PaymentModal from './PaymentModal';

export type OrderType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

export interface DeliveryZone {
  id: number;
  name: string;
  delivery_fee_etb: string;
}

export interface CartLineOption {
  id: number;
  name: string;
  price_etb?: string;
  price_modifier_etb?: string;
}

/**
 * What a cart line needs to know about its drink.
 *
 * Deliberately not the menu's CoffeeItemData: that is the grid's shape and requires
 * `rating`, which a cart line neither has nor displays. Typing the cart against it
 * meant a real object could not be built without a cast.
 */
export interface CartCoffee {
  id: number;
  name: string;
  /** ETB. Menu items carry a string, the server cart a decimal string; both coerce. */
  price: string | number;
  image_url: string;
}

export interface CartItem {
  /** Stable key so a quantity change finds the same line again after a re-render. */
  lineKey?: string;
  /** Set when the line came from the saved server cart (needed to PATCH/DELETE it). */
  serverLineId?: number;
  coffee: CartCoffee;
  quantity: number;
  temperature: string;
  milk: string;
  variant?: CartLineOption | null;
  addOns?: CartLineOption[];
}

/** Price one cart line: base + chosen variant + add-ons, times quantity. */
export function lineUnitPrice(item: CartItem): number {
  const base = Number(item.coffee.price) || 0;
  const variant = item.variant ? Number(item.variant.price_modifier_etb || 0) : 0;
  const addOns = (item.addOns || []).reduce((sum, a) => sum + Number(a.price_etb || 0), 0);
  return base + variant + addOns;
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
  const { t, tItem, language } = useLanguage();
  const birr = language === 'am' ? 'ብር' : 'ETB';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isAuthRequiredOpen, setIsAuthRequiredOpen] = useState(false);

  // Fulfillment: how the customer wants the order, and the details that type needs.
  // The drawer used to hardcode DELIVERY with no address and no zone, so the courier
  // received an order it was impossible to deliver.
  const [orderType, setOrderType] = useState<OrderType>('DELIVERY');
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [deliveryZoneId, setDeliveryZoneId] = useState<number | ''>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [isClosedStore, setIsClosedStore] = useState(false);
  const [openingHours, setOpeningHours] = useState('');

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<{ id: number; orderNumber: string; totalAmount: string } | null>(null);

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + lineUnitPrice(item) * item.quantity,
    0
  );

  const selectedZone = zones.find((zone) => zone.id === deliveryZoneId);
  const deliveryFee =
    orderType === 'DELIVERY' && selectedZone ? Number(selectedZone.delivery_fee_etb) || 0 : 0;
  const orderTotal = totalAmount + deliveryFee;

  useEffect(() => {
    if (!isOpen) return;
    // Delivery zones and whether the cafe is taking orders both come from the backend:
    // the home page used to hardcode hours and address, which contradicted the database.
    let cancelled = false;
    (async () => {
      try {
        const [zonesRes, venueRes] = await Promise.all([
          apiFetch('/api/v1/delivery-zones/'),
          apiFetch('/api/v1/restaurant-settings/'),
        ]);
        if (cancelled) return;
        if (zonesRes.ok) {
          const data = await zonesRes.json();
          setZones(Array.isArray(data) ? data : data.results || []);
        }
        if (venueRes.ok) {
          const venue = await venueRes.json();
          setIsClosedStore(venue.is_open === false);
          setOpeningHours(venue.opening_hours || '');
        }
      } catch {
        // Zones are only needed for delivery; checkout still works without them.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const processOrderSubmission = async () => {
    if (cartItems.length === 0) return;

    setIsSubmitting(true);
    setOrderSuccess(null);
    setOrderError(null);

    const payload: Record<string, unknown> = {
      contact_name: user
        ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
        : 'Customer',
      contact_phone: user?.phone || '',
      order_type: orderType,
      items: cartItems.map(item => ({
        menu_item: item.coffee.id,
        quantity: item.quantity,
        variant_name: item.variant?.name || '',
        add_ons: (item.addOns || []).map(a => ({ add_on_name: a.name })),
        temperature: item.temperature,
        milk_choice: item.milk,
      })),
    };

    if (orderType === 'DELIVERY') {
      if (deliveryZoneId) payload.delivery_zone = deliveryZoneId;
      if (deliveryAddress.trim()) payload.delivery_address = deliveryAddress.trim();
    }
    if (orderType === 'DINE_IN' && tableNumber.trim()) {
      payload.table_number = tableNumber.trim();
    }

    try {
      const res = await apiFetch('/api/v1/orders/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const orderData = await res.json();
        setActiveOrder({
          id: orderData.id,
          orderNumber: orderData.order_number || `ORD-${orderData.id}`,
          totalAmount: orderData.total_amount_etb || orderTotal.toFixed(2),
        });
        setIsPaymentModalOpen(true);
      } else {
        let errMsg = t('Failed to place order.');
        try {
          const errData = await res.json();
          const flat = Object.entries(errData)
            .map(([, value]) => (Array.isArray(value) ? value.join(' ') : String(value)))
            .join(' ');
          errMsg = flat || errData.detail || errData.error || JSON.stringify(errData);
        } catch {}
        setOrderError(`${t('Order failed:', 'ትዕዛዝው አልተሳካም፦')} ${errMsg}`);
      }
    } catch (err: any) {
      setOrderError(t('Network error. Please check your connection and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckoutClick = () => {
    if (cartItems.length === 0) return;

    // A closed cafe cannot take the order, so do not open a payment modal for one.
    if (isClosedStore) return;

    // Requirement: Customer must be logged in to complete checkout
    if (!user) {
      setIsAuthRequiredOpen(true);
      return;
    }

    processOrderSubmission();
  };

  /** Whether the currently selected fulfillment type has everything it needs. */
  const fulfillmentReady =
    orderType !== 'DELIVERY' ||
    (Boolean(deliveryZoneId) || deliveryAddress.trim().length > 0);

  const missingFulfillmentMessage =
    orderType === 'DELIVERY' && !fulfillmentReady
      ? t('Choose a delivery zone or enter your address so we know where to bring it.')
      : null;

  const handlePaymentComplete = (payStatus: string, txRef: string, message: string) => {
    setIsPaymentModalOpen(false);
    if (payStatus === 'SUCCESS') {
      setOrderSuccess(`✅ ${t('Order')} #${activeOrder?.orderNumber || ''} ${t('placed and paid!')} ${message}`);
      onClearCart();
    } else if (payStatus === 'PENDING') {
      // Payment still pending (e.g. gateway timeout) – order is saved, pay from My Orders
      setOrderSuccess(`⏳ ${t('Payment is pending for Order #', 'ክፍያው በትዕዛዝ ላይ በመጠባበቅ ላይ ነው፦')}#${activeOrder?.orderNumber || ''}. ${t('Finish paying from My Orders in your account.')}`);
      onClearCart();
    } else {
      // Payment failed/cancelled – order is saved, customer retries from account
      setOrderError(`${t('Payment')} ${payStatus.toLowerCase()} — ${t('Order')} #${activeOrder?.orderNumber || ''}. ${t('Your order is saved — open My Orders in your account to complete payment.')}`);
      onClearCart();
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
        <div className="relative w-full max-w-md bg-surface-container h-full shadow-2xl flex flex-col justify-between z-10 border-l border-[#514345]">
          {/* Header */}
          <div className="p-5 bg-[#1c1b1b] border-b border-[#514345] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#f7b5be]">
              <span className="material-symbols-outlined text-xl">shopping_bag</span>
              <h3 className="font-display text-lg font-bold text-white">{t('Your Cart')}</h3>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#2c2b2a] hover:bg-white/20 text-white flex items-center justify-center transition-colors"
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
                <h4 className="font-display text-xl text-white font-bold">{t('Order Placed!')}</h4>
                <p className="text-sm text-[#9e8d8e] leading-relaxed">{orderSuccess}</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setOrderSuccess(null); onClose(); }}
                    className="py-2.5 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-bold text-xs uppercase tracking-wider shadow-md hover:brightness-110"
                  >
                    {t('Back to Menu')}
                  </button>
                  <a
                    href="/account"
                    className="py-2 px-6 rounded-full border border-[#683941] text-[#f7b5be] font-semibold text-xs text-center hover:bg-[#f7b5be]/10 transition-all"
                  >
                    {t('View My Orders')}
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
                  className="w-full py-3 px-6 rounded-full border border-[#514345] text-[#9e8d8e] font-bold text-xs uppercase tracking-wider hover:bg-outline-variant/10 transition-all"
                >
                  {t('Try Again')}
                </button>
                <a
                  href="/account"
                  className="block w-full py-3 px-6 rounded-full border border-[#683941] text-[#f7b5be] font-bold text-xs uppercase tracking-wider text-center hover:bg-[#f7b5be]/10 transition-all"
                >
                  {t('View My Account & Retry Payment')}
                </a>
              </div>
            ) : cartItems.length === 0 ? (
              <div className="text-center py-16 text-outline space-y-3">
                <span className="material-symbols-outlined text-5xl text-[#f7b5be]/60">local_cafe</span>
                <p className="text-sm">{t('Cart is Empty')}</p>
                <button
                  onClick={onClose}
                  className="py-3 px-8 rounded-full border border-[#514345] text-[#9e8d8e] font-bold text-xs uppercase tracking-wider hover:bg-outline-variant/10 transition-all"
                >
                  {t('Browse Menu')}
                </button>
              </div>
            ) : (
              cartItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-high/60 border border-[#514345]/50">
                  <img
                    src={item.coffee.image_url}
                    alt={tItem(item.coffee.name)}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-display text-sm font-semibold text-white truncate">{tItem(item.coffee.name)}</h4>
                    {item.variant && (
                      <span className="text-[10.5px] text-[#fbbb50] block">
                        {tItem(item.variant.name)}
                        {Number(item.variant.price_modifier_etb || 0) > 0 &&
                          ` (+${birr} ${Number(item.variant.price_modifier_etb).toFixed(2)})`}
                      </span>
                    )}
                    {(item.addOns || []).length > 0 && (
                      <span className="text-[10.5px] text-[#d5c2c3] block truncate">
                        + {(item.addOns || []).map(a => tItem(a.name)).join(', ')}
                      </span>
                    )}
                    <span className="text-[10px] text-[#9e8d8e] block">
                      {t(item.temperature)}{item.milk && item.milk !== 'N/A' ? ` • ${t(item.milk)}` : ''}
                    </span>
                    <span className="text-[11px] text-[#f7b5be] block font-semibold mt-0.5">
                      {birr} {lineUnitPrice(item).toFixed(2)} {t('each')}
                      {item.quantity > 1 && ` · ${birr} ${(lineUnitPrice(item) * item.quantity).toFixed(2)}`}
                    </span>
                  </div>

                  {/* Quantity Controller */}
                  <div className="flex items-center gap-2 bg-surface-container px-2 py-1 rounded-lg border border-[#514345]/50">
                    <button 
                      onClick={() => onUpdateQty(idx, -1)}
                      className="w-5 h-5 rounded bg-surface-bright flex items-center justify-center text-xs font-bold hover:text-[#f7b5be] text-[#e5e2e1]"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-white min-w-[14px] text-center">{item.quantity}</span>
                    <button 
                      onClick={() => onUpdateQty(idx, 1)}
                      className="w-5 h-5 rounded bg-surface-bright flex items-center justify-center text-xs font-bold hover:text-[#f7b5be] text-[#e5e2e1]"
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
            <div className="p-5 bg-surface-container-lowest border-t border-[#514345] space-y-4">
              {/* Fulfillment: delivery, pickup at the counter, or a table */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#9e8d8e] font-bold">
                  {t('How would you like it?')}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'DELIVERY', label: t('Delivery'), icon: 'delivery_dining' },
                    { value: 'PICKUP', label: t('Store Pickup'), icon: 'storefront' },
                    { value: 'DINE_IN', label: t('Dine-In'), icon: 'table_restaurant' },
                  ] as { value: OrderType; label: string; icon: string }[]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setOrderType(option.value)}
                      aria-pressed={orderType === option.value}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-[11px] font-semibold transition-all ${
                        orderType === option.value
                          ? 'bg-[#f7b5be] text-[#4e232b] border-[#f7b5be]'
                          : 'bg-surface-container text-[#9e8d8e] border-[#514345] hover:text-[#d5c2c3]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {orderType === 'DELIVERY' && (
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-[0.08em] text-[#9e8d8e] font-bold">
                    {t('Delivery zone')}
                  </label>
                  <select
                    value={deliveryZoneId}
                    onChange={(e) => setDeliveryZoneId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-[#514345] text-[#e5e2e1] text-sm focus:border-[#f7b5be] focus:outline-none"
                  >
                    <option value="">{t('Choose your zone...')}</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} — {birr} {Number(zone.delivery_fee_etb).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <label className="block text-[10px] uppercase tracking-[0.08em] text-[#9e8d8e] font-bold mt-2">
                    {t('Delivery address')}
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={2}
                    placeholder={t('House, street, landmark...')}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-[#514345] text-[#e5e2e1] text-sm placeholder:text-[#6f6162] focus:border-[#f7b5be] focus:outline-none resize-none"
                  />
                  {missingFulfillmentMessage && (
                    <p className="text-[11px] text-[#fbbb50] leading-relaxed">{missingFulfillmentMessage}</p>
                  )}
                </div>
              )}

              {orderType === 'DINE_IN' && (
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-[0.08em] text-[#9e8d8e] font-bold">
                    {t('Table number')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder={t('Which table are you at?')}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-[#514345] text-[#e5e2e1] text-sm placeholder:text-[#6f6162] focus:border-[#f7b5be] focus:outline-none"
                  />
                </div>
              )}

              {isClosedStore && (
                <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs leading-relaxed">
                  {t('We are closed right now and are not accepting orders.')}
                  {openingHours ? ` ${t('Our opening hours:')} ${openingHours}` : ''}
                </div>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-[#9e8d8e]">
                  <span>{t('Subtotal')}:</span>
                  <span>{birr} {totalAmount.toFixed(2)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex items-center justify-between text-[#9e8d8e]">
                    <span>{t('Delivery')}:</span>
                    <span>{birr} {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-base font-bold">
                  <span className="text-[#e5e2e1]">{t('Total')}:</span>
                  <span className="text-[#f7b5be] text-xl font-display">{birr} {orderTotal.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleCheckoutClick}
                disabled={isSubmitting || isClosedStore || !fulfillmentReady}
                className="w-full py-3.5 px-6 rounded-full bg-[#f7b5be] hover:brightness-110 text-[#4e232b] font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? t('Processing Order...') : t('Pay with Chapa')}</span>
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
        promptMessage={t('Please sign in or create an account to complete your order.')}
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

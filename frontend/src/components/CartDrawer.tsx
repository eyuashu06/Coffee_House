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
  const { user, setUser } = useAuth();
  const { t, tItem, language } = useLanguage();
  const birr = language === 'am' ? 'ብር' : 'ETB';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isAuthRequiredOpen, setIsAuthRequiredOpen] = useState(false);

  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

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

  // Pre-fill user profile info if logged in so returning users never re-type
  useEffect(() => {
    if (user) {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
      if (!guestName && fullName) setGuestName(fullName);
      if (!guestPhone && user.phone) setGuestPhone(user.phone);
    }
  }, [user]);

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

    const contactName = user
      ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
      : guestName.trim() || 'Valued Guest';
    const contactPhone = (user?.phone || guestPhone).trim();

    const payload: Record<string, unknown> = {
      contact_name: contactName,
      contact_phone: contactPhone,
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
        if (orderData.user) {
          setUser(orderData.user);
        }
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
          errMsg = flat || errData.detail || errData.error || t('Please review your order details and try again.');
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

    // Verify phone number (must be at least 9 valid digits to reach customer)
    const phoneToVerify = (user?.phone || guestPhone).trim();
    const cleanDigits = phoneToVerify.replace(/[\s\-\(\)\+]/g, '');

    if (!cleanDigits || cleanDigits.length < 9) {
      setPhoneError(t('Please enter a valid phone number (at least 9 digits) to verify and confirm your order.'));
      return;
    }
    setPhoneError(null);

    // Guest checkout is fully permitted: no forced login gate!
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
    } else if (payStatus === 'CASH_PENDING' || message.includes('Cash') || message.includes('ጥሬ')) {
      setOrderSuccess(`✅ ${t('Order')} #${activeOrder?.orderNumber || ''} ${t('placed!')} ${message}`);
      onClearCart();
    } else if (payStatus === 'PENDING') {
      // Payment still pending (e.g. transfer verification)
      setOrderSuccess(`⏳ ${t('Payment submitted for Order #', 'ክፍያ ተልኳል ለትዕዛዝ፦')}#${activeOrder?.orderNumber || ''}. ${message}`);
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
          className="fixed inset-0 bg-black/70 transition-opacity" 
        />

        {/* Slide-over Drawer Panel */}
        <div className="relative w-full max-w-md bg-surface-2 h-full shadow-2xl flex flex-col justify-between z-10 border-l border-[var(--border)]">
          {/* Header */}
          <div className="p-5 bg-surface-2 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <span className="material-symbols-outlined text-xl">shopping_bag</span>
              <h3 className="font-display text-lg font-bold text-[var(--text)]">{t('Your Cart')}</h3>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[var(--surface)] hover:bg-[var(--accent-soft)] text-[var(--text)] border border-[var(--border)] flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          {/* Closed-store notice: at the top of the drawer so the customer sees why
              checkout is blocked the moment the cart opens, not after scrolling. */}
          {isClosedStore && (
            <div className="px-5 py-3 bg-red-950/80 border-b border-red-500/40 text-red-200 text-xs leading-relaxed flex items-start gap-2">
              <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">schedule</span>
              <p>
                {t('We are closed right now and are not accepting orders.')}
                {openingHours ? ` ${t('Our opening hours:')} ${openingHours}` : ''}
              </p>
            </div>
          )}

          {/* Content Body */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {orderSuccess ? (
                <div className="text-center py-12 px-4 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                    <span className="material-symbols-outlined text-3xl">check</span>
                  </div>
                  <h4 className="font-display text-xl text-[var(--text)] font-bold">{t('Order Placed!')}</h4>
                  <p className="text-sm text-[var(--muted)] leading-relaxed">{orderSuccess}</p>

                  {/* For guest customers: give opportunity to sign up and save details for future orders */}
                  {!user && (
                    <div className="p-3.5 rounded-xl bg-surface-container/80 border border-[var(--accent)]/40 text-left space-y-2 my-2">
                      <div className="flex items-center gap-2 text-[var(--accent)] font-bold text-xs">
                        <span className="material-symbols-outlined text-base">bookmark_add</span>
                        <span>{t('Save details for next time?')}</span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                        {t('Create a free account with your phone number to track this order, save your delivery addresses, and never type your details again.')}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('REGISTER');
                          setIsAuthRequiredOpen(true);
                        }}
                        className="w-full py-2 px-3 rounded-lg bg-[var(--accent)] hover:brightness-110 text-[var(--accent-contrast)] font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm">person_add</span>
                        <span>{t('Create Free Account')}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { setOrderSuccess(null); onClose(); }}
                      className="py-2.5 px-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-xs uppercase tracking-wider shadow-md hover:brightness-110"
                    >
                      {t('Back to Menu')}
                    </button>
                    <a
                      href="/?welcome=1"
                      className="py-2 px-6 rounded-full border border-[var(--border)] text-[var(--accent)] font-semibold text-xs text-center hover:bg-[var(--accent-soft)] transition-all"
                    >
                      {t('Back to Home')}
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
                    className="w-full py-3 px-6 rounded-full border border-[var(--border)] text-[var(--muted)] font-bold text-xs uppercase tracking-wider hover:bg-outline-variant/10 transition-all"
                  >
                    {t('Try Again')}
                  </button>
                  <a
                    href="/?welcome=1"
                    className="block w-full py-3 px-6 rounded-full border border-[#683941] text-[var(--accent)] font-bold text-xs uppercase tracking-wider text-center hover:bg-[#f7b5be]/10 transition-all"
                  >
                    {t('Back to Home')}
                  </a>
                </div>
            ) : cartItems.length === 0 ? (
              <div className="text-center py-16 text-outline space-y-3">
                <span className="material-symbols-outlined text-5xl text-[var(--accent)]/60">local_cafe</span>
                <p className="text-sm">{t('Cart is Empty')}</p>
                <button
                  onClick={onClose}
                  className="py-3 px-8 rounded-full border border-[var(--border)] text-[var(--muted)] font-bold text-xs uppercase tracking-wider hover:bg-outline-variant/10 transition-all"
                >
                  {t('Browse Menu')}
                </button>
              </div>
            ) : (
              cartItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-surface-2/60 border border-[var(--border)]/50">
                  <img
                    src={item.coffee.image_url || 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800'}
                    alt={tItem(item.coffee.name)}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800';
                    }}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-display text-sm font-semibold text-[var(--text)] truncate">{tItem(item.coffee.name)}</h4>
                    {item.variant && (
                      <span className="text-[10.5px] text-[var(--gold)] block">
                        {tItem(item.variant.name)}
                        {Number(item.variant.price_modifier_etb || 0) > 0 &&
                          ` (+${birr} ${Number(item.variant.price_modifier_etb).toFixed(2)})`}
                      </span>
                    )}
                    {(item.addOns || []).length > 0 && (
                      <span className="text-[10.5px] text-[var(--muted)] block truncate">
                        + {(item.addOns || []).map(a => tItem(a.name)).join(', ')}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--muted)] block">
                      {t(item.temperature)}{item.milk && item.milk !== 'N/A' ? ` • ${t(item.milk)}` : ''}
                    </span>
                    <span className="text-[11px] text-[var(--accent)] block font-semibold mt-0.5">
                      {birr} {lineUnitPrice(item).toFixed(2)} {t('each')}
                      {item.quantity > 1 && ` · ${birr} ${(lineUnitPrice(item) * item.quantity).toFixed(2)}`}
                    </span>
                  </div>

                  {/* Quantity Controller */}
                  <div className="flex items-center gap-2 bg-surface-2 px-2 py-1 rounded-lg border border-[var(--border)]/50">
                    <button 
                      onClick={() => onUpdateQty(idx, -1)}
                      className="w-5 h-5 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-xs font-bold hover:text-[var(--accent)] text-[var(--text)]"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-[var(--text)] min-w-[14px] text-center">{item.quantity}</span>
                    <button 
                      onClick={() => onUpdateQty(idx, 1)}
                      className="w-5 h-5 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-xs font-bold hover:text-[var(--accent)] text-[var(--text)]"
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

            {/* In-drawer Checkout Options: Contact info & Delivery options */}
            {cartItems.length > 0 && !orderSuccess && (
              <div className="pt-2 space-y-3.5 border-t border-[var(--border)]">
                {/* Contact Information & Phone Verification */}
                {!user ? (
                  <div className="p-3.5 rounded-xl bg-surface border border-[var(--border)] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-bold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[var(--accent)]">phone_iphone</span>
                        {t('Contact & Phone Verification')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('LOGIN');
                          setIsAuthRequiredOpen(true);
                        }}
                        className="text-[11px] text-[var(--accent)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">login</span>
                        <span>{t('Sign in to use saved details')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10.5px] font-semibold text-[var(--text)] mb-1">
                          {t('Phone Number')} <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="tel"
                          value={guestPhone}
                          onChange={(e) => {
                            setGuestPhone(e.target.value);
                            if (phoneError) setPhoneError(null);
                          }}
                          placeholder="0911 234 567"
                          className={`w-full px-3 py-2 rounded-xl bg-surface-2 border text-[var(--text)] text-xs placeholder:text-[var(--muted)] focus:outline-none transition-colors ${
                            phoneError ? 'border-red-500 focus:border-red-500' : 'border-[var(--border)] focus:border-[var(--accent)]'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-semibold text-[var(--text)] mb-1">
                          {t('Your Name (Optional)')}
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder={t('e.g. Abebe')}
                          className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-[var(--border)] text-[var(--text)] text-xs placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
                        />
                      </div>
                    </div>

                    {phoneError && (
                      <p className="text-[11px] text-red-400 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {phoneError}
                      </p>
                    )}
                    <p className="text-[10px] text-[var(--muted)] leading-tight">
                      {t('We will contact this number for delivery and order updates. No account required.')}
                    </p>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-[var(--accent-soft)]/20 border border-[var(--accent)]/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-[var(--text)] min-w-0">
                      <span className="material-symbols-outlined text-base text-[var(--accent)] shrink-0">verified_user</span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {user.first_name || user.username} {user.phone ? `· ${user.phone}` : ''}
                        </p>
                        <p className="text-[10px] text-[var(--muted)]">{t('Using your saved account details')}</p>
                      </div>
                    </div>
                    {!user.phone && (
                      <div className="shrink-0 w-32">
                        <input
                          type="tel"
                          value={guestPhone}
                          onChange={(e) => {
                            setGuestPhone(e.target.value);
                            if (phoneError) setPhoneError(null);
                          }}
                          placeholder="0911..."
                          className="w-full px-2 py-1 rounded-lg bg-surface border border-[var(--border)] text-xs text-[var(--text)]"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Fulfillment: delivery, pickup at the counter, or a table */}
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-bold">
                    {t('How would you like it?')}
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'DELIVERY', label: t('Delivery'), icon: 'delivery_dining' },
                      { value: 'PICKUP', label: t('Store Pickup'), icon: 'storefront' },
                      { value: 'DINE_IN', label: t('Dine-In / Reserved Table'), icon: 'table_restaurant' },
                    ] as { value: OrderType; label: string; icon: string }[]).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setOrderType(option.value)}
                        aria-pressed={orderType === option.value}
                        className={`flex flex-col items-center gap-1 py-2 px-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                          orderType === option.value
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)] shadow-sm'
                            : 'bg-surface text-[var(--muted)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">{option.icon}</span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {orderType === 'DELIVERY' && (
                  <div className="p-3 rounded-xl bg-surface border border-[var(--border)] space-y-2.5 animate-fade-in">
                    <label className="block text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-bold">
                      {t('Delivery zone')}
                    </label>
                    <select
                      value={deliveryZoneId}
                      onChange={(e) => setDeliveryZoneId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-[var(--border)] text-[var(--text)] text-xs focus:border-[var(--accent)] focus:outline-none"
                    >
                      <option value="">{t('Choose your zone...')}</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name} — {birr} {Number(zone.delivery_fee_etb).toFixed(2)}
                        </option>
                      ))}
                    </select>

                    <label className="block text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-bold mt-2">
                      {t('Delivery address')}
                    </label>
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      rows={2}
                      placeholder={t('House, street, landmark...')}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-[var(--border)] text-[var(--text)] text-xs placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none resize-none"
                    />
                    {missingFulfillmentMessage && (
                      <p className="text-[11px] text-amber-500 dark:text-amber-400 leading-relaxed font-medium">
                        {missingFulfillmentMessage}
                      </p>
                    )}
                  </div>
                )}

                {orderType === 'DINE_IN' && (
                  <div className="p-3 rounded-xl bg-surface border border-[var(--border)] space-y-2 animate-fade-in">
                    <label className="block text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-bold">
                      {t('Table number or reservation code')}
                    </label>
                    <input
                      type="text"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      placeholder={t('Table number or reservation code')}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-[var(--border)] text-[var(--text)] text-xs placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky Bottom Checkout Footer: Total & Pay to Order Button */}
          {cartItems.length > 0 && !orderSuccess && (
            <div className="p-4 sm:p-5 bg-surface-2/95 backdrop-blur-md border-t border-[var(--border)] shrink-0 space-y-3 shadow-[0_-8px_20px_rgba(0,0,0,0.15)] z-20">
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-[var(--muted)]">
                  <span>{t('Subtotal')}:</span>
                  <span>{birr} {totalAmount.toFixed(2)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex items-center justify-between text-[var(--muted)]">
                    <span>{t('Delivery')}:</span>
                    <span>{birr} {deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-bold pt-1 border-t border-[var(--border)]/50">
                  <span className="text-[var(--text)]">{t('Total')}:</span>
                  <span className="text-[var(--accent)] text-lg font-display">{birr} {orderTotal.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleCheckoutClick}
                disabled={isSubmitting || isClosedStore || !fulfillmentReady}
                className="w-full py-3.5 px-6 rounded-full bg-[var(--accent)] hover:brightness-110 text-[var(--accent-contrast)] font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>{isSubmitting ? t('Processing Order...') : (language === 'am' ? 'ክፍያ ፈፅመው ይዘዙ' : t('Pay to Order'))}</span>
                <span className="material-symbols-outlined text-base">east</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Auth Modal: optional sign in or post-order registration to save details */}
      <AuthModal
        isOpen={isAuthRequiredOpen}
        onClose={() => setIsAuthRequiredOpen(false)}
        initialMode={authMode}
        promptMessage={
          authMode === 'REGISTER'
            ? t('Create an account with your phone number to save your details for next time.')
            : t('Sign in to automatically load your saved details and addresses.')
        }
        onSuccessCallback={() => {
          setIsAuthRequiredOpen(false);
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

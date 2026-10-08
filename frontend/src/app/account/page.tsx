'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import OrderTracker from '../../components/OrderTracker';
import ReceiptModal from '../../components/ReceiptModal';
import PaymentModal from '../../components/PaymentModal';
import Link from 'next/link';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/api';

interface OrderItem {
  id: number;
  menu_item?: number | null;
  item_name: string;
  variant_name?: string;
  unit_price_etb: string;
  quantity: number;
  subtotal_etb: string;
  temperature?: string;
  milk_choice?: string;
  notes?: string;
}

interface Order {
  id: number;
  order_number: string;
  customer_username?: string;
  order_type: string;
  table_number?: string;
  contact_name: string;
  contact_phone: string;
  delivery_address?: string;
  total_amount_etb: string;
  status: string;
  rejection_reason?: string;
  placed_at?: string | null;
  created_at: string;
  items: OrderItem[];
  latest_payment?: {
    id: number;
    tx_ref: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
    payment_method: string;
    failure_reason?: string;
    checkout_url?: string;
    created_at: string;
    verified_at?: string | null;
    gateway_status?: string;
  } | null;
  /**
   * Whether the money is in, decided by the backend from whether *any* payment
   * for this order succeeded. Deriving it here from the newest attempt was wrong
   * in both directions: a paid order whose latest attempt was abandoned read as
   * unpaid, and the receipt could be withheld from a customer who had paid.
   */
  payment_state?: 'paid' | 'settling' | 'failed' | 'unpaid';
}

const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

// Chapa can take a few seconds to settle after the customer leaves the checkout page.
const VERIFY_INTERVAL_MS = 5000;
const MAX_VERIFY_ATTEMPTS = 24;
const PAST_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'];

/**
 * A receipt only exists once the money has actually been captured.
 *
 * Prefers the backend's `payment_state`, and falls back to the latest attempt for
 * orders fetched before the field existed.
 */
const isOrderPaid = (order: Order): boolean => {
  if (order.payment_state) return order.payment_state === 'paid';
  return order.latest_payment?.status === 'SUCCESS';
};

/**
 * True while a payment is genuinely in flight: the customer has started paying
 * and the gateway has not answered yet.
 *
 * The window is generous on purpose. A payment that was never completed - the
 * customer closed the Chapa tab - must be shown as unpaid rather than
 * "settling" forever, but a payment being confirmed a minute later is normal.
 */
const isPaymentSettling = (order: Order): boolean => {
  if (order.payment_state) return order.payment_state === 'settling';
  if (!order.latest_payment || order.latest_payment.status !== 'PENDING') return false;
  const created = new Date(order.latest_payment.created_at).getTime();
  return Date.now() - created < 2 * 60 * 1000;
};

/** An attempt that was rejected or abandoned: unpaid, and worth retrying. */
const isPaymentFailed = (order: Order): boolean =>
  order.payment_state === 'failed' ||
  ['FAILED', 'ABANDONED'].includes(order.latest_payment?.status ?? '');

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting Payment',
  PLACED: 'Placed (Paid)',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

interface Address {
  id: number;
  street_address: string;
  city: string;
  subcity_or_zone: string;
  is_default: boolean;
}

interface Reservation {
  id: number;
  name: string;
  date_time: string;
  party_size: number;
  contact_phone: string;
  status: string;
}

interface Banner {
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function AccountPage() {
  const { user, loading, checkAuth, logout, sessionExpired, reportUnauthorized } = useAuth();
  const { t, tItem, locale, language } = useLanguage();
  const birr = language === 'am' ? 'ብር' : 'ETB';
  const [activeTab, setActiveTab] = useState<'orders' | 'reservations' | 'addresses' | 'profile'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const verifiedPaymentRef = useRef<string | null>(null);
  const settledPaymentsRef = useRef<Set<string>>(new Set());
  const paymentTimerRef = useRef<number | null>(null);

  // Address Form
  const [streetAddress, setStreetAddress] = useState('');
  const [subcityOrZone, setSubcityOrZone] = useState('');
  const [isDefaultAddr, setIsDefaultAddr] = useState(true);
  const [addrMsg, setAddrMsg] = useState<string | null>(null);

  // Profile Edit Form
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingOrders(true);
    try {
      const res = await apiFetch('/api/v1/orders/?page_size=200', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.status === 401) {
        reportUnauthorized();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.results || []);
        setOrders(list);
      }
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      if (!silent) setIsLoadingOrders(false);
    }
  }, []);

  // After returning from the Chapa gateway the payment is often not settled yet, and
  // the webhook cannot reach localhost - so keep re-checking until the gateway answers.
  const verifyPaymentOnce = useCallback(async (txRef: string): Promise<string | null> => {
    const res = await apiFetch(`/api/v1/payments/verify/${txRef}/`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const payment = data.payment;
    fetchOrders(true);
    return payment?.status || null;
  }, [fetchOrders]);

  const announcePaymentResult = useCallback((payment: any) => {
    const ref = payment?.order_number ? ` ${payment.order_number}` : '';
    if (payment?.status === 'SUCCESS') {
      setBanner({ type: 'success', message: `${t('Payment confirmed!')} ${t('Order')}${ref} ${t('is paid and our kitchen has been notified.')}` });
    } else if (payment?.status === 'FAILED') {
      setBanner({ type: 'error', message: `${t('Payment failed')}${ref} (${payment.failure_reason || t('unknown reason')}). ${t('Your order is saved — tap "Pay Now" to try again.')}` });
    } else if (payment?.status === 'ABANDONED') {
      setBanner({ type: 'error', message: `${t('Payment was cancelled')}${ref}. ${t('Your order is saved — tap "Pay Now" to try again.')}` });
    }
  }, []);

  /**
   * Ask the gateway about every unsettled payment on this account.
   *
   * Re-checking all of them, not just the first, matters: a customer who paid
   * for one order and abandoned an attempt on another would otherwise keep seeing
   * the abandoned one as the only thing being confirmed.
   */
  const reconcileUnsettled = useCallback(async (): Promise<number> => {
    const unsettled = orders
      .filter(o => o.status === 'PENDING_PAYMENT' && o.latest_payment?.status === 'PENDING')
      .filter(o => o.latest_payment && !settledPaymentsRef.current.has(o.latest_payment.tx_ref));
    if (!unsettled.length) return 0;

    let changed = 0;
    for (const order of unsettled) {
      const txRef = order.latest_payment!.tx_ref;
      const status = await verifyPaymentOnce(txRef);
      // A null status means the call itself failed and 'PENDING' means the gateway
      // has not settled yet. Neither is an answer, so this transaction stays
      // eligible for the next tick.
      if (!status || status === 'PENDING') continue;
      settledPaymentsRef.current.add(txRef);
      changed += 1;
      announcePaymentResult({ ...order.latest_payment, status, order_number: order.order_number });
    }
    return changed;
  }, [orders, verifyPaymentOnce, announcePaymentResult]);

  const verifyPendingPayment = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    // Chapa returns the reference as tx_ref or trx_ref depending on the flow
    const txRef = params.get('tx_ref') || params.get('trx_ref');

    // No reference in the URL: the customer may still have an unsettled payment
    // from an earlier visit, so reconcile those too rather than doing nothing.
    if (!txRef) {
      await reconcileUnsettled();
      return;
    }
    if (verifiedPaymentRef.current === txRef) return;
    verifiedPaymentRef.current = txRef;

    setIsConfirmingPayment(true);
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await apiFetch(`/api/v1/payments/verify/${txRef}/`, {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const data = await res.json();
          const payment = data.payment;
          fetchOrders(true);

          if (payment?.status && payment.status !== 'PENDING') {
            settledPaymentsRef.current.add(txRef);
            announcePaymentResult(payment);
            setIsConfirmingPayment(false);
            // Drop the query string so a refresh doesn't re-check a settled payment
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
          setBanner({ type: 'info', message: t('Confirming your payment with the gateway…') });
        }
      } catch (e) {
        console.error('Failed to verify payment:', e);
      }

      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        setIsConfirmingPayment(false);
        setBanner({ type: 'info', message: t('Payment is taking longer than usual. It will update here automatically — or refresh the page in a moment.') });
        return;
      }
      paymentTimerRef.current = window.setTimeout(poll, VERIFY_INTERVAL_MS);
    };

    poll();
  }, [fetchOrders, announcePaymentResult, reconcileUnsettled]);

  // Safety net: any order whose payment is still settling gets re-checked too, so a
  // customer who closed the Chapa tab still sees the confirmation when they come back.
  // This also runs on mount, so a paid order is recognised even without the gateway
  // ever reaching the webhook.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(reconcileUnsettled, 8000);
    reconcileUnsettled();
    return () => clearInterval(interval);
  }, [user, reconcileUnsettled]);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/addresses/');
      if (res.ok) {
        const data = await res.json();
        setAddresses(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (e) {
      console.error('Failed to fetch addresses:', e);
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    setIsLoadingReservations(true);
    try {
      const res = await apiFetch('/api/v1/reservations/?page_size=100', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.status === 401) { reportUnauthorized(); return; }
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.results || []);
        setReservations(list);
      }
    } catch (e) {
      console.error('Failed to fetch reservations:', e);
    } finally {
      setIsLoadingReservations(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setPhone(user.phone || '');
      fetchOrders();
      fetchAddresses();
      fetchReservations();
      verifyPendingPayment();
    }
  }, [user, fetchOrders, fetchAddresses, fetchReservations, verifyPendingPayment, reportUnauthorized]);

  // Poll order statuses so the customer sees kitchen/delivery updates live
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => fetchOrders(true), 10000);
    return () => {
      clearInterval(interval);
      if (paymentTimerRef.current) window.clearTimeout(paymentTimerRef.current);
    };
  }, [user, fetchOrders]);

  const handlePaymentComplete = (payStatus: string, _txRef: string, message: string) => {
    setPayOrder(null);
    if (payStatus === 'SUCCESS') {
      setBanner({ type: 'success', message: `${t('Order')} ${payOrder?.order_number || ''} ${t('placed!')} ${message}` });
    } else if (payStatus === 'PENDING') {
      setBanner({ type: 'info', message: t('Payment is pending. It will confirm here automatically once processed.') });
    } else {
      setBanner({ type: 'error', message: t('Payment did not go through. Your order is saved — tap "Pay Now" to retry.') });
    }
    fetchOrders(true);
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrMsg(null);
    try {
      const res = await apiFetch('/api/v1/addresses/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street_address: streetAddress,
          city: 'Addis Ababa',
          subcity_or_zone: subcityOrZone,
          is_default: isDefaultAddr,
        }),
      });
      if (res.ok) {
        setAddrMsg(t('Address added successfully!'));
        setStreetAddress('');
        setSubcityOrZone('');
        fetchAddresses();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAddrMsg(`Failed to add address: ${JSON.stringify(errorData)}`);
      }
    } catch (err) {
      setAddrMsg(t('Failed to add address due to a network error.'));
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const res = await apiFetch('/api/v1/auth/me/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone }),
      });
      if (res.ok) {
        setProfileMsg(t('Profile updated successfully!'));
        checkAuth();
      } else {
        setProfileMsg(t('Failed to update profile.'));
      }
    } catch (err) {
      setProfileMsg(t('Failed to update profile.'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f7b5be] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && sessionExpired) {
    return (
      <div className="min-h-screen bg-surface text-[#e5e2e1] flex flex-col items-center justify-center gap-4 px-6 text-center font-body">
        <span className="material-symbols-outlined text-5xl text-amber-400">lock_clock</span>
        <h2 className="font-display text-[26px] font-bold">{t('Session expired')}</h2>
        <p className="text-[#d5c2c3] text-[15px] max-w-md">
          {t('You were signed out, so your orders have stopped updating. Please sign in again.')}
        </p>
        <Link href="/?auth=login" className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold flex items-center hover:brightness-110 transition-colors">
          {t('Sign in again')}
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface text-[#e5e2e1] flex flex-col items-center justify-center font-body">
        <span className="material-symbols-outlined text-5xl text-[#f7b5be] mb-4">lock</span>
        <h2 className="font-display text-[26px] font-bold">{t('Sign In Required')}</h2>
        <p className="text-[#d5c2c3] mt-2 mb-6 text-[15px]">{t('Please sign in to view your orders and manage your profile.')}</p>
        <Link href="/?welcome=1" className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold flex items-center hover:bg-[#ffd9dd] transition-colors">
          {t('Return to Home')}
        </Link>
      </div>
    );
  }

  const pendingOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
  const pastOrders = orders.filter(o => PAST_STATUSES.includes(o.status));

  return (
    <div className="bg-surface text-[#e5e2e1] font-body min-h-screen pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-sm border-b border-[#514345]/60">
        <div className="flex items-center justify-between px-6 h-14">
          <Link href="/?welcome=1" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-full bg-[#3b141c] border border-[#683941] flex items-center justify-center text-[#f7b5be] text-[16px] group-hover:scale-105 transition-transform"><i className="ph ph-coffee-bean"></i></span>
            <span className="font-display text-[21px] tracking-wide">Buna Hub</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[#d5c2c3] text-[15px] hidden sm:block">{t('Hello,')} {user.first_name || user.username}</span>
            <button onClick={logout} className="h-8 px-4 rounded-full border border-[#514345] text-[#d5c2c3] text-[14px] flex items-center hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">{t('Sign Out')}</button>
          </div>
        </div>
      </header>

      {/* BANNER */}
      {banner && (
        <div className={`mx-4 mt-6 p-4 rounded-[14px] flex items-start gap-3 border ${
          banner.type === 'success' ? 'bg-[#3b141c] border-[#683941] text-[#f7b5be]' :
          banner.type === 'error' ? 'bg-red-950 border-red-900 text-red-200' :
          'bg-[#1c1b1b] border-[#514345] text-[#e5e2e1]'
        }`}>
          <i className={`ph ${banner.type === 'success' ? 'ph-check-circle' : banner.type === 'error' ? 'ph-warning-circle' : 'ph-info'} text-xl mt-0.5`}></i>
          <span className="text-[15px]">{banner.message}</span>
          <button onClick={() => setBanner(null)} className="ml-auto hover:opacity-70"><i className="ph ph-x"></i></button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h1 className="font-display text-[40px] leading-none">{t('Your Account')}</h1>
          {isConfirmingPayment && (
            <span className="flex items-center gap-2 text-[13px] text-blue-200 bg-blue-950/50 border border-blue-500/30 rounded-full px-3 py-1.5">
              <i className="ph ph-spinner-gap animate-spin"></i>
              {t('Confirming payment…')}
            </span>
          )}
        </div>
        
        {/* TABS */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-[#514345] pb-4">
          <button onClick={() => setActiveTab('orders')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'orders' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>{t('My Orders')}</button>
          <button onClick={() => setActiveTab('reservations')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'reservations' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>{t('Table Reservations')}</button>
          <button onClick={() => setActiveTab('addresses')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'addresses' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>{t('Delivery Addresses')}</button>
          <button onClick={() => setActiveTab('profile')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'profile' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>{t('Profile Settings')}</button>
        </div>

        {/* TAB: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-10 animate-fade-in">
            {isLoadingOrders ? (
              <div className="py-12 flex justify-center text-[#9e8d8e]">{t('Loading orders...')}</div>
            ) : orders.length === 0 ? (
              <div className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-10 text-center">
                <i className="ph ph-receipt text-4xl text-[#514345] mb-4"></i>
                <h3 className="font-display text-[22px] mb-2">{t('No orders yet')}</h3>
                <p className="text-[#d5c2c3] text-[15.5px] mb-6">{t("Looks like you haven't tasted our buna yet.")}</p>
                <Link href="/#menu" className="h-10 px-6 rounded-full inline-flex items-center bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">{t('Browse Menu')}</Link>
              </div>
            ) : (
              <>
                {/* Active Orders Section */}
                {pendingOrders.length > 0 && (
                  <div>
                    <h3 className="font-display text-[24px] mb-4 flex items-center gap-2"><i className="ph ph-hourglass text-[#f7b5be]"></i> {t('Active Orders')}</h3>
                    <div className="space-y-4">
                      {pendingOrders.map(order => (
                        <div key={order.id} className="bg-[#1c1b1b] border border-[#683941] rounded-[18px] p-5">
                          {/* A payment being confirmed right now is not the same as a payment that was
                              never made. Telling someone "NOT PAID YET" while the
                              gateway is still answering them is what made a real
                              paid order look unpaid. */}
                          {isPaymentSettling(order) ? (
                            <div className="mt-4 rounded-xl border border-blue-500/40 bg-blue-950/40 p-3 text-xs space-y-2">
                              <p className="flex items-start gap-2 text-blue-200 font-semibold">
                                <i className="ph ph-spinner-gap animate-spin text-lg mt-0.5"></i>
                                <span>
                                  {t('Confirming your payment')}
                                </span>
                              </p>
                              <p className="text-[#d5c2c3]">
                                {t('We are checking with the payment provider. This page updates by itself — you do not need to pay again.')}
                              </p>
                            </div>
                          ) : order.status === 'PENDING_PAYMENT' ? (
                            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-xs space-y-2">
                              <p className="flex items-start gap-2 text-red-200 font-semibold">
                                <i className="ph ph-warning-octagon text-lg mt-0.5"></i>
                                <span>
                                  {t('NOT PAID YET — you have not paid for this order, so the kitchen has not received it and no receipt can be issued.')}
                                </span>
                              </p>
                              {isPaymentFailed(order) && order.latest_payment?.failure_reason && (
                                <p className="text-red-300/90">
                                  {t('Last attempt:')} {order.latest_payment.failure_reason}
                                </p>
                              )}
                              <p className="text-[#d5c2c3]">
                                {t('Amount due:')}{' '}
                                <strong className="text-[#f7b5be]">
                                  {Number(order.total_amount_etb).toFixed(2)} {birr}
                                </strong>
                              </p>
                            </div>
                          ) : (
                            <OrderTracker status={order.status} />
                          )}
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#514345] pt-4">
                            <div>
                              <p className="text-[13px] text-[#9e8d8e] uppercase tracking-wider">{order.order_number}</p>
                              <p className="text-[16px] font-semibold mt-0.5">{Number(order.total_amount_etb).toFixed(2)} {birr} • {order.items.length} {t('item', 'ንብሥ')}{order.items.length !== 1 ? (language === 'am' ? 'ዎች' : 's') : ''}</p>
                            </div>
                            <div className="flex gap-2">
                              {order.status === 'PENDING_PAYMENT' && (
                                <button onClick={() => setPayOrder(order)} className="h-9 px-4 rounded-full bg-[#f7b5be] text-[#4e232b] text-[14px] font-bold hover:brightness-110 transition-colors">
                                  {t('Pay')} {Number(order.total_amount_etb).toFixed(2)} {birr}
                                </button>
                              )}
                              {isOrderPaid(order) ? (
                                <button onClick={() => setSelectedReceiptOrder(order)} className="h-9 px-4 rounded-full border border-[#514345] text-[#d5c2c3] text-[14px] hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">{t('View Receipt')}</button>
                              ) : (
                                <span className="h-9 px-4 rounded-full border border-[#514345]/60 text-[#9e8d8e] text-[13px] flex items-center cursor-not-allowed" title={t('Receipts are issued after payment')}>
                                  {t('Receipt after payment')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Past Orders Section */}
                {pastOrders.length > 0 && (
                  <div>
                    <h3 className="font-display text-[24px] mb-4 flex items-center gap-2"><i className="ph ph-clock-counter-clockwise text-[#9e8d8e]"></i> {t('Order History')}</h3>
                    <div className="space-y-4">
                      {pastOrders.map(order => (
                        <div key={order.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#9e8d8e] transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-[16px]">{order.order_number}</span>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                order.status === 'COMPLETED' ? 'bg-green-950 text-green-300 border border-green-900' :
                                order.status === 'CANCELLED' || order.status === 'REJECTED' ? 'bg-red-950 text-red-300 border border-red-900' :
                                'bg-[#3b141c] text-[#f7b5be] border border-[#683941]'
                              }`}>{t(STATUS_LABELS[order.status] || order.status)}</span>
                            </div>
                            <p className="text-[14.5px] text-[#d5c2c3] mb-1">{new Date(order.created_at).toLocaleDateString(locale)} • {order.items.length} {t('items')}</p>
                            {(order.status === 'REJECTED' || order.status === 'CANCELLED') && order.rejection_reason ? (
                              <p className="text-[13px] text-red-300/80 mb-1">{order.rejection_reason}</p>
                            ) : null}
                            <p className="text-[16px] font-bold text-[#e5e2e1]">{Number(order.total_amount_etb).toFixed(2)} {birr}</p>
                          </div>
                          <div>
                            {isOrderPaid(order) ? (
                              <button onClick={() => setSelectedReceiptOrder(order)} className="h-9 px-4 rounded-full border border-[#514345] text-[#d5c2c3] text-[14px] hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors w-full sm:w-auto">{t('View Receipt')}</button>
                            ) : (
                              <span className="h-9 px-4 rounded-full border border-[#514345]/60 text-[#9e8d8e] text-[13px] flex items-center cursor-not-allowed w-full sm:w-auto justify-center" title={t('Receipts are issued after payment')}>
                                {t('Receipt after payment')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB: RESERVATIONS */}
        {activeTab === 'reservations' && (
          <div className="space-y-10 animate-fade-in">
            {isLoadingReservations ? (
              <div className="py-12 flex justify-center text-[#9e8d8e]">{t('Loading reservations...')}</div>
            ) : reservations.length === 0 ? (
              <div className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-10 text-center">
                <i className="ph ph-calendar text-4xl text-[#514345] mb-4"></i>
                <h3 className="font-display text-[22px] mb-2">{t('No reservations yet')}</h3>
                <p className="text-[#d5c2c3] text-[15.5px] mb-6">{t("You haven't booked any tables with us.")}</p>
                <Link href="/#book" className="h-10 px-6 rounded-full inline-flex items-center bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">{t('Book a Table')}</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {reservations.map(res => (
                  <div key={res.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-wrap gap-4 items-center justify-between">
                    <div>
                      <p className="text-[14px] text-[#9e8d8e] mb-1">{t('Reservation for')} {res.name}</p>
                      <p className="text-[16px] font-semibold">{new Date(res.date_time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      <p className="text-[14px] text-[#d5c2c3] mt-1">{res.party_size} {t('People')} • {res.contact_phone}</p>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-[12px] font-semibold tracking-wide uppercase ${
                        res.status === 'CONFIRMED' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' :
                        res.status === 'CANCELLED' ? 'bg-red-950 text-red-300 border border-red-900' :
                        'bg-yellow-950 text-yellow-300 border border-yellow-900'
                      }`}>
                        {t(res.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: ADDRESSES */}
        {activeTab === 'addresses' && (
          <div className="space-y-8 animate-fade-in">
            <div className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-6">
              <h3 className="font-display text-[24px] mb-5">{t('Add New Address')}</h3>
              {addrMsg && <div className={`mb-4 p-3 rounded-[12px] text-[14px] ${addrMsg.includes('success') ? 'bg-[#3b141c] text-[#f7b5be]' : 'bg-red-950 text-red-200'}`}>{addrMsg}</div>}
              <form onSubmit={handleAddAddress} className="space-y-4">
                <div>
                  <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('Street Address')}</label>
                  <input type="text" required value={streetAddress} onChange={e => setStreetAddress(e.target.value)} className="w-full h-11 bg-surface border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" placeholder="Bole Road, House 123" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('City')}</label>
                    <input type="text" value="Addis Ababa" disabled className="w-full h-11 bg-surface border border-[#514345] rounded-[12px] px-4 text-[#9e8d8e] cursor-not-allowed opacity-70" />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('Subcity / Zone')}</label>
                    <input type="text" value={subcityOrZone} onChange={e => setSubcityOrZone(e.target.value)} className="w-full h-11 bg-surface border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" placeholder="Bole, Arada, etc." />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-2 w-max">
                  <input type="checkbox" checked={isDefaultAddr} onChange={e => setIsDefaultAddr(e.target.checked)} className="rounded border-[#514345] bg-surface text-[#f7b5be] focus:ring-[#f7b5be]" />
                  <span className="text-[14.5px] text-[#d5c2c3]">{t('Set as default delivery address')}</span>
                </label>
                <button type="submit" className="mt-4 h-11 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">{t('Save Address')}</button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="font-display text-[24px] mb-4">{t('Saved Addresses')}</h3>
              {addresses.length === 0 ? (
                <p className="text-[#9e8d8e] text-[15px]">{t('No saved addresses yet.')}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map(addr => (
                    <div key={addr.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 relative group">
                      {addr.is_default && (
                        <span className="absolute top-4 right-4 text-[10px] uppercase font-bold tracking-wider bg-[#3b141c] text-[#f7b5be] px-2 py-0.5 rounded">{t('Default')}</span>
                      )}
                      <div className="flex items-start gap-3 mt-1">
                        <i className="ph ph-map-pin text-[20px] text-[#9e8d8e] mt-0.5"></i>
                        <div>
                          <p className="text-[#e5e2e1] font-semibold text-[15.5px] mb-1">{addr.street_address}</p>
                          <p className="text-[#d5c2c3] text-[14px]">{addr.subcity_or_zone ? `${addr.subcity_or_zone}, ` : ''}{addr.city}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: PROFILE */}
        {activeTab === 'profile' && (
          <div className="animate-fade-in max-w-2xl">
            <div className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-6">
              <h3 className="font-display text-[24px] mb-5">{t('Personal Details')}</h3>
              {profileMsg && <div className={`mb-4 p-3 rounded-[12px] text-[14px] ${profileMsg.includes('success') ? 'bg-[#3b141c] text-[#f7b5be]' : 'bg-red-950 text-red-200'}`}>{profileMsg}</div>}
              
              <div className="mb-6">
                <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('Username / Email')}</label>
                <div className="h-11 bg-surface border border-[#514345] rounded-[12px] px-4 flex items-center text-[#9e8d8e] opacity-70">
                  {user.email || user.username}
                </div>
                <p className="text-[#514345] text-xs mt-1">{t('Username/email cannot be changed here.')}</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('First Name')}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full h-11 bg-surface border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('Last Name')}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full h-11 bg-surface border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">{t('Phone Number')}</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full h-11 bg-surface border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" placeholder="+251 911 234567" />
                </div>
                <button type="submit" className="mt-4 h-11 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">{t('Update Profile')}</button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* RECEIPT MODAL */}
      {selectedReceiptOrder && (
        <ReceiptModal
          onClose={() => setSelectedReceiptOrder(null)}
          order={selectedReceiptOrder as any}
        />
      )}

      {/* RETRY PAYMENT MODAL FOR UNPAID ORDERS */}
      {payOrder && (
        <PaymentModal
          isOpen={!!payOrder}
          onClose={() => setPayOrder(null)}
          orderId={payOrder.id}
          orderNumber={payOrder.order_number}
          totalAmountEtb={payOrder.total_amount_etb}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}

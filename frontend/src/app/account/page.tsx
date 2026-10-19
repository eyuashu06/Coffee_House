'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import OrderTracker from '../../components/OrderTracker';
import ReceiptModal from '../../components/ReceiptModal';
import PaymentModal from '../../components/PaymentModal';
import Link from 'next/link';
import ThemeToggle from '../../components/ThemeToggle';
import LanguageToggle from '../../components/LanguageToggle';
import NotificationsDropdown from '../../components/NotificationsDropdown';
import ProfileDropdown from '../../components/ProfileDropdown';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/api';
import EthiopianPhoneInput from '../../components/EthiopianPhoneInput';
import { formatEthiopianTime } from '../../utils/ethiopianTime';

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
  /** How long the kitchen said this would take, shown as a countdown. */
  estimated_prep_minutes?: number | null;
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
// EXPIRED belongs here rather than with the active orders: the order is closed, but
// unlike a cancellation nobody chose it, so it must not sit in the live list waiting
// for a kitchen that is never going to receive it.
const PAST_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

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
  EXPIRED: 'Expired — never paid',
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
  order_code: string;
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
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [reorderingId, setReorderingId] = useState<number | null>(null);
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  const initialFetchDone = useRef<string | null>(null);
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
        ordersRef.current = list;
        setOrders(list);
      }
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      if (!silent) setIsLoadingOrders(false);
    }
  }, [reportUnauthorized]);

  const handleReorder = async (orderId: number) => {
    setReorderingId(orderId);
    try {
      const res = await apiFetch(`/api/v1/orders/${orderId}/reorder/`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({
          type: 'success',
          message: t('Order recreated successfully! Pay now to complete your order.'),
        });
        await fetchOrders(true);
        if (data && data.status === 'PENDING_PAYMENT') {
          setPayOrder(data);
        }
      } else {
        setBanner({
          type: 'error',
          message: data.error || t('Failed to reorder. Please try again.'),
        });
      }
    } catch (err) {
      setBanner({
        type: 'error',
        message: t('Failed to reorder. Please check your network connection.'),
      });
    } finally {
      setReorderingId(null);
    }
  };

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
  }, [t]);

  /**
   * Ask the gateway about every unsettled payment on this account.
   *
   * Re-checking all of them, not just the first, matters: a customer who paid
   * for one order and abandoned an attempt on another would otherwise keep seeing
   * the abandoned one as the only thing being confirmed.
   */
  const reconcileUnsettled = useCallback(async (): Promise<number> => {
    const unsettled = ordersRef.current
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
  }, [verifyPaymentOnce, announcePaymentResult]);

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
    // `t` is included so a gateway response arriving after a language switch reports
    // in the language now on screen, not the one in force when the poll started.
  }, [fetchOrders, announcePaymentResult, reconcileUnsettled, t]);

  // Support direct navigation to a tab and highlight specific order/reservation
  const syncAccountFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const highlight = params.get('highlight') || params.get('order') || params.get('reservation');
    if (tab === 'orders' || tab === 'reservations' || tab === 'addresses' || tab === 'profile') {
      setActiveTab(tab);
    } else if (highlight) {
      if (highlight.toUpperCase().startsWith('RES-')) {
        setActiveTab('reservations');
      } else {
        setActiveTab('orders');
      }
    }
    if (highlight) {
      setHighlightCode(highlight);
      setTimeout(() => {
        const el = document.getElementById(`item-${highlight}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);
    }
  }, []);

  useEffect(() => {
    syncAccountFromUrl();
    window.addEventListener('popstate', syncAccountFromUrl);
    window.addEventListener('notification-navigate', syncAccountFromUrl);
    return () => {
      window.removeEventListener('popstate', syncAccountFromUrl);
      window.removeEventListener('notification-navigate', syncAccountFromUrl);
    };
  }, [syncAccountFromUrl]);

  // Safety net: any order whose payment is still settling gets re-checked too, so a
  // customer who closed the Chapa tab still sees the confirmation when they come back.
  // This also runs on mount, so a paid order is recognised even without the gateway
  // ever reaching the webhook.
  const userKey = user?.id || user?.username;
  useEffect(() => {
    if (!userKey) return;
    const interval = setInterval(reconcileUnsettled, 8000);
    reconcileUnsettled();
    return () => clearInterval(interval);
  }, [userKey, reconcileUnsettled]);

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
  }, [reportUnauthorized]);

  // Initial data load: runs once when user is authenticated, not on every order update
  useEffect(() => {
    if (!userKey) return;
    if (initialFetchDone.current === String(userKey)) return;
    initialFetchDone.current = String(userKey);

    setFirstName(user?.first_name || '');
    setLastName(user?.last_name || '');
    setPhone(user?.phone || '');
    fetchOrders();
    fetchAddresses();
    fetchReservations();
    verifyPendingPayment();
  }, [userKey, user?.first_name, user?.last_name, user?.phone, fetchOrders, fetchAddresses, fetchReservations, verifyPendingPayment]);

  const handleTabChange = (tab: 'orders' | 'reservations' | 'addresses' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'orders') {
      fetchOrders(ordersRef.current.length > 0);
    } else if (tab === 'reservations') {
      fetchReservations();
    } else if (tab === 'addresses') {
      fetchAddresses();
    }
  };

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
      <div className="min-h-screen bg-surface text-[var(--text)] flex flex-col items-center justify-center gap-4 px-6 text-center font-body">
        <span className="material-symbols-outlined text-5xl text-amber-400">lock_clock</span>
        <h2 className="font-display text-[26px] font-bold">{t('Session expired')}</h2>
        <p className="text-[var(--muted)] text-[15px] max-w-md">
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
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center font-body">
        <span className="material-symbols-outlined text-5xl text-[var(--accent)] mb-4">lock</span>
        <h2 className="font-display text-[26px] font-bold">{t('Sign In Required')}</h2>
        <p className="text-[var(--muted)] mt-2 mb-6 text-[15px]">{t('Please sign in to view your orders and manage your profile.')}</p>
        <Link href="/?welcome=1" className="h-10 px-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold flex items-center hover:brightness-110 transition-colors">
          {t('Return to Home')}
        </Link>
      </div>
    );
  }

  const pendingOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
  const pastOrders = orders.filter(o => PAST_STATUSES.includes(o.status));

  return (
    <div className="bg-[var(--bg)] text-[var(--text)] font-body min-h-screen pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[var(--bg-deep)] border-b border-[var(--border)]/60">
        <div className="flex items-center justify-between px-3.5 sm:px-6 h-14">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link href="/?welcome=1" className="flex items-center gap-2 group text-[var(--muted)] hover:text-[var(--accent)] transition-colors shrink-0" aria-label="Back to Home">
              <i className="ph ph-arrow-left text-[20px]"></i>
            </Link>
            <Link href="/?welcome=1" className="flex items-center gap-2.5 group min-w-0">
              <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] text-[16px] group-hover:scale-105 transition-transform shrink-0"><i className="ph ph-coffee-bean"></i></span>
              <span className="font-display text-[19px] sm:text-[21px] tracking-wide truncate">Buna Hub</span>
            </Link>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <LanguageToggle className="hidden sm:flex h-9 px-2 sm:px-3 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13px] sm:text-[13.5px] items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0" />
            <ThemeToggle className="hidden sm:flex h-9 w-9 shrink-0" />
            <Link href="/?welcome=1" className="h-9 px-3.5 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] hidden sm:flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0" aria-label="Back to Home">
              <i className="ph ph-storefront text-[16px]"></i>
              <span>{t('Store')}</span>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <NotificationsDropdown />
              <ProfileDropdown />
            </div>
          </div>
        </div>
      </header>

      {/* BANNER */}
      {banner && (
        <div className={`mx-4 mt-6 p-4 rounded-[14px] flex items-start gap-3 border ${
          banner.type === 'success' ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]' :
          banner.type === 'error' ? 'dark:bg-red-950 dark:border-red-900 dark:text-red-200 bg-red-100 border-red-300 text-red-800' :
          'bg-surface-2 border-[var(--border)] text-[var(--text)]'
        }`}>
          <i className={`ph ${banner.type === 'success' ? 'ph-check-circle' : banner.type === 'error' ? 'ph-warning-circle' : 'ph-info'} text-xl mt-0.5`}></i>
          <span className="text-[15px]">{banner.message}</span>
          <button onClick={() => setBanner(null)} className="ml-auto hover:opacity-70"><i className="ph ph-x"></i></button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto px-3.5 sm:px-4 mt-6 sm:mt-8">
        <div className="flex items-center justify-between gap-4 mb-6 sm:mb-8">
          <h1 className="font-display text-[28px] sm:text-[34px] md:text-[40px] leading-tight">{t('Your Account')}</h1>
          {isConfirmingPayment && (
            <span className="flex items-center gap-2 text-[13px] text-blue-200 bg-blue-950/50 border border-blue-500/30 rounded-full px-3 py-1.5 shrink-0">
              <i className="ph ph-spinner-gap animate-spin"></i>
              {t('Confirming payment…')}
            </span>
          )}
        </div>
        
        {/* TABS (Horizontal Swipeable Rail on Mobile) */}
        <div className="flex gap-2 mb-6 sm:mb-8 border-b border-[var(--border)] pb-3 overflow-x-auto no-scrollbar scroll-smooth">
          <button onClick={() => handleTabChange('orders')} className={`h-9.5 px-4 sm:px-5 rounded-full text-[14px] sm:text-[15.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'orders' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('My Orders')}</button>
          <button onClick={() => handleTabChange('reservations')} className={`h-9.5 px-4 sm:px-5 rounded-full text-[14px] sm:text-[15.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'reservations' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('Table Reservations')}</button>
          <button onClick={() => handleTabChange('addresses')} className={`h-9.5 px-4 sm:px-5 rounded-full text-[14px] sm:text-[15.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'addresses' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('Delivery Addresses')}</button>
          <button onClick={() => handleTabChange('profile')} className={`h-9.5 px-4 sm:px-5 rounded-full text-[14px] sm:text-[15.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'profile' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('Profile Settings')}</button>
        </div>

        {/* TAB: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-10 animate-fade-in">
            {isLoadingOrders ? (
              <div className="py-12 flex justify-center text-[var(--muted)]">{t('Loading orders...')}</div>
            ) : orders.length === 0 ? (
              <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-10 text-center">
                <i className="ph ph-receipt text-4xl text-[var(--muted)] mb-4"></i>
                <h3 className="font-display text-[22px] mb-2">{t('No orders yet')}</h3>
                <p className="text-[var(--muted)] text-[15.5px] mb-6">{t("Looks like you haven't tasted our buna yet.")}</p>
                <Link href="/#menu" className="h-10 px-6 rounded-full inline-flex items-center bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold hover:brightness-110 transition-colors">{t('Browse Menu')}</Link>
              </div>
            ) : (
              <>
                {/* Active Orders Section */}
                {pendingOrders.length > 0 && (
                  <div>
                    <h3 className="font-display text-[24px] mb-4 flex items-center gap-2"><i className="ph ph-hourglass text-[var(--accent)]"></i> {t('Active Orders')}</h3>
                    <div className="space-y-4">
                      {pendingOrders.map(order => (
                        <div
                          key={order.id}
                          id={`item-${order.order_number}`}
                          className={`bg-surface-2 rounded-[18px] p-5 transition-all duration-500 ${
                            highlightCode === order.order_number
                              ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl'
                              : 'border border-[var(--accent)]'
                          }`}
                        >
                          {/* A payment being confirmed right now is not the same as a payment that was
                              never made. Telling someone "NOT PAID YET" while the
                              gateway is still answering them is what made a real
                              paid order look unpaid. */}
                          {isPaymentSettling(order) ? (
                            <div className="mt-4 rounded-xl border border-blue-500/40 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 p-3 text-xs space-y-2">
                              <p className="flex items-start gap-2 text-blue-800 dark:text-blue-200 font-semibold">
                                <i className="ph ph-spinner-gap animate-spin text-lg mt-0.5"></i>
                                <span>
                                  {t('Confirming your payment')}
                                </span>
                              </p>
                              <p className="text-[var(--muted)]">
                                {t('We are checking with the payment provider. This page updates by itself — you do not need to pay again.')}
                              </p>
                            </div>
                          ) : order.status === 'PENDING_PAYMENT' ? (
                            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200 p-3 text-xs space-y-2">
                              <p className="flex items-start gap-2 text-red-800 dark:text-red-200 font-semibold">
                                <i className="ph ph-warning-octagon text-lg mt-0.5"></i>
                                <span>
                                  {t('NOT PAID YET — you have not paid for this order, so the kitchen has not received it and no receipt can be issued.')}
                                </span>
                              </p>
                              {isPaymentFailed(order) && order.latest_payment?.failure_reason && (
                                <p className="text-red-700 dark:text-red-300/90">
                                  {t('Last attempt:')} {order.latest_payment.failure_reason}
                                </p>
                              )}
                              <p className="text-[var(--muted)]">
                                {t('Amount due:')}{' '}
                                <strong className="text-[var(--accent)]">
                                  {Number(order.total_amount_etb).toFixed(2)} {birr}
                                </strong>
                              </p>
                            </div>
                          ) : (
                            <OrderTracker
                              status={order.status}
                              orderType={order.order_type}
                              estimatedPrepMinutes={order.estimated_prep_minutes}
                              placedAt={order.placed_at || order.created_at}
                            />
                          )}
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
                            <div>
                              <p className="text-[13px] text-[var(--muted)] uppercase tracking-wider">{order.order_number}</p>
                              <p className="text-[16px] font-semibold mt-0.5">{Number(order.total_amount_etb).toFixed(2)} {birr} • {order.items.length} {order.items.length === 1 ? t('item', 'item') : t('items', 'items')}</p>
                            </div>
                            <div className="flex gap-2">
                              {order.status === 'PENDING_PAYMENT' && (
                                <button onClick={() => setPayOrder(order)} className="h-9 px-4 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[14px] font-bold hover:brightness-110 transition-colors">
                                  {t('Pay')} {Number(order.total_amount_etb).toFixed(2)} {birr}
                                </button>
                              )}
                              {isOrderPaid(order) ? (
                                <button onClick={() => setSelectedReceiptOrder(order)} className="h-9 px-4 rounded-full border border-[var(--border)] text-[var(--muted)] text-[14px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">{t('View Receipt')}</button>
                              ) : (
                                <span className="h-9 px-4 rounded-full border border-[var(--border)]/60 text-[var(--muted)] text-[13px] flex items-center cursor-not-allowed" title={t('Receipts are issued after payment')}>
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
                    <h3 className="font-display text-[24px] mb-4 flex items-center gap-2"><i className="ph ph-clock-counter-clockwise text-[var(--muted)]"></i> {t('Order History')}</h3>
                    <div className="space-y-4">
                      {pastOrders.map(order => (
                        <div
                          key={order.id}
                          id={`item-${order.order_number}`}
                          className={`bg-surface-2 rounded-[18px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-500 ${
                            highlightCode === order.order_number
                              ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl'
                              : 'border border-[var(--border)] hover:border-[#9e8d8e]'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-[16px]">{order.order_number}</span>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                order.status === 'COMPLETED' ? 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-900' :
                                order.status === 'CANCELLED' || order.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-900' :
                                'bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900'
                              }`}>{t(STATUS_LABELS[order.status] || order.status)}</span>
                            </div>
                            <p className="text-[14.5px] text-[var(--muted)] mb-1">
                              {new Date(order.created_at).toLocaleString(locale, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })} • {order.items.length} {t('items')}
                            </p>
                            {order.status === 'EXPIRED' ? (
                              <p className="text-[13px] text-amber-700 dark:text-yellow-300/90 mb-1">
                                {t('This order expired before we received payment. Place it again below and we will make it fresh.')}
                              </p>
                            ) : (order.status === 'REJECTED' || order.status === 'CANCELLED') && order.rejection_reason ? (
                              <p className="text-[13px] text-red-700 dark:text-red-300/80 mb-1">{order.rejection_reason}</p>
                            ) : null}
                            <p className="text-[16px] font-bold text-[var(--text)]">{Number(order.total_amount_etb).toFixed(2)} {birr}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => handleReorder(order.id)}
                              disabled={reorderingId === order.id}
                              className="h-9 px-4 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[14px] font-bold hover:brightness-110 transition-colors flex items-center gap-1.5 disabled:opacity-50 w-full sm:w-auto justify-center"
                            >
                              {reorderingId === order.id ? (
                                <>
                                  <i className="ph ph-spinner-gap animate-spin"></i>
                                  {t('Reordering…')}
                                </>
                              ) : (
                                <>
                                  <i className="ph ph-arrows-counter-clockwise"></i>
                                  {t('Reorder')}
                                </>
                              )}
                            </button>
                            {isOrderPaid(order) ? (
                              <button onClick={() => setSelectedReceiptOrder(order)} className="h-9 px-4 rounded-full border border-[var(--border)] text-[var(--muted)] text-[14px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full sm:w-auto">{t('View Receipt')}</button>
                            ) : (
                              <span className="h-9 px-4 rounded-full border border-[var(--border)]/60 text-[var(--muted)] text-[13px] flex items-center cursor-not-allowed w-full sm:w-auto justify-center" title={t('Receipts are issued after payment')}>
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
              <div className="py-12 flex justify-center text-[var(--muted)]">{t('Loading reservations...')}</div>
            ) : reservations.length === 0 ? (
              <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-10 text-center">
                <i className="ph ph-calendar text-4xl text-[var(--muted)] mb-4"></i>
                <h3 className="font-display text-[22px] mb-2">{t('No reservations yet')}</h3>
                <p className="text-[var(--muted)] text-[15.5px] mb-6">{t("You haven't booked any tables with us.")}</p>
                <Link href="/#book" className="h-10 px-6 rounded-full inline-flex items-center bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold hover:brightness-110 transition-colors">{t('Book a Table')}</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {reservations.map(res => (
                  <div
                    key={res.id}
                    id={`item-${res.order_code || res.id}`}
                    className={`bg-surface-2 rounded-[18px] p-5 flex flex-wrap gap-4 items-center justify-between transition-all duration-500 ${
                      highlightCode && (highlightCode === res.order_code || highlightCode === String(res.id))
                        ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl'
                        : 'border border-[var(--border)]'
                    }`}
                  >
                    <div>
                      <p className="text-[12px] font-mono text-[var(--muted)] mb-1 tracking-wide">{res.order_code || `#${res.id}`}</p>
                      <p className="text-[14px] text-[var(--muted)] mb-1">{t('Reservation for')} {res.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-[16px] font-semibold">{new Date(res.date_time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        <span className="text-[12px] px-2.5 py-0.5 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] font-medium">
                          🇪🇹 {formatEthiopianTime(res.date_time, language)}
                        </span>
                      </div>
                      <p className="text-[14px] text-[var(--muted)] mt-1">{res.party_size} {t('People')}{res.contact_phone ? ` • ${res.contact_phone}` : ''}</p>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-[12px] font-semibold tracking-wide uppercase ${
                        res.status === 'CONFIRMED' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]' :
                        res.status === 'CANCELLED' ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-900' :
                        res.status === 'PENDING' ? 'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900' :
                        'bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900'
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
            <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-6">
              <h3 className="font-display text-[24px] mb-5">{t('Add New Address')}</h3>
              {addrMsg && <div className={`mb-4 p-3 rounded-[12px] text-[14px] ${addrMsg.includes('success') ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{addrMsg}</div>}
              <form onSubmit={handleAddAddress} className="space-y-4">
                <div>
                  <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('Street Address')}</label>
                  <input type="text" required value={streetAddress} onChange={e => setStreetAddress(e.target.value)} className="w-full h-11 bg-surface border border-[var(--border)] rounded-[12px] px-4 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" placeholder="Bole Road, House 123" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('City')}</label>
                    <input type="text" value="Addis Ababa" disabled className="w-full h-11 bg-surface border border-[var(--border)] rounded-[12px] px-4 text-[var(--muted)] cursor-not-allowed opacity-70" />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('Subcity / Zone')}</label>
                    <input type="text" value={subcityOrZone} onChange={e => setSubcityOrZone(e.target.value)} className="w-full h-11 bg-surface border border-[var(--border)] rounded-[12px] px-4 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" placeholder="Bole, Arada, etc." />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-2 w-max">
                  <input type="checkbox" checked={isDefaultAddr} onChange={e => setIsDefaultAddr(e.target.checked)} className="rounded border-[var(--border)] bg-surface text-[var(--accent)] focus:ring-[var(--accent)]" />
                  <span className="text-[14.5px] text-[var(--muted)]">{t('Set as default delivery address')}</span>
                </label>
                <button type="submit" className="mt-4 h-11 px-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold hover:brightness-110 transition-colors">{t('Save Address')}</button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="font-display text-[24px] mb-4">{t('Saved Addresses')}</h3>
              {addresses.length === 0 ? (
                <p className="text-[var(--muted)] text-[15px]">{t('No saved addresses yet.')}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map(addr => (
                    <div key={addr.id} className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-5 relative group">
                      {addr.is_default && (
                        <span className="absolute top-4 right-4 text-[10px] uppercase font-bold tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 rounded">{t('Default')}</span>
                      )}
                      <div className="flex items-start gap-3 mt-1">
                        <i className="ph ph-map-pin text-[20px] text-[var(--muted)] mt-0.5"></i>
                        <div>
                          <p className="text-[var(--text)] font-semibold text-[15.5px] mb-1">{addr.street_address}</p>
                          <p className="text-[var(--muted)] text-[14px]">{addr.subcity_or_zone ? `${addr.subcity_or_zone}, ` : ''}{addr.city}</p>
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
            <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-6">
              <h3 className="font-display text-[24px] mb-5">{t('Personal Details')}</h3>
              {profileMsg && <div className={`mb-4 p-3 rounded-[12px] text-[14px] ${profileMsg.includes('success') ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{profileMsg}</div>}
              
              <div className="mb-6">
                <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('Username / Email')}</label>
                <div className="h-11 bg-surface border border-[var(--border)] rounded-[12px] px-4 flex items-center text-[var(--muted)] opacity-70">
                  {user.email || user.username}
                </div>
                <p className="text-[var(--muted)] text-xs mt-1">{t('Username/email cannot be changed here.')}</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('First Name')}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full h-11 bg-surface border border-[var(--border)] rounded-[12px] px-4 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('Last Name')}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full h-11 bg-surface border border-[var(--border)] rounded-[12px] px-4 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] text-[var(--muted)] uppercase tracking-wider mb-2">{t('Phone Number')}</label>
                  <EthiopianPhoneInput
                    value={phone}
                    onChange={val => setPhone(val)}
                    className="h-11"
                  />
                </div>
                <button type="submit" className="mt-4 h-11 px-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold hover:brightness-110 transition-colors">{t('Update Profile')}</button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* RECEIPT MODAL */}
      {selectedReceiptOrder && (
        <ReceiptModal
          onClose={() => setSelectedReceiptOrder(null)}
          order={selectedReceiptOrder}
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

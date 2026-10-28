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
import AuthModal from '../../components/AuthModal';
import { formatEthiopianTime } from '../../utils/ethiopianTime';
import { TextSize, getSavedTextSize, applyTextSize } from '../../utils/textSize';

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
    transaction_reference?: string;
    phone_number?: string;
    approved_by?: string;
    approved_at?: string;
    approval_notes?: string;
    failure_reason?: string;
    checkout_url?: string;
    created_at: string;
    verified_at?: string | null;
    gateway_status?: string;
    bank_verification?: any;
    receipt_url?: string | null;
    receipt_data?: string | null;
    receipt_type?: string | null;
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

const STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-800 border',
  PLACED: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]',
  ACCEPTED: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/50 dark:text-cyan-300 dark:border-cyan-800 border',
  PREPARING: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800 border',
  READY: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800 border',
  OUT_FOR_DELIVERY: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-800 border',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 border',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-900 border',
  REJECTED: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-900 border',
  EXPIRED: 'bg-stone-200 text-stone-800 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700 border',
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
  const [guestPayment, setGuestPayment] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Display Text Size State
  const [currentTextSize, setCurrentTextSize] = useState<TextSize>('normal');

  useEffect(() => {
    setCurrentTextSize(getSavedTextSize());
    const handleSizeChange = (e: any) => {
      if (e.detail?.size) setCurrentTextSize(e.detail.size);
    };
    window.addEventListener('text-size-change', handleSizeChange);
    return () => window.removeEventListener('text-size-change', handleSizeChange);
  }, []);

  const handleSelectTextSize = (sz: TextSize) => {
    setCurrentTextSize(sz);
    applyTextSize(sz);
  };

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
      .filter(o => {
        const method = o.latest_payment?.payment_method;
        if (method === 'cash') return false;
        if (['telebirr', 'cbebirr', 'awashbirr', 'ebirr', 'mpesa'].includes(method || '')) return false;
        return Boolean(o.latest_payment?.checkout_url) || method === 'card';
      })
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
          setGuestPayment(payment);
          fetchOrders(true);

          if (payment?.status && payment.status !== 'PENDING') {
            settledPaymentsRef.current.add(txRef);
            announcePaymentResult(payment);
            setIsConfirmingPayment(false);
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

  // Immediately verify payment if tx_ref is in URL (handles both guests and logged-in users returning from Chapa)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref') || params.get('trx_ref');
    if (txRef) {
      verifyPendingPayment();
    }
  }, [verifyPendingPayment]);

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
        setAddrMsg(errorData.detail || errorData.error || t('Failed to add address. Please check the fields and try again.'));
      }
    } catch (err) {
      setAddrMsg(t('Failed to add address due to a network error.'));
    }
  };

  const handleSetDefaultAddress = async (addrId: number) => {
    setAddrMsg(null);
    try {
      const res = await apiFetch(`/api/v1/addresses/${addrId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (res.ok) {
        setAddrMsg(t('Address set as default.'));
        fetchAddresses();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAddrMsg(errorData.detail || errorData.error || t('Failed to update address.'));
      }
    } catch {
      setAddrMsg(t('Network error. Failed to update address.'));
    }
  };

  const handleDeleteAddress = async (addrId: number) => {
    setAddrMsg(null);
    try {
      const res = await apiFetch(`/api/v1/addresses/${addrId}/`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAddrMsg(t('Address deleted successfully.'));
        fetchAddresses();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAddrMsg(errorData.detail || errorData.error || t('Failed to delete address.'));
      }
    } catch {
      setAddrMsg(t('Network error. Failed to delete address.'));
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

  const isGuestPaymentReturn = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).has('tx_ref') ||
    new URLSearchParams(window.location.search).has('trx_ref') ||
    new URLSearchParams(window.location.search).has('order')
  );

  useEffect(() => {
    if (!loading && !user && !sessionExpired && !isGuestPaymentReturn) {
      window.location.href = '/?welcome=1';
    }
  }, [loading, user, sessionExpired, isGuestPaymentReturn]);

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

  // Guest customer returning from Chapa online payment: show confirmation and offer account creation
  if (!user && isGuestPaymentReturn) {
    const isPaid = guestPayment?.status === 'SUCCESS';
    const isFailed = guestPayment?.status === 'FAILED' || guestPayment?.status === 'ABANDONED';
    const orderNum = guestPayment?.order_number || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('order') || '' : '');

    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-4 sm:p-6 font-body">
        <div className="w-full max-w-md bg-surface-2 border border-[var(--border)] rounded-2xl shadow-2xl p-6 text-center space-y-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
            isPaid
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : isFailed
              ? 'bg-red-500/20 text-red-400 border-red-500/40'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
          }`}>
            <span className="material-symbols-outlined text-3xl">
              {isPaid ? 'check_circle' : isFailed ? 'error' : 'hourglass_top'}
            </span>
          </div>

          <h3 className="font-display text-2xl font-bold">
            {isPaid ? t('Payment Confirmed!') : isFailed ? t('Payment Failed') : t('Confirming Payment...')}
          </h3>

          <p className="text-sm text-[var(--muted)] leading-relaxed">
            {isPaid
              ? `${t('Thank you! Your payment for Order')} #${orderNum} ${t('was successful and the kitchen is preparing it.')}`
              : isFailed
              ? `${t('Payment for Order')} #${orderNum} ${t('could not be completed.')} ${guestPayment?.failure_reason || ''}`
              : t('Confirming your payment with the gateway…')}
          </p>

          {isPaid && (
            <div className="p-3.5 rounded-xl bg-surface border border-[var(--accent)]/30 text-left space-y-2 mt-2">
              <div className="flex items-center gap-2 text-[var(--accent)] font-bold text-xs">
                <span className="material-symbols-outlined text-base">bookmark_add</span>
                <span>{t('Save details for next time?')}</span>
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                {t('Create a free account with your phone number to track this order, save your delivery addresses, and never type your details again.')}
              </p>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full py-2 px-3 rounded-lg bg-[var(--accent)] hover:brightness-110 text-[var(--accent-contrast)] font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>{t('Create Free Account')}</span>
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/?welcome=1#menu"
              className="py-2.5 px-6 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-xs uppercase tracking-wider shadow-md hover:brightness-110 text-center"
            >
              {t('Browse Menu')}
            </Link>
            <Link
              href="/?welcome=1"
              className="py-2 px-6 rounded-full border border-[var(--border)] text-[var(--accent)] font-semibold text-xs text-center hover:bg-[var(--accent-soft)] transition-all"
            >
              {t('Back to Home')}
            </Link>
          </div>
        </div>

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode="REGISTER"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pendingOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
  const pastOrders = orders.filter(o => PAST_STATUSES.includes(o.status));

  return (
    <div className="bg-[var(--bg)] text-[var(--text)] font-body min-h-screen pb-28 md:pb-16">
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
            <Link href="/?welcome=1" className="h-9 px-3.5 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] hidden sm:flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0" aria-label="Back to Home">
              <i className="ph ph-storefront text-[16px]"></i>
              <span>{t('Store')}</span>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <ThemeToggle className="flex h-9 w-9 shrink-0 cursor-pointer" />
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
      <main className="max-w-4xl mx-auto px-3.5 sm:px-4 mt-5 sm:mt-8">
        <div className="flex items-center justify-between gap-4 mb-4 sm:mb-6">
          <h1 className="font-display text-[21px] sm:text-[26px] md:text-[30px] font-bold leading-tight">{t('Your Account')}</h1>
          {isConfirmingPayment && (
            <span className="flex items-center gap-1.5 text-[12px] text-blue-200 bg-blue-950/50 border border-blue-500/30 rounded-full px-2.5 py-1 shrink-0">
              <i className="ph ph-spinner-gap animate-spin"></i>
              {t('Confirming payment…')}
            </span>
          )}
        </div>
        
        {/* TABS (Desktop Rail - hidden on mobile where bottom navigation is used) */}
        <div className="hidden md:flex gap-2 mb-6 sm:mb-8 border-b border-[var(--border)] pb-3 overflow-x-auto no-scrollbar scroll-smooth">
          <button onClick={() => handleTabChange('orders')} className={`h-9 px-4 rounded-full text-[13.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'orders' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('My Orders')}</button>
          <button onClick={() => handleTabChange('reservations')} className={`h-9 px-4 rounded-full text-[13.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'reservations' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('Table Reservations')}</button>
          <button onClick={() => handleTabChange('addresses')} className={`h-9 px-4 rounded-full text-[13.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'addresses' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('Delivery Addresses')}</button>
          <button onClick={() => handleTabChange('profile')} className={`h-9 px-4 rounded-full text-[13.5px] whitespace-nowrap transition-colors shrink-0 ${activeTab === 'profile' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)] font-semibold' : 'bg-surface-2 text-[var(--muted)] border border-[var(--border)] hover:border-[var(--accent)]'}`}>{t('Profile Settings')}</button>
        </div>

        {/* TAB: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-6 sm:space-y-8 animate-fade-in">
            {isLoadingOrders ? (
              <div className="py-12 flex justify-center text-[var(--muted)] text-[14px]">{t('Loading orders...')}</div>
            ) : orders.length === 0 ? (
              <div className="bg-surface-2 border border-[var(--border)] rounded-2xl p-6 sm:p-10 text-center">
                <i className="ph ph-receipt text-3xl sm:text-4xl text-[var(--muted)] mb-3"></i>
                <h3 className="font-display text-[18px] sm:text-[20px] font-bold mb-1.5">{t('No orders yet')}</h3>
                <p className="text-[var(--muted)] text-[14px] mb-5">{t("Looks like you haven't tasted our buna yet.")}</p>
                <Link href="/#menu" className="h-9.5 px-5 rounded-xl inline-flex items-center justify-center gap-1.5 bg-[var(--accent)] text-[var(--accent-contrast)] text-[13px] font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-sm">
                  <i className="ph ph-coffee text-[16px]"></i>
                  <span>{t('Browse Menu')}</span>
                </Link>
              </div>
            ) : (
              <>
                {/* Active Orders Section */}
                {pendingOrders.length > 0 && (
                  <div>
                    <h3 className="font-display text-[17px] sm:text-[20px] font-bold mb-3 flex items-center gap-2"><i className="ph ph-hourglass text-[var(--accent)] text-[18px]"></i> {t('Active Orders')}</h3>
                    <div className="space-y-3.5 sm:space-y-4">
                      {pendingOrders.map(order => (
                        <div
                          key={order.id}
                          id={`item-${order.order_number}`}
                          className={`bg-surface-2 rounded-2xl p-3 sm:p-4.5 transition-all duration-500 ${
                            highlightCode === order.order_number
                              ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl'
                              : 'border border-[var(--accent)]'
                          }`}
                        >
                          {/* ORDER CARD HEADER */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 pb-2.5 mb-2.5 border-b border-[var(--border)]/60">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[13px] sm:text-[14.5px] font-bold tracking-tight text-[var(--text)]">
                                  #{order.order_number}
                                </span>
                                <span className="text-[10.5px] sm:text-[11px] px-1.5 py-0.5 rounded-md bg-surface border border-[var(--border)] text-[var(--muted)] font-medium">
                                  {t(order.order_type) || (order.order_type === 'DELIVERY' ? 'Delivery' : order.order_type === 'DINE_IN' ? 'Dine-In / Reserved Table' : 'Store Pickup')} {order.table_number ? `(${t('Table')} ${order.table_number})` : ''}
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] sm:text-[11.5px] text-[var(--muted)] mt-0.5">
                                <i className="ph ph-clock text-[12px]"></i>
                                {new Date(order.created_at).toLocaleString(locale, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider ${STATUS_BADGE[order.status] || 'bg-surface text-[var(--muted)] border border-[var(--border)]'}`}>
                                {t(STATUS_LABELS[order.status] || order.status)}
                              </span>
                            </div>
                          </div>

                          {/* A payment being confirmed right now is not the same as a payment that was
                              never made. Telling someone "NOT PAID YET" while the
                              gateway is still answering them is what made a real
                              paid order look unpaid. */}
                          {isPaymentSettling(order) ? (
                            <div className="mt-3 rounded-xl border border-blue-500/40 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 p-2.5 sm:p-3 text-[11px] sm:text-[11.5px] space-y-1">
                              <p className="flex items-start gap-1.5 text-blue-800 dark:text-blue-200 font-semibold">
                                <i className="ph ph-spinner-gap animate-spin text-[15px] mt-0.5"></i>
                                <span>
                                  {t('Confirming your payment')}
                                </span>
                              </p>
                              <p className="text-[var(--muted)] text-[10.5px] sm:text-[11px]">
                                {t('We are checking with the payment provider. This page updates by itself — you do not need to pay again.')}
                              </p>
                            </div>
                          ) : order.status === 'PENDING_PAYMENT' ? (
                            <div className="mt-3 space-y-2">
                              {order.latest_payment?.payment_method === 'cash' ? (
                                <div className="rounded-xl border border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 p-2.5 sm:p-3 text-[11px] sm:text-[11.5px] space-y-1">
                                  <p className="flex items-start gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-[11.5px] sm:text-[12px]">
                                    <i className="ph ph-hand-coins text-[16px] shrink-0 mt-0.5"></i>
                                    <span>
                                      {t(
                                        'Cash Payment Submitted — Waiting for Staff Approval upon delivery/pickup/table.',
                                        'የጥሬ ገንዘብ ትዕዛዝ ተመዝግቧል — በደረሰዎት ወቅት ወይም በጠረጴዛዎ ላይ ክፍያውን ሲፈጽሙ ይረጋገጣል።'
                                      )}
                                    </span>
                                  </p>
                                  <p className="text-[10.5px] sm:text-[11px] text-[var(--muted)] leading-relaxed">
                                    {order.order_type === 'DELIVERY'
                                      ? t('Please have cash ready when our courier arrives with your delivery.')
                                      : order.order_type === 'DINE_IN'
                                        ? `${t('Pay cash to your server at Table')} ${order.table_number || ''}.`
                                        : t('Pay cash at the counter when picking up your order.')}
                                  </p>
                                  <p className="text-[var(--text)] font-semibold text-[11.5px]">
                                    {t('Amount to pay:')}{' '}
                                    <strong className="text-[var(--accent)] font-mono text-[12.5px]">
                                      {Number(order.total_amount_etb).toFixed(2)} {birr}
                                    </strong>
                                  </p>
                                </div>
                              ) : (order.latest_payment?.transaction_reference || ['telebirr', 'cbebirr', 'awashbirr', 'ebirr', 'mpesa'].includes(order.latest_payment?.payment_method || '')) ? (() => {
                                const isBankVerified = order.latest_payment?.gateway_status === 'verified' || order.latest_payment?.bank_verification?.verified;
                                const bVer = order.latest_payment?.bank_verification;
                                return isBankVerified ? (
                                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 p-2.5 sm:p-3 text-[11px] sm:text-[11.5px] space-y-1">
                                    <p className="flex items-start gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 text-[11.5px] sm:text-[12px]">
                                      <i className="ph ph-shield-check text-[16px] shrink-0 mt-0.5 text-emerald-600"></i>
                                      <span>
                                        {t('Payment Verified at Bank Source')} ({bVer?.provider || 'Bank'})
                                      </span>
                                    </p>
                                    <div className="p-1.5 rounded bg-surface border border-[var(--border)] font-mono text-[10.5px] space-y-0.5">
                                      <div>{t('Method:')} <span className="font-sans font-bold capitalize">{order.latest_payment?.payment_method}</span></div>
                                      <div>{t('Bank Reference:')} <strong className="text-[var(--accent)] select-all">{bVer?.reference || order.latest_payment?.transaction_reference || order.latest_payment?.tx_ref}</strong></div>
                                      <div>{t('Amount:')} <strong>{Number(order.total_amount_etb).toFixed(2)} {birr}</strong> {bVer?.amount_matches && <span className="text-emerald-600 font-sans">✓</span>}</div>
                                      {Boolean(order.latest_payment?.receipt_url || order.latest_payment?.receipt_data) && (
                                        <div className="pt-0.5">
                                          <a
                                            href={order.latest_payment?.receipt_url || order.latest_payment?.receipt_data || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10.5px] text-[var(--accent)] font-semibold underline flex items-center gap-1"
                                          >
                                            <i className={`ph ${order.latest_payment?.receipt_type === 'pdf' ? 'ph-file-pdf' : 'ph-image'}`}></i>
                                            <span>{order.latest_payment?.receipt_type === 'pdf' ? t('View Uploaded PDF Receipt') : t('View Uploaded Receipt Image')}</span>
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10.5px] text-[var(--muted)]">
                                      {t('Your payment was verified directly with the bank. The kitchen will prepare your order shortly.')}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-blue-500/40 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200 p-2.5 sm:p-3 text-[11px] sm:text-[11.5px] space-y-1">
                                    <p className="flex items-start gap-1.5 font-bold text-blue-800 dark:text-blue-300 text-[11.5px] sm:text-[12px]">
                                      <i className="ph ph-receipt text-[16px] shrink-0 mt-0.5"></i>
                                      <span>
                                        {t(
                                          'Transfer Submitted — Manager Verifying Payment',
                                          'የማስተላለፍ መረጃ ተልኳል — አስተዳዳሪው ክፍያዎን እያረጋገጡ ነው'
                                        )}
                                      </span>
                                    </p>
                                    <div className="p-1.5 rounded bg-surface border border-[var(--border)] font-mono text-[10.5px] space-y-0.5">
                                      <div>{t('Method:')} <span className="font-sans font-bold capitalize">{order.latest_payment?.payment_method}</span></div>
                                      <div>{t('Reference:')} <strong className="text-[var(--accent)] select-all">{order.latest_payment?.transaction_reference || order.latest_payment?.tx_ref}</strong></div>
                                      <div>{t('Amount:')} <strong>{Number(order.total_amount_etb).toFixed(2)} {birr}</strong></div>
                                      {Boolean(order.latest_payment?.receipt_url || order.latest_payment?.receipt_data) && (
                                        <div className="pt-0.5">
                                          <a
                                            href={order.latest_payment?.receipt_url || order.latest_payment?.receipt_data || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10.5px] text-[var(--accent)] font-semibold underline flex items-center gap-1"
                                          >
                                            <i className={`ph ${order.latest_payment?.receipt_type === 'pdf' ? 'ph-file-pdf' : 'ph-image'}`}></i>
                                            <span>{order.latest_payment?.receipt_type === 'pdf' ? t('View Uploaded PDF Receipt') : t('View Uploaded Receipt Image')}</span>
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10.5px] text-[var(--muted)]">
                                      {t(
                                        'Once the manager verifies the transfer in the account, the kitchen will immediately begin preparing your order.',
                                        'ክፍያው እንደተረጋገጠ ወጥ ቤቱ ትዕዛዝዎን ማዘጋጀት ይጀምራል።'
                                      )}
                                    </p>
                                  </div>
                                );
                              })() : (
                                <div className="rounded-xl border border-red-500/40 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200 p-2.5 sm:p-3 text-[11px] sm:text-[11.5px] space-y-1">
                                  <p className="flex items-start gap-1.5 text-red-800 dark:text-red-200 font-semibold text-[11.5px] sm:text-[12px]">
                                    <i className="ph ph-warning-octagon text-[16px] mt-0.5"></i>
                                    <span>
                                      {t('NOT PAID YET — choose a payment method below to complete your order so the kitchen can prepare it.')}
                                    </span>
                                  </p>
                                  {isPaymentFailed(order) && order.latest_payment?.failure_reason && (
                                    <p className="text-red-700 dark:text-red-300/90 text-[10.5px]">
                                      {t('Last attempt:')} {order.latest_payment.failure_reason}
                                    </p>
                                  )}
                                  <p className="text-[var(--muted)] text-[11px]">
                                    {t('Amount due:')}{' '}
                                    <strong className="text-[var(--accent)] font-mono text-[12.5px]">
                                      {Number(order.total_amount_etb).toFixed(2)} {birr}
                                    </strong>
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <OrderTracker
                              status={order.status}
                              orderType={order.order_type}
                              estimatedPrepMinutes={order.estimated_prep_minutes}
                              placedAt={order.placed_at || order.created_at}
                            />
                          )}
                          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 border-t border-[var(--border)] pt-3">
                            <div>
                              <p className="text-[13.5px] sm:text-[15px] font-bold text-[var(--text)]">
                                {Number(order.total_amount_etb).toFixed(2)} {birr}
                                <span className="text-[11.5px] font-normal text-[var(--muted)] ml-1.5">
                                  • {order.items.length} {order.items.length === 1 ? t('item', 'item') : t('items', 'items')}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              {order.status === 'PENDING_PAYMENT' && (
                                <button
                                  type="button"
                                  onClick={() => setPayOrder(order)}
                                  className="flex-1 sm:flex-initial h-9 sm:h-9.5 px-3.5 rounded-lg sm:rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-[12px] sm:text-[13px] font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                >
                                  <i className="ph ph-credit-card text-[15px]"></i>
                                  <span>{t('Pay')} {Number(order.total_amount_etb).toFixed(2)} {birr}</span>
                                </button>
                              )}
                              {isOrderPaid(order) ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedReceiptOrder(order)}
                                  className="flex-1 sm:flex-initial h-9 sm:h-9.5 px-3 rounded-lg sm:rounded-xl border border-[var(--border)] bg-surface text-[var(--text)] text-[12px] sm:text-[13px] font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <i className="ph ph-receipt text-[15px]"></i>
                                  <span>{t('View Receipt')}</span>
                                </button>
                              ) : (
                                <span
                                  className="flex-1 sm:flex-initial h-9 sm:h-9.5 px-2.5 rounded-lg sm:rounded-xl border border-[var(--border)]/60 bg-surface/40 text-[var(--muted)] text-[11px] sm:text-[12px] flex items-center justify-center gap-1 cursor-not-allowed select-none"
                                  title={t('Receipts are issued after payment')}
                                >
                                  <i className="ph ph-receipt text-[14px] opacity-60"></i>
                                  <span>{t('Receipt after payment')}</span>
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
                    <h3 className="font-display text-[17px] sm:text-[20px] font-bold mb-3 flex items-center gap-2"><i className="ph ph-clock-counter-clockwise text-[var(--muted)] text-[18px]"></i> {t('Order History')}</h3>
                    <div className="space-y-3.5 sm:space-y-4">
                      {pastOrders.map(order => (
                        <div
                          key={order.id}
                          id={`item-${order.order_number}`}
                          className={`bg-surface-2 rounded-2xl p-3 sm:p-4.5 flex flex-col justify-between gap-2.5 sm:gap-3.5 transition-all duration-500 ${
                            highlightCode === order.order_number
                              ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl'
                              : 'border border-[var(--border)] hover:border-[#9e8d8e]'
                          }`}
                        >
                          {/* ORDER CARD HEADER */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 pb-2.5 border-b border-[var(--border)]/60">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[13px] sm:text-[14.5px] font-bold text-[var(--text)]">
                                  #{order.order_number}
                                </span>
                                <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-surface border border-[var(--border)] text-[var(--muted)] font-medium">
                                  {t(order.order_type) || (order.order_type === 'DELIVERY' ? 'Delivery' : order.order_type === 'DINE_IN' ? 'Dine-In / Reserved Table' : 'Store Pickup')}
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] sm:text-[11.5px] text-[var(--muted)] mt-0.5">
                                <i className="ph ph-clock text-[12px]"></i>
                                {new Date(order.created_at).toLocaleString(locale, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider ${STATUS_BADGE[order.status] || 'bg-surface text-[var(--muted)] border border-[var(--border)]'}`}>
                                {t(STATUS_LABELS[order.status] || order.status)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <p className="text-[12.5px] text-[var(--muted)]">
                              {order.items.length} {order.items.length === 1 ? t('item', 'item') : t('items', 'items')}
                            </p>
                            {order.status === 'EXPIRED' ? (
                              <p className="text-[11.5px] text-amber-700 dark:text-yellow-300/90">
                                {t('This order expired before we received payment. Place it again below and we will make it fresh.')}
                              </p>
                            ) : (order.status === 'REJECTED' || order.status === 'CANCELLED') && order.rejection_reason ? (
                              <p className="text-[11.5px] text-red-700 dark:text-red-300/80">{order.rejection_reason}</p>
                            ) : null}
                            <p className="text-[13.5px] sm:text-[15px] font-bold text-[var(--text)] pt-0.5">{Number(order.total_amount_etb).toFixed(2)} {birr}</p>
                          </div>

                          <div className="flex items-center gap-2 pt-2.5 border-t border-[var(--border)]/40 w-full sm:w-auto sm:self-end">
                            <button
                              type="button"
                              onClick={() => handleReorder(order.id)}
                              disabled={reorderingId === order.id}
                              className="flex-1 sm:flex-initial h-9 sm:h-9.5 px-3.5 rounded-lg sm:rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-[12px] sm:text-[13px] font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm cursor-pointer"
                            >
                              {reorderingId === order.id ? (
                                <>
                                  <i className="ph ph-spinner-gap animate-spin text-[14px]"></i>
                                  <span>{t('Reordering…')}</span>
                                </>
                              ) : (
                                <>
                                  <i className="ph ph-arrows-counter-clockwise text-[14px]"></i>
                                  <span>{t('Reorder')}</span>
                                </>
                              )}
                            </button>
                            {isOrderPaid(order) ? (
                              <button
                                type="button"
                                onClick={() => setSelectedReceiptOrder(order)}
                                className="flex-1 sm:flex-initial h-9 sm:h-9.5 px-3 rounded-lg sm:rounded-xl border border-[var(--border)] bg-surface text-[var(--text)] text-[12px] sm:text-[13px] font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <i className="ph ph-receipt text-[14px]"></i>
                                <span>{t('View Receipt')}</span>
                              </button>
                            ) : (
                              <span
                                className="flex-1 sm:flex-initial h-9 sm:h-9.5 px-2.5 rounded-lg sm:rounded-xl border border-[var(--border)]/60 bg-surface/40 text-[var(--muted)] text-[11px] sm:text-[12px] flex items-center justify-center gap-1 cursor-not-allowed select-none"
                                title={t('Receipts are issued after payment')}
                              >
                                <i className="ph ph-receipt text-[14px] opacity-60"></i>
                                <span>{t('Receipt after payment')}</span>
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
          <div className="space-y-6 sm:space-y-8 animate-fade-in">
            {isLoadingReservations ? (
              <div className="py-12 flex justify-center text-[var(--muted)] text-[14px]">{t('Loading reservations...')}</div>
            ) : reservations.length === 0 ? (
              <div className="bg-surface-2 border border-[var(--border)] rounded-2xl p-6 sm:p-10 text-center">
                <i className="ph ph-calendar text-3xl sm:text-4xl text-[var(--muted)] mb-3"></i>
                <h3 className="font-display text-[18px] sm:text-[20px] font-bold mb-1.5">{t('No reservations yet')}</h3>
                <p className="text-[var(--muted)] text-[13.5px] sm:text-[14px] mb-5">{t("You haven't booked any tables with us.")}</p>
                <Link href="/#book" className="h-9.5 px-5 rounded-xl inline-flex items-center justify-center gap-1.5 bg-[var(--accent)] text-[var(--accent-contrast)] text-[13px] font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-sm">
                  <i className="ph ph-calendar-plus text-[16px]"></i>
                  <span>{t('Book a Table')}</span>
                </Link>
              </div>
            ) : (
              <div>
                <h3 className="font-display text-[17px] sm:text-[20px] font-bold mb-3 flex items-center gap-2">
                  <i className="ph ph-calendar-check text-[var(--accent)] text-[18px]"></i>
                  {t('Table Reservations')}
                </h3>
                <div className="space-y-3 sm:space-y-3.5">
                  {reservations.map(res => (
                    <div
                      key={res.id}
                      id={`item-${res.order_code || res.id}`}
                      className={`bg-surface-2 rounded-2xl p-3 sm:p-4 flex flex-wrap gap-3 items-center justify-between transition-all duration-500 ${
                        highlightCode && (highlightCode === res.order_code || highlightCode === String(res.id))
                          ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl'
                          : 'border border-[var(--border)]'
                      }`}
                    >
                      <div>
                        <p className="text-[11.5px] sm:text-[12px] font-mono text-[var(--muted)] mb-0.5 tracking-wide">{res.order_code || `#${res.id}`}</p>
                        <p className="text-[13px] sm:text-[13.5px] text-[var(--muted)] mb-1">{t('Reservation for')} <span className="font-semibold text-[var(--text)]">{res.name}</span></p>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="text-[13.5px] sm:text-[14.5px] font-semibold">{new Date(res.date_time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] font-medium">
                            🇪🇹 {formatEthiopianTime(res.date_time, language)}
                          </span>
                        </div>
                        <p className="text-[12px] sm:text-[12.5px] text-[var(--muted)]">{res.party_size} {t('People')}{res.contact_phone ? ` • ${res.contact_phone}` : ''}</p>
                      </div>
                      <div>
                        <span className={`px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-full text-[10.5px] sm:text-[11px] font-bold tracking-wide uppercase ${
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
              </div>
            )}
          </div>
        )}

        {/* TAB: ADDRESSES */}
        {activeTab === 'addresses' && (
          <div className="space-y-6 sm:space-y-8 animate-fade-in">
            <div className="bg-surface-2 border border-[var(--border)] rounded-2xl p-4 sm:p-5">
              <h3 className="font-display text-[17px] sm:text-[20px] font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <i className="ph ph-plus-circle text-[var(--accent)] text-[18px]"></i>
                {t('Add New Address')}
              </h3>
              {addrMsg && <div className={`mb-3 p-2.5 sm:p-3 rounded-xl text-[12.5px] sm:text-[13px] ${addrMsg.includes('success') ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{addrMsg}</div>}
              <form onSubmit={handleAddAddress} className="space-y-3.5">
                <div>
                  <label className="block text-[11.5px] sm:text-[12px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-medium">{t('Street Address')}</label>
                  <input type="text" required value={streetAddress} onChange={e => setStreetAddress(e.target.value)} className="w-full h-9.5 sm:h-10 bg-surface border border-[var(--border)] rounded-xl px-3.5 text-[13px] sm:text-[13.5px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" placeholder="Bole Road, House 123" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11.5px] sm:text-[12px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-medium">{t('City')}</label>
                    <input type="text" value="Addis Ababa" disabled className="w-full h-9.5 sm:h-10 bg-surface border border-[var(--border)] rounded-xl px-3.5 text-[13px] sm:text-[13.5px] text-[var(--muted)] cursor-not-allowed opacity-70" />
                  </div>
                  <div>
                    <label className="block text-[11.5px] sm:text-[12px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-medium">{t('Subcity / Zone')}</label>
                    <input type="text" value={subcityOrZone} onChange={e => setSubcityOrZone(e.target.value)} className="w-full h-9.5 sm:h-10 bg-surface border border-[var(--border)] rounded-xl px-3.5 text-[13px] sm:text-[13.5px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" placeholder="Bole, Arada, etc." />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-1.5 w-max">
                  <input type="checkbox" checked={isDefaultAddr} onChange={e => setIsDefaultAddr(e.target.checked)} className="rounded border-[var(--border)] bg-surface text-[var(--accent)] focus:ring-[var(--accent)]" />
                  <span className="text-[13px] sm:text-[13.5px] text-[var(--muted)]">{t('Set as default delivery address')}</span>
                </label>
                <button type="submit" className="mt-3 w-full sm:w-auto h-9 sm:h-9.5 px-4.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-[12.5px] sm:text-[13px] font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                  <i className="ph ph-floppy-disk text-[16px]"></i>
                  <span>{t('Save Address')}</span>
                </button>
              </form>
            </div>

            <div className="space-y-3.5">
              <h3 className="font-display text-[17px] sm:text-[20px] font-bold mb-3 flex items-center gap-2">
                <i className="ph ph-map-pin text-[var(--accent)] text-[18px]"></i>
                {t('Saved Addresses')}
              </h3>
              {addresses.length === 0 ? (
                <p className="text-[var(--muted)] text-[13px] sm:text-[13.5px]">{t('No saved addresses yet.')}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {addresses.map(addr => (
                    <div key={addr.id} className="bg-surface-2 border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 relative group flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 mt-0.5">
                            <i className="ph ph-map-pin text-[18px] text-[var(--accent)] mt-0.5 shrink-0"></i>
                            <div>
                              <p className="text-[var(--text)] font-semibold text-[13.5px] sm:text-[14.5px] mb-0.5">{addr.street_address}</p>
                              <p className="text-[var(--muted)] text-[12.5px] sm:text-[13px]">{addr.subcity_or_zone ? `${addr.subcity_or_zone}, ` : ''}{addr.city}</p>
                            </div>
                          </div>
                          {addr.is_default && (
                            <span className="text-[9.5px] sm:text-[10px] uppercase font-bold tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 rounded-md shrink-0">{t('Default')}</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[var(--border)]/60 flex items-center justify-between gap-2">
                        {!addr.is_default ? (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAddress(addr.id)}
                            className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <i className="ph ph-check-circle"></i>
                            <span>{t('Set as Default')}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--muted)] italic">{t('Primary delivery location')}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="w-7 h-7 rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
                          title={t('Delete Address')}
                        >
                          <i className="ph ph-trash text-sm"></i>
                        </button>
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
            <div className="bg-surface-2 border border-[var(--border)] rounded-2xl p-4 sm:p-5">
              <h3 className="font-display text-[17px] sm:text-[20px] font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <i className="ph ph-user text-[var(--accent)] text-[18px]"></i>
                {t('Personal Details')}
              </h3>
              {profileMsg && <div className={`mb-3 p-2.5 sm:p-3 rounded-xl text-[12.5px] sm:text-[13px] ${profileMsg.includes('success') ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{profileMsg}</div>}
              
              <div className="mb-4">
                <label className="block text-[12px] sm:text-[12.5px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-bold">{t('Username / Email')}</label>
                <div className="h-11 bg-surface border border-[var(--border)] rounded-xl px-3.5 flex items-center text-[14px] sm:text-[15px] text-[var(--muted)] opacity-75 font-mono">
                  {user.email || user.username}
                </div>
                <p className="text-[var(--muted)] text-[11.5px] mt-1">{t('Username/email cannot be changed here.')}</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[12px] sm:text-[12.5px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-bold">{t('First Name')}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full h-11 bg-surface border border-[var(--border)] rounded-xl px-3.5 text-[15px] sm:text-[16px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[12px] sm:text-[12.5px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-bold">{t('Last Name')}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full h-11 bg-surface border border-[var(--border)] rounded-xl px-3.5 text-[15px] sm:text-[16px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] sm:text-[12.5px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-bold">{t('Phone Number')}</label>
                  <EthiopianPhoneInput
                    value={phone}
                    onChange={val => setPhone(val)}
                    className="h-11 text-[15px] sm:text-[16px]"
                  />
                </div>

                {/* Display Text Size Selector */}
                <div className="pt-2 border-t border-[var(--border)]/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-bold text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
                      <i className="ph ph-text-aa text-[15px] text-[var(--accent)]"></i>
                      <span>{t('Display Text Size')}</span>
                    </label>
                    <span className="text-[11px] font-bold text-[var(--accent)] uppercase">
                      {t(currentTextSize.charAt(0).toUpperCase() + currentTextSize.slice(1))}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'small', label: t('Small') },
                      { id: 'normal', label: t('Normal') },
                      { id: 'medium', label: t('Medium') },
                      { id: 'large', label: t('Large') },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectTextSize(opt.id as TextSize)}
                        className={`h-9 px-2 rounded-xl border text-center transition-all flex items-center justify-center cursor-pointer text-[12px] font-bold ${
                          currentTextSize === opt.id
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] ring-1 ring-[var(--accent)] shadow-sm'
                            : 'bg-surface border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="mt-3 w-full sm:w-auto h-11 px-6 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-[14px] font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                  <i className="ph ph-check-circle text-[17px]"></i>
                  <span>{t('Update Profile')}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* MOBILE STICKY BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-2/95 backdrop-blur-md border-t border-[var(--border)] px-1 py-1.5 flex items-center justify-around shadow-2xl safe-area-inset-bottom">
        <button
          type="button"
          onClick={() => handleTabChange('orders')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10.5px] font-semibold transition-all cursor-pointer ${
            activeTab === 'orders'
              ? 'text-[var(--accent)] bg-[var(--accent-soft)] font-bold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <i className="ph ph-receipt text-[20px] mb-0.5"></i>
          <span className="truncate max-w-[72px]">{t('My Orders')}</span>
          {pendingOrders.length > 0 && (
            <span className="absolute top-1 right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[9px] font-bold flex items-center justify-center shadow-sm">
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('reservations')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10.5px] font-semibold transition-all cursor-pointer ${
            activeTab === 'reservations'
              ? 'text-[var(--accent)] bg-[var(--accent-soft)] font-bold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <i className="ph ph-calendar-check text-[20px] mb-0.5"></i>
          <span className="truncate max-w-[75px]">{t('Table Reservations')}</span>
          {reservations.filter(r => r.status === 'CONFIRMED' || r.status === 'PENDING').length > 0 && (
            <span className="absolute top-1 right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[9px] font-bold flex items-center justify-center shadow-sm">
              {reservations.filter(r => r.status === 'CONFIRMED' || r.status === 'PENDING').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('addresses')}
          className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10.5px] font-semibold transition-all cursor-pointer ${
            activeTab === 'addresses'
              ? 'text-[var(--accent)] bg-[var(--accent-soft)] font-bold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <i className="ph ph-map-pin text-[20px] mb-0.5"></i>
          <span className="truncate max-w-[72px]">{t('Delivery Addresses')}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10.5px] font-semibold transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'text-[var(--accent)] bg-[var(--accent-soft)] font-bold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <i className="ph ph-user-gear text-[20px] mb-0.5"></i>
          <span className="truncate max-w-[72px]">{t('Profile Settings')}</span>
        </button>
      </nav>

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

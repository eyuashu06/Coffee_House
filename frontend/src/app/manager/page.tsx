'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import Link from 'next/link';
import ReceiptModal from '../../components/ReceiptModal';
import NotificationsDropdown from '../../components/NotificationsDropdown';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';

interface OrderItem {
  id: number;
  item_name: string;
  variant_name?: string;
  unit_price_etb: string;
  quantity: number;
  subtotal_etb: string;
  temperature?: string;
  milk_choice?: string;
  notes?: string;
  add_ons?: { id: number; add_on_name: string; price_etb: string }[];
}

interface Order {
  id: number;
  order_number: string;
  customer_username: string;
  order_type: string;
  table_number: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: string;
  total_amount_etb: string;
  status: string;
  created_at: string;
  /** Committed prep time; the panel offers an editor once an order is accepted. */
  estimated_prep_minutes?: number | null;
  items: OrderItem[];
  latest_payment?: {
    id: number;
    tx_ref: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
    payment_method: string;
    failure_reason?: string;
    created_at: string;
    verified_at?: string | null;
    gateway_status?: string;
  } | null;
  /** Backend's authoritative "has the money arrived" answer. */
  payment_state?: 'paid' | 'settling' | 'failed' | 'unpaid';
}

const PAYMENT_LABELS: Record<string, string> = {
  telebirr: 'Telebirr', cbebirr: 'CBE Birr', mpesa: 'M-Pesa', awashbirr: 'Awash Birr',
  ebirr: 'E-Birr', card: 'Card / Bank', cash: 'Cash on Delivery',
};

/**
 * Whether money was actually captured. The backend decides this from whether any
 * payment for the order succeeded, so a later abandoned retry cannot make a paid
 * order look unpaid to the manager either.
 */
const isOrderPaid = (order: Order): boolean =>
  order.payment_state ? order.payment_state === 'paid' : order.latest_payment?.status === 'SUCCESS';

interface MenuItem {
  id: number;
  name: string;
  category_name?: string;
  category_slug?: string;
  price?: string;
  base_price_etb?: string;
  is_available: boolean;
  variants?: { id: number; name: string; price_modifier_etb: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting Payment',
  PLACED: 'New (Paid)',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800',
  PLACED: 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]',
  ACCEPTED: 'bg-cyan-900/50 text-cyan-300 border border-cyan-800',
  PREPARING: 'bg-blue-900/50 text-blue-300 border border-blue-800',
  READY: 'bg-green-900/50 text-green-300 border border-green-800',
  OUT_FOR_DELIVERY: 'bg-purple-900/50 text-purple-300 border border-purple-800',
  COMPLETED: 'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
  CANCELLED: 'bg-red-950 text-red-300 border border-red-900',
  REJECTED: 'bg-red-950 text-red-300 border border-red-900',
};

const STATUS_FILTERS = [
  'ALL', 'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING',
  'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REJECTED',
];

// Terminal states are not counted as "live"
const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'];

/**
 * The legal status moves, mirroring apps/orders/workflow.py on the server.
 *
 * The panel used to show a button per status, so staff could push an order from
 * "Placed" straight to "Completed" and the API had to reject it — or worse, accept it
 * because no transition rules existed. Rendering only the real moves keeps the button
 * and the rule in agreement.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED', 'REJECTED'],
  PLACED: ['ACCEPTED', 'CANCELLED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'CANCELLED', 'REJECTED'],
  PREPARING: ['READY', 'CANCELLED', 'REJECTED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

/** How long the kitchen should promise for a status, by order type. */
const DEFAULT_PREP_MINUTES: Record<string, number> = {
  DELIVERY: 30,
  PICKUP: 20,
  DINE_IN: 25,
};

interface TableReservation {
  id: number;
  name: string;
  date_time: string;
  party_size: number;
  contact_phone: string;
  status: string;
  created_at: string;
}

interface Analytics {
  generated_at?: string;
  daily_revenue: number;
  monthly_revenue: number;
  daily_orders_count: number;
  monthly_orders_count: number;
  average_order_value?: number;
  live_orders_count?: number;
  in_kitchen_count?: number;
  awaiting_payment_count?: number;
  weekly?: { day: string; revenue: number; orders: number }[];
  by_payment_method?: { method: string; revenue: number; payments: number }[];
}

const EMPTY_ANALYTICS: Analytics = {
  daily_revenue: 0, monthly_revenue: 0, daily_orders_count: 0, monthly_orders_count: 0,
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  telebirr: 'Telebirr', cbebirr: 'CBE Birr', mpesa: 'M-Pesa', awashbirr: 'Awash Birr',
  ebirr: 'E-Birr', card: 'Card / Bank', cash: 'Cash on Delivery',
};

/** Highlight a money figure when it changes, so staff see revenue move live. */
function useMoneyFlash(value: number) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current !== value) {
      setFlash(value > previous.current ? 'up' : 'down');
      previous.current = value;
      const t = setTimeout(() => setFlash(null), 1400);
      return () => clearTimeout(t);
    }
  }, [value]);
  return flash;
}

function MoneyCell({ value, className = '' }: { value: number; className?: string }) {
  const flash = useMoneyFlash(value);
  const { locale } = useLanguage();
  return (
    <span className={`font-display leading-none transition-colors duration-500 ${className} ${
      flash === 'up' ? 'text-emerald-300' : flash === 'down' ? 'text-red-300' : ''
    }`}>
      {value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {flash && <span className="ml-2 align-middle text-[12px] font-sans font-bold">{flash === 'up' ? '▲' : '▼'}</span>}
    </span>
  );
}

export default function ManagerDashboard() {
  const { user, loading, logout, sessionExpired, reportUnauthorized } = useAuth();
  const { t, tItem, tCategory, locale, language } = useLanguage();
  const birr = language === 'am' ? 'ብር' : 'ETB';
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY_ANALYTICS);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'menu' | 'reservations'>('dashboard');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchOrders();
    fetchStoreStatus();
    fetchMenuItems();
    fetchAnalytics();
    fetchReservations();

    // Poll every 5s so revenue/queue numbers stay live while the tab is open
    const interval = setInterval(() => {
      fetchOrders();
      fetchAnalytics();
      fetchReservations();
    }, 5000);

    // Catch up immediately when the manager comes back to the tab
    const onFocus = () => {
      fetchOrders();
      fetchAnalytics();
      fetchReservations();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  const fetchOrders = async () => {
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
        setOrders(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const res = await apiFetch('/api/v1/menu/items/?page_size=200');
      if (res.ok) {
        const data = await res.json();
        setMenuItems(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReservations = async () => {
    try {
      const res = await apiFetch('/api/v1/reservations/?page_size=100');
      if (res.status === 401) {
        reportUnauthorized();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setReservations(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await apiFetch('/api/v1/analytics/');
      if (res.status === 401) {
        reportUnauthorized();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAnalytics({ ...EMPTY_ANALYTICS, ...data });
        setLastSync(new Date());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStoreStatus = async () => {
    try {
      const res = await apiFetch('/api/v1/restaurant-settings/');
      if (res.ok) {
        const data = await res.json();
        setIsOpen(data.is_open);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStoreStatus = async () => {
    try {
      const res = await apiFetch('/api/v1/restaurant-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: !isOpen }),
      });
      if (res.ok) {
        setIsOpen(!isOpen);
        setActionMsg(`${t('Cafe is now')} ${!isOpen ? t('OPEN') : t('CLOSED')}`);
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (e) {
      setActionMsg(t('Failed to update store status.'));
    }
  };

  const toggleMenuItemAvailability = async (item: MenuItem) => {
    try {
      const res = await apiFetch(`/api/v1/menu/items/${item.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      if (res.ok) {
        setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_available: !item.is_available } : m));
        setActionMsg(`${tItem(item.name)} — ${!item.is_available ? t('Available') : t('Sold Out')}`);
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (e) {
      setActionMsg(t('Failed to update menu item status.'));
    }
  };

  const handleUpdateStatus = async (orderId: number, newStatus: string, notes?: string) => {
    setActionMsg(null);
    const order = orders.find((o) => o.id === orderId);

    // Accepting the order also commits to a prep time, so the customer has a number
    // to wait against instead of "soon". It used to stay at the model default forever.
    const shouldSetPrep =
      newStatus === 'ACCEPTED' &&
      order &&
      !order.estimated_prep_minutes;

    try {
      const res = await apiFetch(`/api/v1/orders/${orderId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes: notes || undefined,
          rejection_reason: newStatus === 'REJECTED' ? (notes || t('Rejected by manager.')) : undefined,
          estimated_prep_minutes:
            shouldSetPrep ? DEFAULT_PREP_MINUTES[order.order_type] ?? 20 : undefined,
        }),
      });

      if (res.ok) {
        const updatedOrder = await res.json();
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: updatedOrder.status, estimated_prep_minutes: updatedOrder.estimated_prep_minutes ?? o.estimated_prep_minutes } : o));
        setActionMsg(`${t('Order')} #${updatedOrder.order_number} → ${t(STATUS_LABELS[newStatus] || newStatus)}`);
        setTimeout(() => setActionMsg(null), 3000);
        fetchAnalytics(); // Refresh analytics after order update
      } else {
        const err = await res.json();
        setActionMsg(err.error || t('Failed to update order status.'));
      }
    } catch (e) {
      setActionMsg(t('Error updating status.'));
    }
  };

  /**
 * Adjust the prep time after accepting, without moving the status.
 *
 * Re-sends the current status as a no-op transition (the API treats same-status as a
 * no-op) so the value can be corrected after the fact, which is what happens when an
 * order turns out to be bigger than it looked.
 */
const handleSetPrepTime = async (orderId: number, minutes: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || !Number.isFinite(minutes) || minutes === order.estimated_prep_minutes) return;

    try {
      const res = await apiFetch(`/api/v1/orders/${orderId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: order.status,
          estimated_prep_minutes: minutes,
          notes: t('Prep time updated'),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estimated_prep_minutes: updated.estimated_prep_minutes } : o));
        setActionMsg(`${t('Order')} #${updated.order_number} — ${minutes} ${t('min')}`);
        setTimeout(() => setActionMsg(null), 3000);
      } else {
        const err = await res.json();
        setActionMsg(err.estimated_prep_minutes?.[0] || err.error || t('Failed to update prep time.'));
      }
    } catch {
      setActionMsg(t('Error updating prep time.'));
    }
  };

  const handleUpdateReservationStatus = async (reservationId: number, newStatus: string) => {
    setActionMsg(null);
    try {
      const res = await apiFetch(`/api/v1/reservations/${reservationId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const updatedRes = await res.json();
        setReservations(prev => prev.map(r => r.id === reservationId ? { ...r, status: updatedRes.status } : r));
        setActionMsg(`${t('Reservation status updated to:')} ${t(newStatus)}`);
        setTimeout(() => setActionMsg(null), 3000);
      } else {
        const err = await res.json();
        setActionMsg(err.error || t('Failed to update reservation status.'));
      }
    } catch (e) {
      setActionMsg(t('Error updating reservation status.'));
    }
  };

  if (loading || (isLoading && user)) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f7b5be] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && sessionExpired) {
    return (
      <div className="min-h-screen bg-surface text-[#e5e2e1] font-body flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="material-symbols-outlined text-5xl text-amber-400">lock_clock</span>
        <h2 className="font-display text-[26px] font-bold">{t('Session expired')}</h2>
        <p className="text-[#d5c2c3] text-[15px] max-w-md">
          {t('You were signed out, so live orders and revenue have stopped updating. Please sign in again.')}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold hover:brightness-110 transition-colors"
        >
          {t('Sign in again')}
        </button>
      </div>
    );
  }

  if (!user || (user.role !== 'MANAGER' && user.role !== 'ADMIN')) {
    return (
      <div className="min-h-screen bg-surface text-[#e5e2e1] flex flex-col items-center justify-center font-body">
        <span className="material-symbols-outlined text-5xl text-red-500 mb-4">gavel</span>
        <h2 className="font-display text-[26px] font-bold">{t('Access Denied')}</h2>
        <p className="text-[#d5c2c3] mt-2 mb-6 text-[15px]">{t('You do not have permission to view this page.')}</p>
        <Link href="/?welcome=1" className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold flex items-center hover:bg-[#ffd9dd] transition-colors">
          {t('Return to Home')}
        </Link>
      </div>
    );
  }

  const filteredOrders = filterStatus === 'ALL' ? orders : orders.filter(o => o.status === filterStatus);
  const liveOrderCount = orders.filter(o => !CLOSED_STATUSES.includes(o.status)).length;

  return (
    <div className="bg-surface text-[#e5e2e1] font-body min-h-screen flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-[#1c1b1b] border-r border-[#514345] md:min-h-screen flex flex-col flex-shrink-0 relative z-20">
        <div className="p-6 border-b border-[#514345]">
          <Link href="/?welcome=1" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-full bg-[#3b141c] border border-[#683941] flex items-center justify-center text-[#f7b5be] text-[16px] group-hover:scale-105 transition-transform"><i className="ph ph-coffee-bean"></i></span>
            <span className="font-display text-[21px] tracking-wide text-white">{t('Manager')}</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2 flex flex-row md:flex-col overflow-x-auto hide-scrollbar">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-chart-line-up text-xl"></i> {t('Dashboard')}
          </button>
          <button onClick={() => setActiveTab('orders')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'orders' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-receipt text-xl"></i> {t('Live Orders')}
            {liveOrderCount > 0 && (
              <span className="ml-auto bg-[#f7b5be] text-[#3b141c] text-[11px] font-bold px-2 py-0.5 rounded-full">{liveOrderCount}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('menu')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'menu' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-list-dashes text-xl"></i> {t('Menu Management')}
          </button>
          <button onClick={() => setActiveTab('reservations')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'reservations' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-calendar-blank text-xl"></i> {t('Table Reservations')}
            {reservations.filter(r => r.status === 'PENDING').length > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{reservations.filter(r => r.status === 'PENDING').length}</span>
            )}
          </button>
        </nav>
        <div className="p-4 border-t border-[#514345] hidden md:block">
          <Link
            href="/?welcome=1"
            className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-[12px] text-[14.5px] text-[#d5c2c3] hover:bg-[#3b141c] hover:text-[#f7b5be] transition-colors"
          >
            <i className="ph ph-storefront text-xl"></i> {t('View Customer Site')}
          </Link>
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-[#3b141c] border border-[#683941] text-[#f7b5be] flex items-center justify-center text-[16px] font-bold">{user.first_name?.[0] || 'M'}</div>
            <div>
              <p className="text-[14.5px] font-bold text-[#e5e2e1]">{user.first_name || t('Manager')}</p>
              <p className="text-[12px] text-[#9e8d8e]">{t(user.role, user.role)}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full h-10 rounded-[12px] border border-[#514345] text-[#d5c2c3] text-[14px] flex items-center justify-center gap-2 hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">
            <i className="ph ph-sign-out text-lg"></i> {t('Sign Out')}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 md:p-10 md:h-screen overflow-y-auto">
        
        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-[#1c1b1b] border border-[#514345] p-5 rounded-[18px]">
          <div>
            <h1 className="font-display text-[26px] md:text-[32px] leading-none mb-1 text-white">{t('Store Overview')}</h1>
            <p className="text-[#9e8d8e] text-[14.5px]">{t('Manage incoming orders and store status.')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex items-center">
              <NotificationsDropdown />
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-[15.5px] font-semibold">{isOpen ? t('STORE OPEN') : t('STORE CLOSED')}</span>
            </div>
            <button 
              onClick={toggleStoreStatus}
              className={`h-10 px-5 rounded-full font-semibold transition-colors ${isOpen ? 'bg-red-950 text-red-200 border border-red-900 hover:bg-red-900' : 'bg-green-950 text-green-200 border border-green-900 hover:bg-green-900'}`}
            >
              {isOpen ? t('Close Store') : t('Open Store')}
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="mb-6 p-4 rounded-[14px] bg-[#3b141c] border border-[#683941] text-[#f7b5be] flex items-center gap-3 animate-fade-in">
            <i className="ph ph-info text-xl"></i>
            <span className="text-[15px]">{actionMsg}</span>
          </div>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-[24px] text-white">{t('Analytics Overview')}</h2>
              <span className="flex items-center gap-2 text-[12.5px] text-[#9e8d8e]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {t('Live')}{lastSync ? ` · ${lastSync.toLocaleTimeString(locale)}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#1c1b1b] border border-[#514345] p-6 rounded-[18px] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-[120px] text-[#3b141c] opacity-30"><i className="ph ph-trend-up"></i></div>
                <h3 className="text-[#9e8d8e] font-bold text-[13px] uppercase tracking-wider mb-2">{t("Today's Revenue")}</h3>
                <div className="text-[42px] text-[#f7b5be]">
                  <MoneyCell value={analytics.daily_revenue} />
                </div>
                <p className="text-[#d5c2c3] text-[14.5px] mt-2">
                  {t('from')} {analytics.daily_orders_count} {t('paid orders')} {t('today')}
                </p>
              </div>

              <div className="bg-[#1c1b1b] border border-[#514345] p-6 rounded-[18px] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-[120px] text-[#3b141c] opacity-30"><i className="ph ph-calendar-check"></i></div>
                <h3 className="text-[#9e8d8e] font-bold text-[13px] uppercase tracking-wider mb-2">{t('Monthly Revenue')}</h3>
                <div className="text-[42px] text-[#f7b5be]">
                  <MoneyCell value={analytics.monthly_revenue} />
                </div>
                <p className="text-[#d5c2c3] text-[14.5px] mt-2">
                  {t('from')} {analytics.monthly_orders_count} {t('paid orders')} {t('this month')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Live Orders', value: analytics.live_orders_count ?? 0, icon: 'ph-bell-ringing', tone: 'text-[#f7b5be]' },
                { label: 'In Kitchen', value: analytics.in_kitchen_count ?? 0, icon: 'ph-coffee-maker', tone: 'text-blue-300' },
                { label: 'Awaiting Payment', value: analytics.awaiting_payment_count ?? 0, icon: 'ph-hourglass', tone: 'text-yellow-300' },
                { label: 'Avg. Order Value', value: analytics.average_order_value ?? 0, money: true, icon: 'ph-chart-line', tone: 'text-emerald-300' },
              ].map(card => (
                <div key={card.label} className="bg-[#1c1b1b] border border-[#514345] p-5 rounded-[18px]">
                  <div className="flex items-center gap-2 text-[#9e8d8e] text-[12px] font-bold uppercase tracking-wider mb-2">
                    <i className={`${card.icon} text-[16px] ${card.tone}`}></i>{t(card.label)}
                  </div>
                  {card.money
                    ? <MoneyCell value={card.value as number} className={`text-[26px] ${card.tone}`} />
                    : <div className={`font-display text-[30px] ${card.tone} leading-none`}>{card.value as number}</div>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 7-DAY REVENUE */}
              <div className="lg:col-span-2 bg-[#1c1b1b] border border-[#514345] p-6 rounded-[18px]">
                <h3 className="text-[#9e8d8e] font-bold text-[13px] uppercase tracking-wider mb-4">{t('Last 7 Days Revenue')}</h3>
                {(analytics.weekly || []).length === 0 ? (
                  <p className="text-[#9e8d8e] text-[14px]">{t('No revenue recorded yet.')}</p>
                ) : (() => {
                  const max = Math.max(...(analytics.weekly || []).map(d => d.revenue), 1);
                  return (
                    <div className="flex items-end gap-3 h-[180px]">
                      {(analytics.weekly || []).map(day => (
                        <div key={day.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                          <span className="text-[11px] text-[#d5c2c3]">{day.revenue > 0 ? day.revenue.toFixed(0) : ''}</span>
                          <div
                            title={`${day.day}: ${birr} ${day.revenue.toFixed(2)} · ${day.orders} ${t('orders')}`}
                            className="w-full rounded-t-[8px] bg-gradient-to-t from-[#683941] to-[#f7b5be] transition-all duration-700"
                            style={{ height: `${Math.max((day.revenue / max) * 100, day.revenue > 0 ? 6 : 2)}%` }}
                          />
                          <span className="text-[10.5px] text-[#9e8d8e]">
                            {new Date(day.day).toLocaleDateString(locale, { weekday: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* REVENUE BY PAYMENT METHOD */}
              <div className="bg-[#1c1b1b] border border-[#514345] p-6 rounded-[18px]">
                <h3 className="text-[#9e8d8e] font-bold text-[13px] uppercase tracking-wider mb-4">{t('Collected by Method')}</h3>
                {(analytics.by_payment_method || []).length === 0 ? (
                  <p className="text-[#9e8d8e] text-[14px]">{t('No settled payments yet.')}</p>
                ) : (
                  <div className="space-y-3">
                    {(analytics.by_payment_method || []).map(row => {
                      const total = (analytics.by_payment_method || []).reduce((sum, r) => sum + r.revenue, 0) || 1;
                      return (
                        <div key={row.method}>
                          <div className="flex justify-between text-[13.5px] mb-1">
                            <span className="text-[#d5c2c3]">{t(PAYMENT_METHOD_LABELS[row.method] || row.method)}</span>
                            <span className="text-[#f7b5be] font-bold">{row.revenue.toFixed(2)} {birr}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#f7b5be] transition-all duration-700"
                              style={{ width: `${Math.max((row.revenue / total) * 100, 3)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-[#9e8d8e] mt-1">{row.payments} {t('payments')}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="animate-fade-in">
            <h2 className="font-display text-[24px] text-white mb-6">{t('Live Orders')}</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {STATUS_FILTERS.map(status => (
                <button 
                  key={status} 
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-1.5 rounded text-[13px] font-bold tracking-wider transition-colors border ${filterStatus === status ? 'bg-[#e5e2e1] text-[#131313] border-[#e5e2e1]' : 'bg-transparent text-[#9e8d8e] border-[#514345] hover:text-[#d5c2c3]'}`}
                >
                  {t(status === 'ALL' ? 'ALL' : (STATUS_LABELS[status] || status))}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {filteredOrders.length === 0 ? (
                <div className="col-span-full py-12 text-center text-[#9e8d8e] bg-[#1c1b1b] border border-[#514345] rounded-[18px]">
                  {t('No orders found for this status.')}
                </div>
              ) : (
                filteredOrders.map(order => (
                  <div key={order.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[20px] font-display font-bold text-white">#{order.order_number}</span>
                          <span className="block text-[12px] text-[#9e8d8e] mt-1">{new Date(order.created_at).toLocaleTimeString(locale)}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase ${STATUS_BADGE[order.status] || 'bg-[#514345] text-[#d5c2c3] border border-[#514345]'}`}>
                          {t(STATUS_LABELS[order.status] || order.status)}
                        </span>
                      </div>
                      
                      <div className="text-[14px] text-[#d5c2c3] mb-4 space-y-1">
                        <p><strong className="text-[#e5e2e1]">{t('Type:')}</strong> {t(order.order_type, order.order_type)} {order.table_number && `(${t('Table')} ${order.table_number})`}</p>
                        <p><strong className="text-[#e5e2e1]">{t('Customer:')}</strong> {order.contact_name}</p>
                        <p><strong className="text-[#e5e2e1]">{t('Phone:')}</strong> {order.contact_phone}</p>
                        <p className="pt-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                              isOrderPaid(order)
                                ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800'
                                : order.status === 'PENDING_PAYMENT'
                                  ? 'bg-red-950 text-red-300 border border-red-800'
                                  : 'bg-[#514345] text-[#d5c2c3] border border-[#514345]'
                            }`}
                          >
                            <i className={`ph ${isOrderPaid(order) ? 'ph-check-circle' : 'ph-warning'}`}></i>
                            {isOrderPaid(order)
                              ? `${t('Paid')} · ${t(PAYMENT_LABELS[order.latest_payment?.payment_method || ''] || order.latest_payment?.payment_method || '')}`
                              : order.status === 'PENDING_PAYMENT'
                                ? t('Not paid yet', 'እስካሁን አልተከፈለም')
                                : t('Payment status unknown', 'የክፍያ ሁኔታ የማወቅ አልተቻለም')}
                          </span>
                        </p>
                        {order.latest_payment?.status === 'FAILED' && order.latest_payment.failure_reason && (
                          <p className="text-[12px] text-red-300/90">
                            Last attempt: {order.latest_payment.failure_reason}
                          </p>
                        )}                      </div>

                      <div className="space-y-2 mb-4">
                        <p className="text-[12px] uppercase text-[#9e8d8e] font-bold tracking-wider">{t('Items')}</p>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-3 text-[14.5px] border-b border-[#514345]/50 pb-2">
                            <span>
                              {item.quantity}x {tItem(item.item_name)}
                              {item.variant_name && (
                                <span className="text-[12px] text-[#fbbb50]"> ({item.variant_name})</span>
                              )}
                              {item.add_ons && item.add_ons.length > 0 && (
                                <span className="block text-[11px] text-[#d5c2c3]">
                                  + {item.add_ons.map(a => a.add_on_name).join(', ')}
                                </span>
                              )}
                              <span className="text-[12px] text-[#9e8d8e]">
                                {item.temperature && item.temperature !== 'Hot' ? item.temperature : ''}
                                {item.milk_choice && item.milk_choice !== 'None' ? ` ${item.milk_choice}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0">{item.subtotal_etb} {birr}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between text-[16px] font-bold text-[#f7b5be] mb-6">
                        <span>{t('Total:')}</span>
                        <span>{order.total_amount_etb} {birr}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {order.status === 'PENDING_PAYMENT' && (
                        <div className="flex gap-2">
                          <div className="flex-1 h-10 rounded-[12px] bg-red-950/50 border border-red-800 text-red-300 text-[13px] font-semibold flex items-center justify-center px-3 text-center">
                            {t('Unpaid — waiting on the customer')}
                          </div>
                          <button onClick={() => handleUpdateStatus(order.id, 'CANCELLED', 'Customer never completed payment.')} className="h-10 rounded-[12px] border border-red-900 text-red-400 font-bold text-[13px] px-4 hover:bg-red-950">{t('Cancel')}</button>
                        </div>
                      )}
                      {order.status === 'PLACED' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateStatus(order.id, 'ACCEPTED')} className="flex-1 h-10 rounded-[12px] bg-[#3b141c] text-[#f7b5be] font-bold text-[13px] hover:brightness-110">{t('Accept Order')}</button>
                          <button onClick={() => handleUpdateStatus(order.id, 'REJECTED', 'Rejected by manager.')} className="flex-1 h-10 rounded-[12px] border border-red-900 text-red-400 font-bold text-[13px] hover:bg-red-950">{t('Reject')}</button>
                        </div>
                      )}
                      {order.status === 'ACCEPTED' && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="text-[12px] text-[#9e8d8e] shrink-0" htmlFor={`prep-${order.id}`}>
                              {t('Ready in')}
                            </label>
                            <input
                              id={`prep-${order.id}`}
                              type="number"
                              min={1}
                              max={240}
                              defaultValue={order.estimated_prep_minutes ?? DEFAULT_PREP_MINUTES[order.order_type] ?? 20}
                              onBlur={(e) => handleSetPrepTime(order.id, Number(e.target.value))}
                              className="flex-1 h-9 px-3 rounded-[12px] bg-[#1c1b1b] border border-[#514345] text-[#e5e2e1] text-[13px] focus:border-[#f7b5be] focus:outline-none"
                            />
                            <span className="text-[12px] text-[#9e8d8e]">{t('min')}</span>
                          </div>
                          <button onClick={() => handleUpdateStatus(order.id, 'PREPARING')} className="w-full h-10 rounded-[12px] bg-blue-900/40 border border-blue-800 text-blue-300 font-bold text-[13px] hover:bg-blue-900/60">{t('Start Preparing')}</button>
                        </>
                      )}
                      {order.status === 'PREPARING' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'READY')} className="w-full h-10 rounded-[12px] bg-blue-900/40 border border-blue-800 text-blue-300 font-bold text-[13px] hover:bg-blue-900/60">{t('Mark Ready')}</button>
                      )}
                      {order.status === 'READY' && order.order_type === 'DELIVERY' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'OUT_FOR_DELIVERY')} className="w-full h-10 rounded-[12px] bg-purple-900/40 border border-purple-800 text-purple-300 font-bold text-[13px] hover:bg-purple-900/60">{t('Send for Delivery')}</button>
                      )}
                      {order.status === 'READY' && (order.order_type === 'DINE_IN' || order.order_type === 'PICKUP') && (
                        <button onClick={() => handleUpdateStatus(order.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-900/40 border border-green-800 text-green-300 font-bold text-[13px] hover:bg-green-900/60">{t('Complete Order')}</button>
                      )}
                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-900/40 border border-green-800 text-green-300 font-bold text-[13px] hover:bg-green-900/60">{t('Mark Delivered')}</button>
                      )}
                      {isOrderPaid(order) ? (
                        <button onClick={() => setSelectedReceiptOrder(order)} className="w-full h-9 rounded-[12px] border border-[#514345] text-[#9e8d8e] font-semibold text-[13px] hover:border-[#f7b5be] hover:text-[#f7b5be]">{t('View Receipt')}</button>
                      ) : (
                        <span className="w-full h-9 rounded-[12px] border border-[#514345]/60 text-[#9e8d8e] font-semibold text-[13px] flex items-center justify-center cursor-not-allowed" title={t('Receipts are issued only after payment')}>
                          {t('Receipt after payment')}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MENU TAB */}
        {activeTab === 'menu' && (
          <div className="animate-fade-in space-y-6">
            <h2 className="font-display text-[24px] text-white mb-6">{t('Menu Management')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {menuItems.map(item => (
                <div key={item.id} className={`bg-[#1c1b1b] border rounded-[18px] p-4 flex flex-col justify-between transition-colors ${item.is_available ? 'border-[#514345]' : 'border-red-900/50 opacity-70'}`}>
                  <div>
                    <h4 className="font-display text-[20px] text-[#e5e2e1] mb-1 leading-tight">{tItem(item.name)}</h4>
                    <span className="text-[12px] uppercase text-[#9e8d8e] tracking-wider font-bold">{tCategory(item.category_name)}</span>
                    <div className="text-[16px] text-[#f7b5be] font-semibold mt-2">{Number(item.price || 0).toFixed(2)} {birr}</div>
                  </div>
                  <button 
                    onClick={() => toggleMenuItemAvailability(item)}
                    className={`mt-4 w-full h-9 rounded-[12px] font-bold text-[13px] transition-colors border ${item.is_available ? 'border-[#683941] text-[#f7b5be] hover:bg-[#3b141c]' : 'bg-red-950/40 border-red-900/80 text-red-400 hover:bg-red-950/60'}`}
                  >
                    {item.is_available ? t('Available (Click to Disable)') : t('Sold Out (Click to Enable)')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESERVATIONS TAB */}
        {activeTab === 'reservations' && (
          <div className="animate-fade-in space-y-6">
            <h2 className="font-display text-[24px] text-white mb-6">{t('Table Reservations')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reservations.length === 0 ? (
                <div className="col-span-full py-12 text-center text-[#9e8d8e] bg-[#1c1b1b] border border-[#514345] rounded-[18px]">
                  {t('No table reservations found.')}
                </div>
              ) : (
                reservations.map(reservation => (
                  <div key={reservation.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[20px] font-display font-bold text-white">{reservation.name}</span>
                          <span className="block text-[12px] text-[#9e8d8e] mt-1">{t('Booked on')} {new Date(reservation.created_at).toLocaleDateString(locale)}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase ${
                          reservation.status === 'PENDING' ? 'bg-yellow-900/50 text-yellow-500' :
                          reservation.status === 'CONFIRMED' ? 'bg-blue-900/50 text-blue-400' :
                          reservation.status === 'COMPLETED' ? 'bg-green-900/50 text-green-400' :
                          'bg-[#514345] text-[#d5c2c3]'
                        }`}>
                          {t(reservation.status)}
                        </span>
                      </div>
                      
                      <div className="text-[14px] text-[#d5c2c3] mb-4 space-y-1">
                        <p><strong className="text-[#e5e2e1]">{t('Date & Time:')}</strong> {new Date(reservation.date_time).toLocaleString(locale)}</p>
                        <p><strong className="text-[#e5e2e1]">{t('Party Size:')}</strong> {reservation.party_size} {t('people')}</p>
                        <p><strong className="text-[#e5e2e1]">{t('Phone:')}</strong> {reservation.contact_phone || t('N/A')}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {reservation.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateReservationStatus(reservation.id, 'CONFIRMED')} className="flex-1 h-10 rounded-[12px] bg-[#3b141c] text-[#f7b5be] font-bold text-[13px] hover:brightness-110">{t('Confirm')}</button>
                          <button onClick={() => handleUpdateReservationStatus(reservation.id, 'CANCELLED')} className="flex-1 h-10 rounded-[12px] border border-red-900 text-red-400 font-bold text-[13px] hover:bg-red-950">{t('Cancel')}</button>
                        </div>
                      )}
                      {reservation.status === 'CONFIRMED' && (
                        <button onClick={() => handleUpdateReservationStatus(reservation.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-900/40 border border-green-800 text-green-300 font-bold text-[13px] hover:bg-green-900/60">{t('Mark Completed')}</button>
                      )}
                    </div>
                  </div>
                ))
              )}
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
    </div>
  );
}

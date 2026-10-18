'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import Link from 'next/link';
import ThemeToggle from '../../components/ThemeToggle';
import ReceiptModal from '../../components/ReceiptModal';
import NotificationsDropdown from '../../components/NotificationsDropdown';
import LanguageToggle from '../../components/LanguageToggle';
import ProfileDropdown from '../../components/ProfileDropdown';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { formatEthiopianTime } from '../../utils/ethiopianTime';

import EthiopianPhoneInput from '../../components/EthiopianPhoneInput';
import { useCafe, type CafeLocation } from '../../context/CafeContext';

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

interface Category {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  display_order?: number;
}

interface MenuItem {
  id: number;
  name: string;
  category_name?: string;
  category_slug?: string;
  category?: { id: number; name: string; slug: string } | null;
  category_id?: number;
  price?: string;
  base_price_etb?: string;
  description?: string;
  image_url?: string;
  image_display?: string;
  is_available: boolean;
  is_signature?: boolean;
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
  EXPIRED: 'Expired (unpaid)',
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

const STATUS_FILTERS = [
  'ALL', 'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING',
  'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED',
];

// Terminal states are not counted as "live". An expired order is one the customer
// never paid for, so leaving it in the live count told staff there was work waiting
// that no amount of kitchen time would clear.
const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

/** How long the kitchen should promise for a status, by order type. */
const DEFAULT_PREP_MINUTES: Record<string, number> = {
  DELIVERY: 30,
  PICKUP: 20,
  DINE_IN: 25,
};

interface TableReservation {
  id: number;
  order_code: string;
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

interface RevenueReport {
  generated_at: string;
  range_days: number;
  order_type: string;
  summary: {
    range_days: number;
    revenue: number;
    orders: number;
    completed_orders: number;
    delivery_fees: number;
    average_order_value: number;
    daily: Array<{ day: string; revenue: number; orders: number }>;
  };
  top_items: Array<{
    item_name: string;
    quantity: number;
    revenue: number;
    orders: number;
  }>;
  peak_hours: {
    hours: Array<{ hour: number; orders: number; revenue: number }>;
    busiest_hour: number | null;
  };
  order_types: Array<{
    order_type: string;
    label: string;
    orders: number;
    revenue: number;
    share: number;
  }>;
  unpaid: {
    awaiting_payment: number;
    awaiting_payment_value: number;
    expired_last_30_days: number;
  };
}

export default function ManagerDashboard() {
  const { user, loading, logout, sessionExpired, reportUnauthorized } = useAuth();
  const { t, tItem, tCategory, locale, language } = useLanguage();
  const birr = language === 'am' ? 'ብር' : 'ETB';
  const {
    settings: cafeSettings,
    locations: cafeLocations,
    updateSettings,
    addLocation,
    updateLocation,
    deleteLocation,
    refreshCafeData,
  } = useCafe();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY_ANALYTICS);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'menu' | 'reservations' | 'reports' | 'cafe'>('dashboard');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // Menu Management State
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState('ALL');
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    category_id: '',
    price: '',
    description: '',
    image_url: '',
    is_signature: false,
    is_available: true,
  });
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<MenuItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Search & Navigation Highlight State
  const [orderSearch, setOrderSearch] = useState('');
  const [highlightOrder, setHighlightOrder] = useState<string | null>(null);
  const [highlightRes, setHighlightRes] = useState<string | null>(null);

  // Menu Item Image Upload State (Supports both file upload and web link)
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload');
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [clearExistingImage, setClearExistingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle URL query parameters and reactive notification navigation
  const syncFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const orderParam = params.get('order');
    const highlightParam = params.get('highlight');
    const resParam = params.get('reservation');

    const isRes = resParam || (highlightParam && highlightParam.toUpperCase().startsWith('RES-'));
    const isOrd = orderParam || (highlightParam && highlightParam.toUpperCase().startsWith('ORD-'));

    if (isRes) {
      const code = resParam || highlightParam;
      setActiveTab('reservations');
      setHighlightRes(code);
      setTimeout(() => {
        const el = document.getElementById(`res-${code}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    } else if (isOrd || orderParam) {
      const code = orderParam || highlightParam;
      setActiveTab('orders');
      setFilterStatus('ALL');
      setOrderSearch('');
      if (code) {
        setHighlightOrder(code);
        setTimeout(() => {
          const el = document.getElementById(`order-${code}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400);
      }
    } else if (tabParam && ['dashboard', 'orders', 'menu', 'reservations', 'reports', 'cafe'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, []);

  useEffect(() => {
    syncFromUrl();
    const handleNotificationNav = () => {
      syncFromUrl();
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('notification-navigate', handleNotificationNav);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('notification-navigate', handleNotificationNav);
    };
  }, [syncFromUrl]);

  // Cafe Brand Identity State
  const [brandForm, setBrandForm] = useState({
    cafe_name: '',
    tagline: '',
    description: '',
    primary_phone: '',
    contact_email: '',
    opening_hours: '',
    ceremony_time: '',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (cafeSettings) {
      setBrandForm({
        cafe_name: cafeSettings.cafe_name || '',
        tagline: cafeSettings.tagline || '',
        description: cafeSettings.description || '',
        primary_phone: cafeSettings.primary_phone || '',
        contact_email: cafeSettings.contact_email || '',
        opening_hours: cafeSettings.opening_hours || '',
        ceremony_time: cafeSettings.ceremony_time || '',
      });
    }
  }, [cafeSettings]);

  // Branch Locations State
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<CafeLocation | null>(null);
  const [locationForm, setLocationForm] = useState({
    name: '',
    address: '',
    city: 'Addis Ababa',
    phone: '',
    email: '',
    opening_hours: '1:00 – 3:00',
    is_primary: false,
    is_active: true,
  });
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [deleteConfirmLocation, setDeleteConfirmLocation] = useState<CafeLocation | null>(null);
  const [isDeletingLocation, setIsDeletingLocation] = useState(false);

  // Reports state
  const [reportData, setReportData] = useState<RevenueReport | null>(null);
  const [reportRange, setReportRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [reportOrderType, setReportOrderType] = useState<string>('ALL');
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  const fetchReport = useCallback(async () => {
    setIsLoadingReport(true);
    try {
      const typeParam = reportOrderType === 'ALL' ? '' : `&order_type=${reportOrderType}`;
      const res = await apiFetch(`/api/v1/reports/?range=${reportRange}${typeParam}`);
      if (res.status === 401) {
        reportUnauthorized();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error('Failed to fetch report:', e);
    } finally {
      setIsLoadingReport(false);
    }
  }, [reportOrderType, reportRange, reportUnauthorized]);

  const handleExportCsv = () => {
    const typeParam = reportOrderType === 'ALL' ? '' : `&order_type=${reportOrderType}`;
    window.open(`/api/v1/reports/export.csv?range=${reportRange}${typeParam}`, '_blank');
  };

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'reports') {
      fetchReport();
    }
  }, [user, activeTab, fetchReport]);

  useEffect(() => {
    if (!user) return;
    fetchOrders();
    fetchStoreStatus();
    fetchMenuItems();
    fetchCategories();
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
    // Deliberately keyed on `user` alone. The three fetchers are plain functions,
    // recreated on every render, so listing them would tear down and rebuild the
    // 5s interval on every render - a request loop against the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/v1/menu/categories/');
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemForm({
      name: '',
      category_id: categories.length > 0 ? String(categories[0].id) : '',
      price: '',
      description: '',
      image_url: '',
      is_signature: false,
      is_available: true,
    });
    setImageInputMode('upload');
    setItemImageFile(null);
    setItemImagePreview(null);
    setClearExistingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (item: MenuItem) => {
    setEditingItem(item);
    const catId = item.category?.id || categories.find(c => c.slug === item.category_slug || c.name === item.category_name)?.id || (categories.length > 0 ? categories[0].id : '');
    setItemForm({
      name: item.name,
      category_id: String(catId),
      price: String(item.price ?? item.base_price_etb ?? ''),
      description: item.description || '',
      image_url: item.image_url || '',
      is_signature: !!item.is_signature,
      is_available: item.is_available ?? true,
    });
    setItemImageFile(null);
    setClearExistingImage(false);
    if (item.image_display) {
      setItemImagePreview(item.image_display);
      setImageInputMode(item.image_url && item.image_url === item.image_display ? 'url' : 'upload');
    } else {
      setItemImagePreview(null);
      setImageInputMode('upload');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsItemModalOpen(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setActionMsg(t('Image size exceeds 5MB limit. Please choose a smaller file.'));
        setTimeout(() => setActionMsg(null), 3500);
        return;
      }
      setItemImageFile(file);
      setItemImagePreview(URL.createObjectURL(file));
      setClearExistingImage(false);
    }
  };

  const handleDropImage = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        setActionMsg(t('Image size exceeds 5MB limit. Please choose a smaller file.'));
        setTimeout(() => setActionMsg(null), 3500);
        return;
      }
      setItemImageFile(file);
      setItemImagePreview(URL.createObjectURL(file));
      setClearExistingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setItemImageFile(null);
    setItemImagePreview(null);
    setItemForm(prev => ({ ...prev, image_url: '' }));
    setClearExistingImage(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingItem(true);
    try {
      const url = editingItem ? `/api/v1/menu/items/${editingItem.id}/` : '/api/v1/menu/items/';
      const method = editingItem ? 'PATCH' : 'POST';

      let res: Response;
      const effectiveCatId = itemForm.category_id || (categories.length > 0 ? String(categories[0].id) : '');
      const parsedPrice = parseFloat(itemForm.price) || 0;

      if (itemImageFile) {
        // Send multipart form data for file upload
        const formData = new FormData();
        formData.append('name', itemForm.name.trim());
        formData.append('description', itemForm.description.trim());
        formData.append('price', String(parsedPrice));
        formData.append('base_price_etb', String(parsedPrice));
        if (effectiveCatId) {
          formData.append('category_id', effectiveCatId);
        }
        formData.append('is_signature', String(itemForm.is_signature));
        formData.append('is_available', String(itemForm.is_available));
        formData.append('image', itemImageFile);
        if (editingItem) {
          formData.append('clear_image', 'false');
        }

        res = await apiFetch(url, {
          method,
          body: formData,
        });
      } else {
        // Send JSON payload
        const payload: Record<string, any> = {
          name: itemForm.name.trim(),
          description: itemForm.description.trim(),
          price: parsedPrice,
          base_price_etb: parsedPrice,
          image_url: itemForm.image_url.trim(),
          is_signature: itemForm.is_signature,
          is_available: itemForm.is_available,
        };
        if (effectiveCatId) {
          payload.category_id = Number(effectiveCatId);
        }
        if (clearExistingImage) {
          payload.clear_image = true;
          payload.image_url = '';
        } else if (imageInputMode === 'url' && itemForm.image_url.trim()) {
          // If manager switched to URL mode and provided a URL, clear old image file so URL is displayed
          payload.clear_image = true;
        }

        res = await apiFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setIsItemModalOpen(false);
        setItemImageFile(null);
        setItemImagePreview(null);
        await fetchMenuItems();
        setActionMsg(editingItem ? t('Item updated successfully!') : t('Item created successfully!'));
        setTimeout(() => setActionMsg(null), 3500);
      } else {
        const err = await res.json().catch(() => ({}));
        let errorMsg = err.detail || err.error;
        if (!errorMsg && typeof err === 'object' && Object.keys(err).length > 0) {
          errorMsg = Object.entries(err)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ');
        }
        setActionMsg(errorMsg || t('Failed to save menu item.'));
        setTimeout(() => setActionMsg(null), 4500);
      }
    } catch {
      setActionMsg(t('Failed to save menu item.'));
      setTimeout(() => setActionMsg(null), 3500);
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleDeleteMenuItem = async () => {
    if (!deleteConfirmItem) return;
    setIsDeletingItem(true);
    try {
      const res = await apiFetch(`/api/v1/menu/items/${deleteConfirmItem.id}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        setDeleteConfirmItem(null);
        await fetchMenuItems();
        setActionMsg(t('Item deleted successfully!'));
        setTimeout(() => setActionMsg(null), 3500);
      } else {
        setActionMsg(t('Failed to delete menu item.'));
        setTimeout(() => setActionMsg(null), 3500);
      }
    } catch {
      setActionMsg(t('Failed to delete menu item.'));
      setTimeout(() => setActionMsg(null), 3500);
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleSaveBrandSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    const success = await updateSettings(brandForm);
    setIsSavingSettings(false);
    if (success) {
      setActionMsg(t('Settings saved successfully!'));
    } else {
      setActionMsg(t('Failed to save settings.'));
    }
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleOpenAddBranch = () => {
    setEditingLocation(null);
    setLocationForm({
      name: '',
      address: '',
      city: 'Addis Ababa',
      phone: brandForm.primary_phone || '+251 11 555 0148',
      email: brandForm.contact_email || 'selam@bunahub.et',
      opening_hours: brandForm.opening_hours || '1:00 – 3:00',
      is_primary: cafeLocations.length === 0,
      is_active: true,
    });
    setIsLocationModalOpen(true);
  };

  const handleOpenEditBranch = (loc: CafeLocation) => {
    setEditingLocation(loc);
    setLocationForm({
      name: loc.name,
      address: loc.address,
      city: loc.city,
      phone: loc.phone || '',
      email: loc.email || '',
      opening_hours: loc.opening_hours || '1:00 – 3:00',
      is_primary: loc.is_primary,
      is_active: loc.is_active,
    });
    setIsLocationModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLocation(true);
    let success = false;
    if (editingLocation) {
      success = await updateLocation(editingLocation.id, locationForm);
    } else {
      success = await addLocation(locationForm);
    }
    setIsSavingLocation(false);
    if (success) {
      setIsLocationModalOpen(false);
      setActionMsg(editingLocation ? t('Branch updated successfully!') : t('Branch created successfully!'));
    } else {
      setActionMsg(t('Failed to save branch.'));
    }
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleSetPrimaryBranch = async (loc: CafeLocation) => {
    const success = await updateLocation(loc.id, { is_primary: true });
    if (success) {
      setActionMsg(`${tItem(loc.name)} → ${t('Primary Branch')}`);
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleDeleteBranch = async () => {
    if (!deleteConfirmLocation) return;
    setIsDeletingLocation(true);
    const success = await deleteLocation(deleteConfirmLocation.id);
    setIsDeletingLocation(false);
    if (success) {
      setDeleteConfirmLocation(null);
      setActionMsg(t('Branch deleted successfully!'));
    } else {
      setActionMsg(t('Failed to delete branch.'));
    }
    setTimeout(() => setActionMsg(null), 3500);
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
      <div className="min-h-screen bg-surface text-[var(--text)] font-body flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="material-symbols-outlined text-5xl text-amber-400">lock_clock</span>
        <h2 className="font-display text-[26px] font-bold">{t('Session expired')}</h2>
        <p className="text-[var(--muted)] text-[15px] max-w-md">
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
      <div className="min-h-screen bg-surface text-[var(--text)] flex flex-col items-center justify-center font-body">
        <span className="material-symbols-outlined text-5xl text-red-500 mb-4">gavel</span>
        <h2 className="font-display text-[26px] font-bold">{t('Access Denied')}</h2>
        <p className="text-[var(--muted)] mt-2 mb-6 text-[15px]">{t('You do not have permission to view this page.')}</p>
        <Link href="/?welcome=1" className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold flex items-center hover:bg-[#ffd9dd] transition-colors">
          {t('Return to Home')}
        </Link>
      </div>
    );
  }

  const filteredOrders = orders.filter(o => {
    const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
    const q = orderSearch.trim().toLowerCase();
    if (!q) return matchesStatus;
    const matchesSearch =
      o.order_number.toLowerCase().includes(q) ||
      (o.contact_name && o.contact_name.toLowerCase().includes(q)) ||
      (o.contact_phone && o.contact_phone.toLowerCase().includes(q)) ||
      (o.table_number && o.table_number.toLowerCase().includes(q));
    return matchesSearch && matchesStatus;
  });
  const liveOrderCount = orders.filter(o => !CLOSED_STATUSES.includes(o.status)).length;

  return (
    <div className="bg-surface text-[var(--text)] font-body min-h-screen flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-surface-2 border-r border-[var(--border)] md:min-h-screen flex flex-col flex-shrink-0 relative z-20">
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/?welcome=1" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] text-[16px] group-hover:scale-105 transition-transform"><i className="ph ph-coffee-bean"></i></span>
            <span className="font-display text-[21px] tracking-wide text-[var(--text)]">{t('Manager')}</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2 flex flex-row md:flex-col overflow-x-auto hide-scrollbar">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'}`}>
            <i className="ph ph-chart-line-up text-xl"></i> {t('Dashboard')}
          </button>
          <button 
            onClick={() => {
              setActiveTab('orders');
              setFilterStatus('ALL');
              setOrderSearch('');
              setHighlightOrder(null);
            }} 
            className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'orders' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'}`}
          >
            <i className="ph ph-receipt text-xl"></i> {t('Live Orders')}
            {liveOrderCount > 0 && (
              <span className="ml-auto bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-bold px-2 py-0.5 rounded-full">{liveOrderCount}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('menu')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'menu' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'}`}>
            <i className="ph ph-list-dashes text-xl"></i> {t('Menu Management')}
          </button>
          <button onClick={() => setActiveTab('reservations')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'reservations' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'}`}>
            <i className="ph ph-calendar-blank text-xl"></i> {t('Table Reservations')}
            {reservations.filter(r => r.status === 'PENDING').length > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{reservations.filter(r => r.status === 'PENDING').length}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('reports')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'reports' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'}`}>
            <i className="ph ph-chart-line-up text-xl"></i> {t('Reports & Analytics')}
          </button>
          <button onClick={() => setActiveTab('cafe')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'cafe' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'}`}>
            <i className="ph ph-buildings text-xl"></i> {t('Cafe & Branches')}
          </button>
        </nav>
        <div className="p-4 border-t border-[var(--border)] hidden md:block">
          <Link
            href="/?welcome=1"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-[14.5px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors"
          >
            <i className="ph ph-storefront text-xl"></i> {t('View Customer Site')}
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 md:p-10 md:h-screen overflow-y-auto">
        
        {/* Status Bar */}
        <div className="relative z-30 flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 bg-surface-2 border border-[var(--border)] p-4 sm:p-5 rounded-[18px]">
          <div>
            <h1 className="font-display text-[26px] md:text-[32px] leading-none mb-1 text-[var(--text)]">{t('Store Overview')}</h1>
            <p className="text-[var(--muted)] text-[14.5px]">{t('Manage incoming orders and store status.')}</p>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            {/* 1. STORE OPEN / STORE CLOSED Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-[var(--border)]">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-[13px] sm:text-[14px] font-bold tracking-wide whitespace-nowrap">
                {isOpen ? t('STORE OPEN') : t('STORE CLOSED')}
              </span>
            </div>

            {/* 2. Close Store / Open Store Toggle Button */}
            <button 
              type="button"
              onClick={toggleStoreStatus}
              className={`h-9 px-3.5 sm:px-4 rounded-full text-xs sm:text-[12.5px] font-bold transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                isOpen 
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20' 
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              <i className={`ph ${isOpen ? 'ph-door-closed' : 'ph-door-open'} text-sm`}></i>
              <span>{isOpen ? t('Close Store') : t('Open Store')}</span>
            </button>

            {/* 3. Language Toggle (translate 🇪🇹 አማ) */}
            <LanguageToggle className="h-9 px-2.5 sm:px-3 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer" />

            {/* 4. Theme Toggle (dark_mode / light_mode) */}
            <ThemeToggle className="h-9 w-9 shrink-0 cursor-pointer" />

            {/* 5. Notifications Dropdown */}
            <NotificationsDropdown />

            {/* 6. Profile Dropdown (right next to notification icon) */}
            <ProfileDropdown isManagerPage={true} />
          </div>
        </div>

        {actionMsg && (
          <div className="mb-6 p-4 rounded-[14px] bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] flex items-center gap-3 animate-fade-in">
            <i className="ph ph-info text-xl"></i>
            <span className="text-[15px]">{actionMsg}</span>
          </div>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-[24px] text-[var(--text)]">{t('Analytics Overview')}</h2>
              <span className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {t('Live')}{lastSync ? ` · ${lastSync.toLocaleTimeString(locale)}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface-2 border border-[var(--border)] p-6 rounded-[18px] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-[120px] text-[var(--accent)] opacity-15"><i className="ph ph-trend-up"></i></div>
                <h3 className="text-[var(--muted)] font-bold text-[13px] uppercase tracking-wider mb-2">{t("Today's Revenue")}</h3>
                <div className="text-[42px] text-[var(--accent)]">
                  <MoneyCell value={analytics.daily_revenue} />
                </div>
                <p className="text-[var(--muted)] text-[14.5px] mt-2">
                  {t('from')} {analytics.daily_orders_count} {t('paid orders')} {t('today')}
                </p>
              </div>

              <div className="bg-surface-2 border border-[var(--border)] p-6 rounded-[18px] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-[120px] text-[var(--accent)] opacity-15"><i className="ph ph-calendar-check"></i></div>
                <h3 className="text-[var(--muted)] font-bold text-[13px] uppercase tracking-wider mb-2">{t('Monthly Revenue')}</h3>
                <div className="text-[42px] text-[var(--accent)]">
                  <MoneyCell value={analytics.monthly_revenue} />
                </div>
                <p className="text-[var(--muted)] text-[14.5px] mt-2">
                  {t('from')} {analytics.monthly_orders_count} {t('paid orders')} {t('this month')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Live Orders', value: analytics.live_orders_count ?? 0, icon: 'ph-bell-ringing', tone: 'text-[var(--accent)]' },
                { label: 'In Kitchen', value: analytics.in_kitchen_count ?? 0, icon: 'ph-coffee-maker', tone: 'text-blue-600 dark:text-blue-300' },
                { label: 'Awaiting Payment', value: analytics.awaiting_payment_count ?? 0, icon: 'ph-hourglass', tone: 'text-amber-600 dark:text-yellow-300' },
                { label: 'Avg. Order Value', value: analytics.average_order_value ?? 0, money: true, icon: 'ph-chart-line', tone: 'text-emerald-600 dark:text-emerald-300' },
              ].map(card => (
                <div key={card.label} className="bg-surface-2 border border-[var(--border)] p-5 rounded-[18px]">
                  <div className="flex items-center gap-2 text-[var(--muted)] text-[12px] font-bold uppercase tracking-wider mb-2">
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
              <div className="lg:col-span-2 bg-surface-2 border border-[var(--border)] p-6 rounded-[18px]">
                <h3 className="text-[var(--muted)] font-bold text-[13px] uppercase tracking-wider mb-4">{t('Last 7 Days Revenue')}</h3>
                {(analytics.weekly || []).length === 0 ? (
                  <p className="text-[var(--muted)] text-[14px]">{t('No revenue recorded yet.')}</p>
                ) : (() => {
                  const max = Math.max(...(analytics.weekly || []).map(d => d.revenue), 1);
                  return (
                    <div className="flex items-end gap-3 h-[180px]">
                      {(analytics.weekly || []).map(day => (
                        <div key={day.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                          <span className="text-[11px] text-[var(--muted)]">{day.revenue > 0 ? day.revenue.toFixed(0) : ''}</span>
                          <div
                            title={`${day.day}: ${birr} ${day.revenue.toFixed(2)} · ${day.orders} ${t('orders')}`}
                            className="w-full rounded-t-[8px] bg-gradient-to-t from-[var(--accent)] to-[var(--accent-soft)] transition-all duration-700"
                            style={{ height: `${Math.max((day.revenue / max) * 100, day.revenue > 0 ? 6 : 2)}%` }}
                          />
                          <span className="text-[10.5px] text-[var(--muted)]">
                            {new Date(day.day).toLocaleDateString(locale, { weekday: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* REVENUE BY PAYMENT METHOD */}
              <div className="bg-surface-2 border border-[var(--border)] p-6 rounded-[18px]">
                <h3 className="text-[var(--muted)] font-bold text-[13px] uppercase tracking-wider mb-4">{t('Collected by Method')}</h3>
                {(analytics.by_payment_method || []).length === 0 ? (
                  <p className="text-[var(--muted)] text-[14px]">{t('No settled payments yet.')}</p>
                ) : (
                  <div className="space-y-3">
                    {(analytics.by_payment_method || []).map(row => {
                      const total = (analytics.by_payment_method || []).reduce((sum, r) => sum + r.revenue, 0) || 1;
                      return (
                        <div key={row.method}>
                          <div className="flex justify-between text-[13.5px] mb-1">
                            <span className="text-[var(--muted)]">{t(PAYMENT_METHOD_LABELS[row.method] || row.method)}</span>
                            <span className="text-[var(--accent)] font-bold">{row.revenue.toFixed(2)} {birr}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
                              style={{ width: `${Math.max((row.revenue / total) * 100, 3)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-[var(--muted)] mt-1">{row.payments} {t('payments')}</p>
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
          <div className="animate-fade-in space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-[24px] text-[var(--text)]">{t('Live Orders')}</h2>
                <p className="text-[13px] text-[var(--muted)]">{t('View, filter, search, and update customer orders in real time.')}</p>
              </div>
              <div className="relative w-full sm:w-80">
                <i className="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[16px]"></i>
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder={t('Search by order #, phone, customer...')}
                  className="w-full h-10 pl-10 pr-9 rounded-full bg-surface-2 border border-[var(--border)] text-[13.5px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                />
                {orderSearch && (
                  <button
                    onClick={() => setOrderSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] text-xs"
                    title={t('Clear search')}
                  >
                    <i className="ph ph-x"></i>
                  </button>
                )}
              </div>
            </div>

            {orderSearch && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] text-xs text-[var(--accent)] w-fit">
                <span>{t('Filtering by:')} <strong>&quot;{orderSearch}&quot;</strong></span>
                <button
                  type="button"
                  onClick={() => setOrderSearch('')}
                  className="ml-2 font-bold underline hover:opacity-80 cursor-pointer"
                >
                  {t('Show All Orders')}
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              {STATUS_FILTERS.map(status => {
                const count = status === 'ALL' 
                  ? orders.length 
                  : orders.filter(o => o.status === status).length;
                return (
                  <button 
                    key={status} 
                    type="button"
                    onClick={() => {
                      setFilterStatus(status);
                      if (status === 'ALL') setOrderSearch('');
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-bold tracking-wide transition-all border flex items-center gap-1.5 cursor-pointer ${
                      filterStatus === status 
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)] shadow-sm' 
                        : 'bg-transparent text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--muted)]'
                    }`}
                  >
                    <span>{t(status === 'ALL' ? 'ALL' : (STATUS_LABELS[status] || status))}</span>
                    {count > 0 && (
                      <span className={`text-[10.5px] px-1.5 py-0.2 rounded-full font-mono ${
                        filterStatus === status
                          ? 'bg-black/20 text-[var(--accent-contrast)]'
                          : 'bg-surface border border-[var(--border)] text-[var(--muted)]'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {filteredOrders.length === 0 ? (
                <div className="col-span-full py-12 px-4 text-center text-[var(--muted)] bg-surface-2 border border-[var(--border)] rounded-[18px]">
                  <i className="ph ph-receipt text-4xl mb-3 block text-[var(--muted)] opacity-60"></i>
                  <p className="text-[15px] font-medium text-[var(--text)] mb-1">
                    {orderSearch ? t('No orders match your search.') : t('No orders found for this status.')}
                  </p>
                  {(orderSearch || filterStatus !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearch('');
                        setFilterStatus('ALL');
                      }}
                      className="mt-4 px-5 py-2 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold hover:brightness-110 transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <i className="ph ph-arrow-counter-clockwise"></i>
                      {t('Reset Filters & Show All Orders')}
                    </button>
                  )}
                </div>
              ) : (
                filteredOrders.map(order => (
                  <div
                    key={order.id}
                    id={`order-${order.order_number}`}
                    className={`bg-surface-2 rounded-[18px] p-5 flex flex-col justify-between transition-all duration-500 ${
                      highlightOrder === order.order_number
                        ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl scale-[1.01]'
                        : 'border border-[var(--border)]'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[20px] font-display font-bold text-[var(--text)]">#{order.order_number}</span>
                          <span className="block text-[12px] text-[var(--muted)] mt-1">{new Date(order.created_at).toLocaleTimeString(locale)}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase ${STATUS_BADGE[order.status] || 'bg-surface text-[var(--muted)] border border-[var(--border)]'}`}>
                          {t(STATUS_LABELS[order.status] || order.status)}
                        </span>
                      </div>
                      
                      <div className="text-[14px] text-[var(--muted)] mb-4 space-y-1">
                        <p><strong className="text-[var(--text)]">{t('Type:')}</strong> {t(order.order_type, order.order_type)} {order.table_number && `(${t('Table')} ${order.table_number})`}</p>
                        <p><strong className="text-[var(--text)]">{t('Customer:')}</strong> {order.contact_name}</p>
                        <p><strong className="text-[var(--text)]">{t('Phone:')}</strong> {order.contact_phone}</p>
                        <p className="pt-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                              isOrderPaid(order)
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                                : order.status === 'PENDING_PAYMENT'
                                  ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
                                  : 'bg-surface text-[var(--muted)] border border-[var(--border)]'
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
                          <p className="text-[12px] text-red-700 dark:text-red-300/90">
                            Last attempt: {order.latest_payment.failure_reason}
                          </p>
                        )}                      </div>

                      <div className="space-y-2 mb-4">
                        <p className="text-[12px] uppercase text-[var(--muted)] font-bold tracking-wider">{t('Items')}</p>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-3 text-[14.5px] border-b border-[var(--border)]/50 pb-2">
                            <span>
                              {item.quantity}x {tItem(item.item_name)}
                              {item.variant_name && (
                                <span className="text-[12px] text-amber-600 dark:text-amber-400"> ({item.variant_name})</span>
                              )}
                              {item.add_ons && item.add_ons.length > 0 && (
                                <span className="block text-[11px] text-[var(--muted)]">
                                  + {item.add_ons.map(a => a.add_on_name).join(', ')}
                                </span>
                              )}
                              <span className="text-[12px] text-[var(--muted)]">
                                {item.temperature && item.temperature !== 'Hot' ? item.temperature : ''}
                                {item.milk_choice && item.milk_choice !== 'None' ? ` ${item.milk_choice}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0">{item.subtotal_etb} {birr}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between text-[16px] font-bold text-[var(--accent)] mb-6">
                        <span>{t('Total:')}</span>
                        <span>{order.total_amount_etb} {birr}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {order.status === 'PENDING_PAYMENT' && (
                        <div className="flex gap-2">
                          <div className="flex-1 h-10 rounded-[12px] bg-red-100 border border-red-300 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300 text-[13px] font-semibold flex items-center justify-center px-3 text-center">
                            {t('Unpaid — waiting on the customer')}
                          </div>
                          <button onClick={() => handleUpdateStatus(order.id, 'CANCELLED', 'Customer never completed payment.')} className="h-10 rounded-[12px] border border-red-300 text-red-700 hover:bg-red-100 dark:border-red-900 dark:text-red-400 font-bold text-[13px] px-4 dark:hover:bg-red-950">{t('Cancel')}</button>
                        </div>
                      )}
                      {order.status === 'PLACED' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateStatus(order.id, 'ACCEPTED')} className="flex-1 h-10 rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-[13px] hover:brightness-110">{t('Accept Order')}</button>
                          <button onClick={() => handleUpdateStatus(order.id, 'REJECTED', 'Rejected by manager.')} className="flex-1 h-10 rounded-[12px] border border-red-300 text-red-700 hover:bg-red-100 dark:border-red-900 dark:text-red-400 font-bold text-[13px] dark:hover:bg-red-950">{t('Reject')}</button>
                        </div>
                      )}
                      {order.status === 'ACCEPTED' && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="text-[12px] text-[var(--muted)] shrink-0" htmlFor={`prep-${order.id}`}>
                              {t('Ready in')}
                            </label>
                            <input
                              id={`prep-${order.id}`}
                              type="number"
                              min={1}
                              max={240}
                              defaultValue={order.estimated_prep_minutes ?? DEFAULT_PREP_MINUTES[order.order_type] ?? 20}
                              onBlur={(e) => handleSetPrepTime(order.id, Number(e.target.value))}
                              className="flex-1 h-9 px-3 rounded-[12px] bg-surface-2 border border-[var(--border)] text-[var(--text)] text-[13px] focus:border-[var(--accent)] focus:outline-none"
                            />
                            <span className="text-[12px] text-[var(--muted)]">{t('min')}</span>
                          </div>
                          <button onClick={() => handleUpdateStatus(order.id, 'PREPARING')} className="w-full h-10 rounded-[12px] bg-blue-100 border border-blue-300 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300 font-bold text-[13px] dark:hover:bg-blue-900/60">{t('Start Preparing')}</button>
                        </>
                      )}
                      {order.status === 'PREPARING' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'READY')} className="w-full h-10 rounded-[12px] bg-blue-100 border border-blue-300 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300 font-bold text-[13px] dark:hover:bg-blue-900/60">{t('Mark Ready')}</button>
                      )}
                      {order.status === 'READY' && order.order_type === 'DELIVERY' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'OUT_FOR_DELIVERY')} className="w-full h-10 rounded-[12px] bg-purple-100 border border-purple-300 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:border-purple-800 dark:text-purple-300 font-bold text-[13px] dark:hover:bg-purple-900/60">{t('Send for Delivery')}</button>
                      )}
                      {order.status === 'READY' && (order.order_type === 'DINE_IN' || order.order_type === 'PICKUP') && (
                        <button onClick={() => handleUpdateStatus(order.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-100 border border-green-300 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:border-green-800 dark:text-green-300 font-bold text-[13px] dark:hover:bg-green-900/60">{t('Complete Order')}</button>
                      )}
                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-100 border border-green-300 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:border-green-800 dark:text-green-300 font-bold text-[13px] dark:hover:bg-green-900/60">{t('Mark Delivered')}</button>
                      )}
                      {isOrderPaid(order) ? (
                        <button onClick={() => setSelectedReceiptOrder(order)} className="w-full h-9 rounded-[12px] border border-[var(--border)] text-[var(--muted)] font-semibold text-[13px] hover:border-[var(--accent)] hover:text-[var(--accent)]">{t('View Receipt')}</button>
                      ) : (
                        <span className="w-full h-9 rounded-[12px] border border-[var(--border)]/60 text-[var(--muted)] font-semibold text-[13px] flex items-center justify-center cursor-not-allowed" title={t('Receipts are issued only after payment')}>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
              <div>
                <h2 className="font-display text-[26px] text-[var(--text)]">{t('Menu Management')}</h2>
                <p className="text-[13px] text-[var(--muted)] mt-0.5">
                  {t('Add, edit, change prices, photos, and availability of all items.', 'ሁሉንም የምርት ዝርዝሮች፣ ዋጋዎች፣ ፎቶዎች እና መገኘታቸውን ያስተዳድሩ።')}
                </p>
              </div>
              <button
                onClick={handleOpenAddItem}
                className="h-10 px-5 rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-[13.5px] flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-sm shrink-0"
              >
                <i className="ph ph-plus-circle text-lg"></i>
                <span>{t('Add Menu Item')}</span>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <i className="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-lg"></i>
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder={t('Search menu...')}
                  className="w-full h-10 pl-10 pr-4 rounded-[12px] bg-surface-2 border border-[var(--border)] text-[var(--text)] text-[14px] placeholder-[var(--muted)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                />
                {menuSearch && (
                  <button
                    onClick={() => setMenuSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <i className="ph ph-x text-sm"></i>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[var(--muted)] shrink-0 hidden md:inline">{t('Category')}:</span>
                <select
                  value={menuCategoryFilter}
                  onChange={(e) => setMenuCategoryFilter(e.target.value)}
                  className="h-10 px-3 rounded-[12px] bg-surface-2 border border-[var(--border)] text-[var(--text)] text-[13.5px] focus:border-[var(--accent)] focus:outline-none"
                >
                  <option value="ALL">{t('All Categories')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {tCategory(c.name)}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] font-mono text-[var(--muted)] bg-surface px-2.5 py-1.5 rounded-lg border border-[var(--border)] shrink-0">
                  {menuItems.filter(item => {
                    const matchesCategory = menuCategoryFilter === 'ALL' || item.category_slug === menuCategoryFilter || (item.category && typeof item.category === 'object' && item.category.slug === menuCategoryFilter);
                    const matchesSearch = !menuSearch || item.name.toLowerCase().includes(menuSearch.toLowerCase()) || (item.description && item.description.toLowerCase().includes(menuSearch.toLowerCase()));
                    return matchesCategory && matchesSearch;
                  }).length} {t('Items')}
                </span>
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {menuItems
                .filter(item => {
                  const matchesCategory = menuCategoryFilter === 'ALL' || item.category_slug === menuCategoryFilter || (item.category && typeof item.category === 'object' && item.category.slug === menuCategoryFilter);
                  const matchesSearch = !menuSearch || item.name.toLowerCase().includes(menuSearch.toLowerCase()) || (item.description && item.description.toLowerCase().includes(menuSearch.toLowerCase()));
                  return matchesCategory && matchesSearch;
                })
                .map(item => {
                  const itemImg = item.image_display || item.image_url;
                  return (
                    <div
                      key={item.id}
                      className={`bg-surface-2 border rounded-[20px] overflow-hidden flex flex-col justify-between transition-all hover:shadow-md ${
                        item.is_available ? 'border-[var(--border)]' : 'border-red-300 dark:border-red-900/50 opacity-75'
                      }`}
                    >
                      {/* Image Header with Badge Overlay */}
                      <div className="relative h-40 bg-[var(--surface)] overflow-hidden flex items-center justify-center">
                        {itemImg ? (
                          <img
                            src={itemImg}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)]/50 bg-[var(--accent-soft)]/20">
                            <i className="ph ph-coffee text-4xl mb-1"></i>
                            <span className="text-[11px] font-mono">No Image</span>
                          </div>
                        )}
                        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide uppercase bg-black/60 text-white backdrop-blur-sm">
                            {tCategory(item.category_name || (item.category && typeof item.category === 'object' ? item.category.name : ''))}
                          </span>
                          {item.is_signature && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide uppercase bg-amber-500/90 text-white backdrop-blur-sm flex items-center gap-1">
                              <i className="ph ph-star-fill text-[9px]"></i> {t('Signature Item')}
                            </span>
                          )}
                        </div>
                        <div className="absolute top-2.5 right-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide uppercase backdrop-blur-sm ${
                              item.is_available
                                ? 'bg-emerald-600/90 text-white'
                                : 'bg-red-600/90 text-white'
                            }`}
                          >
                            {item.is_available ? t('Available') : t('Sold Out')}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <h4 className="font-display text-[18px] text-[var(--text)] leading-snug line-clamp-1">
                              {tItem(item.name)}
                            </h4>
                            <span className="text-[16px] text-[var(--accent)] font-bold shrink-0">
                              {Number(item.price ?? item.base_price_etb ?? 0).toFixed(2)} {birr}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[12.5px] text-[var(--muted)] line-clamp-2 leading-relaxed mb-3">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="pt-3 border-t border-[var(--border)]/60 flex items-center gap-2 mt-auto">
                          <button
                            onClick={() => toggleMenuItemAvailability(item)}
                            className={`flex-1 h-9 rounded-[10px] text-[12px] font-bold border transition-colors ${
                              item.is_available
                                ? 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)]'
                                : 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:border-red-900/80 dark:text-red-400'
                            }`}
                            title={item.is_available ? 'Click to mark as Sold Out' : 'Click to mark as Available'}
                          >
                            {item.is_available ? t('Available') : t('Sold Out')}
                          </button>
                          <button
                            onClick={() => handleOpenEditItem(item)}
                            className="w-9 h-9 rounded-[10px] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center justify-center transition-colors shrink-0"
                            title={t('Edit Menu Item')}
                          >
                            <i className="ph ph-pencil-simple text-[16px]"></i>
                          </button>
                          <button
                            onClick={() => setDeleteConfirmItem(item)}
                            className="w-9 h-9 rounded-[10px] border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 flex items-center justify-center transition-colors shrink-0"
                            title={t('Delete Menu Item')}
                          >
                            <i className="ph ph-trash text-[16px]"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* RESERVATIONS TAB */}
        {activeTab === 'reservations' && (
          <div className="animate-fade-in space-y-6">
            <h2 className="font-display text-[24px] text-[var(--text)] mb-6">{t('Table Reservations')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reservations.length === 0 ? (
                <div className="col-span-full py-12 text-center text-[var(--muted)] bg-surface-2 border border-[var(--border)] rounded-[18px]">
                  {t('No table reservations found.')}
                </div>
              ) : (
                reservations.map(reservation => (
                  <div
                    key={reservation.id}
                    id={`res-${reservation.order_code || reservation.id}`}
                    className={`bg-surface-2 rounded-[18px] p-5 flex flex-col justify-between transition-all duration-500 ${
                      highlightRes && (highlightRes === reservation.order_code || highlightRes === String(reservation.id))
                        ? 'border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/30 shadow-2xl scale-[1.01]'
                        : 'border border-[var(--border)]'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[20px] font-display font-bold text-[var(--text)]">{reservation.name}</span>
                          <span className="block text-[11px] font-mono text-[var(--muted)] mt-0.5 tracking-wide">{reservation.order_code || `#${reservation.id}`}</span>
                          <span className="block text-[12px] text-[var(--muted)] mt-1">{t('Booked on')} {new Date(reservation.created_at).toLocaleDateString(locale)}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase ${
                          reservation.status === 'PENDING' ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800' :
                          reservation.status === 'CONFIRMED' ? 'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-800' :
                          reservation.status === 'COMPLETED' ? 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/50 dark:text-green-400 dark:border-green-800' :
                          'bg-surface text-[var(--muted)] border border-[var(--border)]'
                        }`}>
                          {t(reservation.status)}
                        </span>
                      </div>
                      
                      <div className="text-[14px] text-[var(--muted)] mb-4 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p><strong className="text-[var(--text)]">{t('Date & Time:')}</strong> {new Date(reservation.date_time).toLocaleString(locale)}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] font-medium">
                            🇪🇹 {formatEthiopianTime(reservation.date_time, language)}
                          </span>
                        </div>
                        <p><strong className="text-[var(--text)]">{t('Party Size:')}</strong> {reservation.party_size} {t('people')}</p>
                        <p><strong className="text-[var(--text)]">{t('Phone:')}</strong> {reservation.contact_phone || t('N/A')}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {reservation.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateReservationStatus(reservation.id, 'CONFIRMED')} className="flex-1 h-10 rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-[13px] hover:brightness-110">{t('Confirm')}</button>
                          <button onClick={() => handleUpdateReservationStatus(reservation.id, 'CANCELLED')} className="flex-1 h-10 rounded-[12px] border border-red-300 text-red-700 hover:bg-red-100 dark:border-red-900 dark:text-red-400 font-bold text-[13px] dark:hover:bg-red-950">{t('Cancel')}</button>
                        </div>
                      )}
                      {reservation.status === 'CONFIRMED' && (
                        <button onClick={() => handleUpdateReservationStatus(reservation.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-100 border border-green-300 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:border-green-800 dark:text-green-300 font-bold text-[13px] dark:hover:bg-green-900/60">{t('Mark Completed')}</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="animate-fade-in space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-[26px] text-[var(--text)] leading-tight">{t('Reports & Analytics')}</h2>
                <p className="text-[var(--muted)] text-[14px]">
                  {t('Comprehensive sales summaries, top sellers, peak hours, and order breakdowns.')}
                </p>
              </div>

              {/* Action Buttons: Filter & CSV */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Range Selector */}
                <div className="flex items-center bg-surface-2 border border-[var(--border)] rounded-[12px] p-1 text-[13px]">
                  {(['7d', '30d', '90d'] as const).map(rng => (
                    <button
                      key={rng}
                      onClick={() => setReportRange(rng)}
                      className={`px-3 py-1.5 rounded-[8px] font-semibold transition-colors ${
                        reportRange === rng ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {rng === '7d' ? t('Last 7 Days') : rng === '30d' ? t('Last 30 Days') : t('Last 90 Days')}
                    </button>
                  ))}
                </div>

                {/* Order Type Filter */}
                <select
                  value={reportOrderType}
                  onChange={(e) => setReportOrderType(e.target.value)}
                  className="bg-surface-2 border border-[var(--border)] rounded-[12px] px-3 py-2 text-[13.5px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="ALL">{t('All Types')}</option>
                  <option value="DELIVERY">{t('Delivery')}</option>
                  <option value="PICKUP">{t('Pickup')}</option>
                  <option value="DINE_IN">{t('Dine-In')}</option>
                </select>

                {/* CSV Export Button */}
                <button
                  onClick={handleExportCsv}
                  className="h-10 px-4 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] font-bold text-[13.5px] hover:brightness-110 flex items-center gap-2 transition-all shadow-sm"
                >
                  <i className="ph ph-download-simple text-lg"></i>
                  {t('Export CSV')}
                </button>
              </div>
            </div>

            {isLoadingReport ? (
              <div className="py-20 flex flex-col items-center justify-center text-[var(--muted)]">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
                <span>{t('Compiling report data…')}</span>
              </div>
            ) : !reportData ? (
              <div className="py-12 text-center text-[var(--muted)] bg-surface-2 border border-[var(--border)] rounded-[18px]">
                {t('No report data available.')}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-surface-2 border border-[var(--border)] rounded-[16px] p-5">
                    <span className="text-[13px] text-[var(--muted)] uppercase tracking-wider">{t('Total Revenue')}</span>
                    <div className="mt-2 text-[26px] font-display font-bold text-[var(--accent)]">
                      {reportData.summary.revenue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {birr}
                    </div>
                    <span className="text-[12px] text-[var(--muted)] mt-1 block">
                      {reportData.summary.completed_orders} {t('completed')} / {reportData.summary.orders} {t('orders')}
                    </span>
                  </div>

                  <div className="bg-surface-2 border border-[var(--border)] rounded-[16px] p-5">
                    <span className="text-[13px] text-[var(--muted)] uppercase tracking-wider">{t('Total Orders')}</span>
                    <div className="mt-2 text-[26px] font-display font-bold text-[var(--text)]">
                      {reportData.summary.orders}
                    </div>
                    <span className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-1 block">
                      {reportData.summary.completed_orders} {t('served to customers')}
                    </span>
                  </div>

                  <div className="bg-surface-2 border border-[var(--border)] rounded-[16px] p-5">
                    <span className="text-[13px] text-[var(--muted)] uppercase tracking-wider">{t('Average Order Value')}</span>
                    <div className="mt-2 text-[26px] font-display font-bold text-[var(--text)]">
                      {reportData.summary.average_order_value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {birr}
                    </div>
                    <span className="text-[12px] text-[var(--muted)] mt-1 block">
                      {t('Per paid checkout')}
                    </span>
                  </div>

                  <div className="bg-surface-2 border border-[var(--border)] rounded-[16px] p-5">
                    <span className="text-[13px] text-[var(--muted)] uppercase tracking-wider">{t('Delivery Fees')}</span>
                    <div className="mt-2 text-[26px] font-display font-bold text-[var(--text)]">
                      {reportData.summary.delivery_fees.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {birr}
                    </div>
                    <span className="text-[12px] text-[var(--muted)] mt-1 block">
                      {t('Collected from zone deliveries')}
                    </span>
                  </div>
                </div>

                {/* Unpaid & Expired Metrics Bar */}
                <div className="bg-surface-2 border border-[var(--border)] rounded-[16px] p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <i className="ph ph-warning-circle text-amber-500 text-lg"></i>
                    <span className="text-[var(--muted)]">
                      <strong className="text-[var(--text)]">{t('Awaiting Payment:')}</strong> {reportData.unpaid.awaiting_payment} {t('orders')} ({reportData.unpaid.awaiting_payment_value.toFixed(2)} {birr})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ph ph-clock-countdown text-red-500 text-lg"></i>
                    <span className="text-[var(--muted)]">
                      <strong className="text-[var(--text)]">{t('Expired Orders (30d):')}</strong> {reportData.unpaid.expired_last_30_days} {t('unpaid orders expired')}
                    </span>
                  </div>
                </div>

                {/* Two Column Layout: Top Items & Order Type Split */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Items */}
                  <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-[20px] text-[var(--text)] flex items-center gap-2">
                        <i className="ph ph-trophy text-[var(--accent)]"></i>
                        {t('Top Selling Items')}
                      </h3>
                      <span className="text-xs text-[var(--muted)]">{t('Ranked by revenue')}</span>
                    </div>
                    {reportData.top_items.length === 0 ? (
                      <p className="text-sm text-[var(--muted)] py-8 text-center">{t('No item sales in this period.')}</p>
                    ) : (
                      <div className="divide-y divide-[var(--border)]">
                        {reportData.top_items.map((item, idx) => (
                          <div key={idx} className="py-3 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="w-6 text-center font-bold text-[var(--accent)] text-xs">#{idx + 1}</span>
                              <div>
                                <p className="font-semibold text-[var(--text)]">{tItem(item.item_name)}</p>
                                <p className="text-xs text-[var(--muted)]">
                                  {item.quantity} {t('sold')} • {item.orders} {t('orders')}
                                </p>
                              </div>
                            </div>
                            <span className="font-bold text-[var(--accent)]">
                              {item.revenue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {birr}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Order Type Distribution */}
                  <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display text-[20px] text-[var(--text)] flex items-center gap-2">
                          <i className="ph ph-chart-pie text-[var(--accent)]"></i>
                          {t('Order Type Split')}
                        </h3>
                        <span className="text-xs text-[var(--muted)]">{t('Volume & share')}</span>
                      </div>
                      <div className="space-y-4">
                        {reportData.order_types.map((ot) => (
                          <div key={ot.order_type} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold text-[var(--text)]">{t(ot.label || ot.order_type)}</span>
                              <span className="text-[var(--muted)]">
                                {ot.orders} {t('orders')} ({(ot.share * 100).toFixed(1)}%) • {ot.revenue.toFixed(2)} {birr}
                              </span>
                            </div>
                            <div className="w-full bg-surface border border-[var(--border)] h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-[var(--accent)] h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(0, ot.share * 100))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Busiest Peak Hour Highlight */}
                    <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center justify-between">
                      <span className="text-sm text-[var(--muted)] flex items-center gap-2">
                        <i className="ph ph-clock text-amber-500 text-base"></i>
                        {t('Busiest Hour:')}
                      </span>
                      <span className="text-base font-bold text-amber-600 dark:text-amber-300">
                        {reportData.peak_hours.busiest_hour !== null
                          ? `${String(reportData.peak_hours.busiest_hour).padStart(2, '0')}:00 - ${String(
                              (reportData.peak_hours.busiest_hour + 1) % 24
                            ).padStart(2, '0')}:00`
                          : t('N/A')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Peak Hours Hourly Chart */}
                <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-[20px] text-[var(--text)] flex items-center gap-2">
                      <i className="ph ph-sun-horizon text-[var(--accent)]"></i>
                      {t('Peak Hours')} (24h)
                    </h3>
                    <span className="text-xs text-[var(--muted)]">{t('Order frequency across hours')}</span>
                  </div>
                  <div className="grid grid-cols-12 md:grid-cols-24 gap-1 items-end h-32 pt-4">
                    {reportData.peak_hours.hours.map((h) => {
                      const maxOrders = Math.max(
                        1,
                        ...reportData.peak_hours.hours.map((x) => x.orders)
                      );
                      const heightPercent = Math.max(4, (h.orders / maxOrders) * 100);
                      const isBusiest = reportData.peak_hours.busiest_hour === h.hour && h.orders > 0;
                      return (
                        <div key={h.hour} className="flex flex-col items-center h-full justify-end group relative">
                          <div
                            className={`w-full rounded-t transition-all ${
                              isBusiest
                                ? 'bg-amber-400'
                                : h.orders > 0
                                ? 'bg-[var(--accent)] hover:brightness-110'
                                : 'bg-surface border border-[var(--border)]'
                            }`}
                            style={{ height: `${heightPercent}%` }}
                            title={`${h.hour}:00 - ${h.orders} orders (${h.revenue.toFixed(2)} ${birr})`}
                          />
                          <span className="text-[10px] text-[var(--muted)] mt-1 hidden md:block">
                            {h.hour % 3 === 0 ? h.hour : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Daily Breakdown */}
                <div className="bg-surface-2 border border-[var(--border)] rounded-[18px] p-6">
                  <h3 className="font-display text-[20px] text-[var(--text)] mb-4 flex items-center gap-2">
                    <i className="ph ph-calendar text-[var(--accent)]"></i>
                    {t('Daily Sales Breakdown')}
                  </h3>
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
                    {reportData.summary.daily.slice().reverse().map((d) => (
                      <div
                        key={d.day}
                        className="flex items-center justify-between p-3 rounded-[12px] bg-surface border border-[var(--border)]/50 text-sm"
                      >
                        <span className="font-semibold text-[var(--text)]">{d.day}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-[var(--muted)]">{d.orders} {t('orders')}</span>
                          <span className="font-bold text-[var(--accent)]">
                            {d.revenue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {birr}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CAFE & BRANCHES TAB */}
        {activeTab === 'cafe' && (
          <div className="animate-fade-in space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
              <div>
                <h2 className="font-display text-[26px] text-[var(--text)]">{t('Cafe & Branches')}</h2>
                <p className="text-[13px] text-[var(--muted)] mt-0.5">
                  {t('Manage cafe brand identity, contact information, hours, and branch locations.', 'የካፌውን መጠሪያ፣ የመገናኛ መረጃዎችን፣ የሥራ ሰዓትና ቅርንጫፎችን ያስተዳድሩ።')}
                </p>
              </div>
              <button
                onClick={handleOpenAddBranch}
                className="h-10 px-5 rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-[13.5px] flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-sm shrink-0"
              >
                <i className="ph ph-plus-circle text-lg"></i>
                <span>{t('Add Branch')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* BRAND SETTINGS FORM */}
              <div className="lg:col-span-5 bg-surface-2 border border-[var(--border)] rounded-[20px] p-6 shadow-sm">
                <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--border)] mb-5">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                    <i className="ph ph-coffee-bean text-lg"></i>
                  </div>
                  <h3 className="font-display text-[19px] text-[var(--text)]">{t('Cafe Identity & Settings')}</h3>
                </div>

                <form onSubmit={handleSaveBrandSettings} className="space-y-4">
                  <div>
                    <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                      {t('Cafe Name')}
                    </label>
                    <input
                      type="text"
                      required
                      value={brandForm.cafe_name}
                      onChange={(e) => setBrandForm({ ...brandForm, cafe_name: e.target.value })}
                      placeholder="Buna Hub"
                      className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14.5px] font-semibold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                      {t('Tagline')}
                    </label>
                    <input
                      type="text"
                      value={brandForm.tagline}
                      onChange={(e) => setBrandForm({ ...brandForm, tagline: e.target.value })}
                      placeholder="Artisanal Reserve"
                      className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                        {t('Primary Phone')}
                      </label>
                      <EthiopianPhoneInput
                        value={brandForm.primary_phone}
                        onChange={(val) => setBrandForm({ ...brandForm, primary_phone: val })}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                        {t('Contact Email')}
                      </label>
                      <input
                        type="email"
                        value={brandForm.contact_email}
                        onChange={(e) => setBrandForm({ ...brandForm, contact_email: e.target.value })}
                        placeholder="selam@bunahub.et"
                        className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                        {t('Opening Hours')}
                      </label>
                      <input
                        type="text"
                        value={brandForm.opening_hours}
                        onChange={(e) => setBrandForm({ ...brandForm, opening_hours: e.target.value })}
                        placeholder="1:00 – 3:00"
                        className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] font-mono focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                        {t('Ceremony Time')}
                      </label>
                      <input
                        type="text"
                        value={brandForm.ceremony_time}
                        onChange={(e) => setBrandForm({ ...brandForm, ceremony_time: e.target.value })}
                        placeholder="9:00 (ከቀኑ 9:00)"
                        className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                      {t('Cafe Description')}
                    </label>
                    <textarea
                      rows={3}
                      value={brandForm.description}
                      onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                      placeholder="An Ethiopian coffee house in Piassa..."
                      className="w-full p-3.5 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] leading-relaxed focus:border-[var(--accent)] focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="w-full h-11 rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-[14px] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {isSavingSettings ? (
                      <>
                        <i className="ph ph-spinner animate-spin"></i>
                        <span>{t('Saving...')}</span>
                      </>
                    ) : (
                      <>
                        <i className="ph ph-floppy-disk text-lg"></i>
                        <span>{t('Save Settings')}</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* BRANCHES LIST */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                      <i className="ph ph-map-pin text-lg"></i>
                    </div>
                    <h3 className="font-display text-[19px] text-[var(--text)]">{t('Branches & Locations')}</h3>
                  </div>
                  <span className="text-[12px] font-mono text-[var(--muted)] bg-surface px-2.5 py-1 rounded-full border border-[var(--border)]">
                    {cafeLocations.length} {t('Locations')}
                  </span>
                </div>

                <div className="space-y-4">
                  {cafeLocations.map((loc) => (
                    <div
                      key={loc.id}
                      className={`bg-surface-2 border rounded-[18px] p-5 transition-all ${
                        loc.is_primary ? 'border-[var(--accent)] shadow-sm' : 'border-[var(--border)]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-display text-[19px] text-[var(--text)]">{loc.name}</h4>
                          {loc.is_primary && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[var(--accent)] text-[var(--accent-contrast)]">
                              {t('Primary Location')}
                            </span>
                          )}
                          {!loc.is_active && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-900">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!loc.is_primary && (
                            <button
                              onClick={() => handleSetPrimaryBranch(loc)}
                              className="h-8 px-3 rounded-[10px] border border-[var(--border)] text-[12px] font-bold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                            >
                              {t('Make Primary')}
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditBranch(loc)}
                            className="w-8 h-8 rounded-[10px] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] flex items-center justify-center transition-colors"
                            title={t('Edit Branch')}
                          >
                            <i className="ph ph-pencil-simple text-sm"></i>
                          </button>
                          {cafeLocations.length > 1 && (
                            <button
                              onClick={() => setDeleteConfirmLocation(loc)}
                              className="w-8 h-8 rounded-[10px] border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 flex items-center justify-center transition-colors"
                              title={t('Delete Branch')}
                            >
                              <i className="ph ph-trash text-sm"></i>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[13.5px] text-[var(--muted)]">
                        <div className="flex items-center gap-2">
                          <i className="ph ph-map-pin text-[var(--accent)] text-[16px] shrink-0"></i>
                          <span>{loc.address}, {loc.city}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <i className="ph ph-clock text-[var(--accent)] text-[16px] shrink-0"></i>
                          <span className="font-mono">{loc.opening_hours || '1:00 – 3:00'}</span>
                        </div>
                        {loc.phone && (
                          <div className="flex items-center gap-2">
                            <i className="ph ph-phone text-[var(--accent)] text-[16px] shrink-0"></i>
                            <span>{loc.phone}</span>
                          </div>
                        )}
                        {loc.email && (
                          <div className="flex items-center gap-2">
                            <i className="ph ph-envelope text-[var(--accent)] text-[16px] shrink-0"></i>
                            <span>{loc.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MENU ITEM ADD / EDIT MODAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-2 border border-[var(--border)] rounded-[22px] max-w-lg w-full p-6 shadow-2xl space-y-4 my-8 text-[var(--text)] animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="font-display text-[20px] text-[var(--text)]">
                {editingItem ? t('Edit Menu Item') : t('Add Menu Item')}
              </h3>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <i className="ph ph-x"></i>
              </button>
            </div>

            <form onSubmit={handleSaveMenuItem} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                  {t('Item Name')} *
                </label>
                <input
                  type="text"
                  required
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="e.g. Buna Spiced Latte"
                  className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14.5px] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    {t('Category')} *
                  </label>
                  <select
                    required
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                    className="w-full h-11 px-3 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {tCategory(c.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    {t('Price (ETB)')} *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    placeholder="120.00"
                    className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14.5px] font-mono focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </div>

              {/* IMAGE SELECTION (File Upload or URL Link) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider">
                    {t('Item Image')}
                  </label>
                  {/* Mode Tabs */}
                  <div className="flex rounded-full bg-surface p-0.5 border border-[var(--border)] text-xs">
                    <button
                      type="button"
                      onClick={() => setImageInputMode('upload')}
                      className={`px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 ${
                        imageInputMode === 'upload'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <i className="ph ph-upload-simple"></i>
                      <span>{t('Upload File')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageInputMode('url')}
                      className={`px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 ${
                        imageInputMode === 'url'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <i className="ph ph-link"></i>
                      <span>{t('Image Link (URL)')}</span>
                    </button>
                  </div>
                </div>

                {/* Upload File Mode */}
                {imageInputMode === 'upload' && (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleImageFileChange}
                    />

                    {itemImagePreview && !clearExistingImage ? (
                      <div className="relative rounded-[14px] overflow-hidden border border-[var(--border)] bg-surface p-3 flex items-center gap-3">
                        <div className="w-16 h-16 rounded-[10px] overflow-hidden bg-black/20 shrink-0 border border-[var(--border)]">
                          <img
                            src={itemImagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/placeholder.jpg';
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--text)] truncate">
                            {itemImageFile ? itemImageFile.name : (editingItem ? t('Current Item Photo') : t('Selected Photo'))}
                          </p>
                          {itemImageFile && (
                            <p className="text-[11px] text-[var(--muted)] mt-0.5">
                              {(itemImageFile.size / 1024).toFixed(1)} KB
                            </p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11.5px] font-medium text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
                            >
                              <i className="ph ph-arrows-clockwise text-xs"></i>
                              <span>{t('Change Image')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleRemoveImage}
                              className="px-2.5 py-1 rounded-lg border border-red-500/20 text-[11.5px] font-medium text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                            >
                              <i className="ph ph-trash text-xs"></i>
                              <span>{t('Remove Image')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleDropImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-[14px] border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] bg-surface/40 hover:bg-surface p-5 text-center cursor-pointer transition-all duration-200 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                          <i className="ph ph-cloud-arrow-up text-xl"></i>
                        </div>
                        <p className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {t('Drop image here or click to browse')}
                        </p>
                        <p className="text-[11px] text-[var(--muted)] mt-1">
                          {t('Supports JPG, PNG, WEBP up to 5MB')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* URL Link Mode */}
                {imageInputMode === 'url' && (
                  <div className="space-y-2">
                    <div className="relative">
                      <i className="ph ph-link absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[15px]"></i>
                      <input
                        type="url"
                        value={itemForm.image_url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemForm({ ...itemForm, image_url: val });
                          setItemImagePreview(val || null);
                          setClearExistingImage(!val);
                        }}
                        placeholder="https://images.unsplash.com/photo-..."
                        className="w-full h-11 pl-9 pr-9 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[13.5px] focus:border-[var(--accent)] focus:outline-none"
                      />
                      {itemForm.image_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setItemForm({ ...itemForm, image_url: '' });
                            setItemImagePreview(null);
                            setClearExistingImage(true);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] text-xs"
                        >
                          <i className="ph ph-x"></i>
                        </button>
                      )}
                    </div>
                    {itemForm.image_url && (
                      <div className="h-28 rounded-[12px] overflow-hidden border border-[var(--border)] bg-surface relative">
                        <img
                          src={itemForm.image_url}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                  {t('Description')}
                </label>
                <textarea
                  rows={3}
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Tasting notes, brewing method, ingredients..."
                  className="w-full p-3.5 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] leading-relaxed focus:border-[var(--accent)] focus:outline-none resize-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-[14px] font-medium text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={itemForm.is_available}
                    onChange={(e) => setItemForm({ ...itemForm, is_available: e.target.checked })}
                    className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer"
                  />
                  <span>{t('Is Available')}</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[14px] font-medium text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={itemForm.is_signature}
                    onChange={(e) => setItemForm({ ...itemForm, is_signature: e.target.checked })}
                    className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer"
                  />
                  <span className="flex items-center gap-1">
                    <i className="ph ph-star-fill text-amber-500 text-sm"></i>
                    {t('Signature Item')}
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="flex-1 h-11 rounded-[12px] border border-[var(--border)] text-[var(--muted)] font-semibold text-[14px] hover:text-[var(--text)] transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="flex-1 h-11 rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-[14px] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isSavingItem ? (
                    <>
                      <i className="ph ph-spinner animate-spin"></i>
                      <span>{t('Saving...')}</span>
                    </>
                  ) : (
                    <span>{t('Save Item')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MENU ITEM DELETE CONFIRM MODAL */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-2 border border-red-300 dark:border-red-900/60 rounded-[22px] max-w-sm w-full p-6 shadow-2xl space-y-4 text-center text-[var(--text)] animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto text-2xl">
              <i className="ph ph-warning-octagon"></i>
            </div>
            <div>
              <h3 className="font-display text-[20px] font-bold text-[var(--text)] mb-1">
                {t('Delete Menu Item')}
              </h3>
              <p className="text-[14px] text-[var(--muted)]">
                {t('Are you sure you want to delete this menu item?')}
              </p>
              <p className="font-display text-[17px] font-bold text-[var(--accent)] mt-2">
                {deleteConfirmItem.name}
              </p>
              <p className="text-[12px] text-red-500 dark:text-red-400 mt-1">
                {t('This action cannot be undone.')}
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="flex-1 h-10 rounded-[12px] border border-[var(--border)] text-[var(--muted)] font-semibold text-[13px] hover:text-[var(--text)] transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={handleDeleteMenuItem}
                className="flex-1 h-10 rounded-[12px] bg-red-600 text-white font-bold text-[13px] hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeletingItem ? t('Saving...') : t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BRANCH ADD / EDIT MODAL */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-2 border border-[var(--border)] rounded-[22px] max-w-lg w-full p-6 shadow-2xl space-y-4 my-8 text-[var(--text)] animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="font-display text-[20px] text-[var(--text)]">
                {editingLocation ? t('Edit Branch') : t('Add Branch')}
              </h3>
              <button
                onClick={() => setIsLocationModalOpen(false)}
                className="w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <i className="ph ph-x"></i>
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                  {t('Branch Name')} *
                </label>
                <input
                  type="text"
                  required
                  value={locationForm.name}
                  onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                  placeholder="e.g. Bole Medhanialem Branch"
                  className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14.5px] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                  {t('Address')} *
                </label>
                <input
                  type="text"
                  required
                  value={locationForm.address}
                  onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                  placeholder="e.g. Cameroon St, Next to Medhanialem Mall"
                  className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    {t('City')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={locationForm.city}
                    onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })}
                    placeholder="Addis Ababa"
                    className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    {t('Opening Hours')}
                  </label>
                  <input
                    type="text"
                    value={locationForm.opening_hours}
                    onChange={(e) => setLocationForm({ ...locationForm, opening_hours: e.target.value })}
                    placeholder="1:00 – 3:00"
                    className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] font-mono focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    {t('Phone')}
                  </label>
                  <EthiopianPhoneInput
                    value={locationForm.phone}
                    onChange={(val) => setLocationForm({ ...locationForm, phone: val })}
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-bold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                    {t('Email')}
                  </label>
                  <input
                    type="email"
                    value={locationForm.email}
                    onChange={(e) => setLocationForm({ ...locationForm, email: e.target.value })}
                    placeholder="bole@bunahub.et"
                    className="w-full h-11 px-4 rounded-[12px] bg-surface border border-[var(--border)] text-[var(--text)] text-[14px] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-[14px] font-medium text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={locationForm.is_primary}
                    onChange={(e) => setLocationForm({ ...locationForm, is_primary: e.target.checked })}
                    className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer"
                  />
                  <span>{t('Primary Branch')}</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[14px] font-medium text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={locationForm.is_active}
                    onChange={(e) => setLocationForm({ ...locationForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer"
                  />
                  <span>{t('Active Branch')}</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsLocationModalOpen(false)}
                  className="flex-1 h-11 rounded-[12px] border border-[var(--border)] text-[var(--muted)] font-semibold text-[14px] hover:text-[var(--text)] transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingLocation}
                  className="flex-1 h-11 rounded-[12px] bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-[14px] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isSavingLocation ? (
                    <>
                      <i className="ph ph-spinner animate-spin"></i>
                      <span>{t('Saving...')}</span>
                    </>
                  ) : (
                    <span>{t('Save Branch')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BRANCH DELETE CONFIRM MODAL */}
      {deleteConfirmLocation && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-2 border border-red-300 dark:border-red-900/60 rounded-[22px] max-w-sm w-full p-6 shadow-2xl space-y-4 text-center text-[var(--text)] animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto text-2xl">
              <i className="ph ph-warning-octagon"></i>
            </div>
            <div>
              <h3 className="font-display text-[20px] font-bold text-[var(--text)] mb-1">
                {t('Delete Branch')}
              </h3>
              <p className="text-[14px] text-[var(--muted)]">
                {t('Are you sure you want to delete this branch?')}
              </p>
              <p className="font-display text-[17px] font-bold text-[var(--accent)] mt-2">
                {deleteConfirmLocation.name}
              </p>
              <p className="text-[12px] text-red-500 dark:text-red-400 mt-1">
                {t('This action cannot be undone.')}
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmLocation(null)}
                className="flex-1 h-10 rounded-[12px] border border-[var(--border)] text-[var(--muted)] font-semibold text-[13px] hover:text-[var(--text)] transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={isDeletingLocation}
                onClick={handleDeleteBranch}
                className="flex-1 h-10 rounded-[12px] bg-red-600 text-white font-bold text-[13px] hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeletingLocation ? t('Saving...') : t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {selectedReceiptOrder && (
        <ReceiptModal
          onClose={() => setSelectedReceiptOrder(null)}
          order={selectedReceiptOrder}
        />
      )}
    </div>
  );
}

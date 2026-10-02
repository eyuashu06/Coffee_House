'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import PaymentModal from '../../components/PaymentModal';
import OrderTracker from '../../components/OrderTracker';
import ReceiptModal from '../../components/ReceiptModal';
import Link from 'next/link';

interface OrderItem {
  id: number;
  item_name: string;
  variant_name: string;
  unit_price_etb: string;
  quantity: number;
  subtotal_etb: string;
  temperature: string;
  milk_choice: string;
}

interface Order {
  id: number;
  order_number: string;
  order_type: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: string;
  total_amount_etb: string;
  status: string;
  created_at: string;
  items: OrderItem[];
}

interface Address {
  id: number;
  street_address: string;
  city: string;
  subcity_or_zone: string;
  is_default: boolean;
}

interface Banner {
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function AccountPage() {
  const { user, loading, checkAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'profile'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

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

  const fetchOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const res = await fetch('/api/v1/orders/', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.results || []);
        setOrders(list);
      }
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/addresses/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAddresses(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (e) {
      console.error('Failed to fetch addresses:', e);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setPhone(user.phone || '');
      fetchOrders();
      fetchAddresses();
    }
  }, [user, fetchOrders, fetchAddresses]);

  // ── Handle Chapa return URL ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const txRef = urlParams.get('tx_ref');
    const paymentStatus = urlParams.get('payment_status');
    const orderNum = urlParams.get('order');

    if (txRef) {
      // Clean the URL so refresh doesn't re-trigger
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      verifyPayment(txRef, orderNum);
    } else if (paymentStatus === 'success' || paymentStatus === 'completed') {
      setBanner({ type: 'success', message: `Payment successful! Order #${orderNum || ''} has been placed.` });
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyPayment = async (txRef: string, orderNum?: string | null) => {
    setBanner({ type: 'info', message: 'Verifying your payment with Chapa, please wait...' });
    try {
      const res = await fetch(`/api/v1/payments/verify/${txRef}/`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        const payStatus = data.payment?.status;
        const orderStatus = data.order_status;

        if (payStatus === 'SUCCESS' || orderStatus === 'PLACED') {
          setBanner({
            type: 'success',
            message: `✅ Payment verified! Order #${orderNum || ''} has been placed successfully.`,
          });
        } else if (payStatus === 'FAILED') {
          setBanner({
            type: 'error',
            message: `❌ Payment failed for Order #${orderNum || ''}. Please try again from My Orders.`,
          });
        } else if (payStatus === 'ABANDONED') {
          setBanner({
            type: 'error',
            message: `⚠️ Payment was cancelled for Order #${orderNum || ''}. You can retry from My Orders.`,
          });
        } else {
          // Still PENDING after verification
          setBanner({
            type: 'info',
            message: `⏳ Payment is being processed for Order #${orderNum || ''}. Refresh in a moment to see the update.`,
          });
        }

        // Always refresh orders after any verification attempt
        await fetchOrders();
      } else {
        setBanner({ type: 'error', message: 'Could not verify payment. Please refresh the page.' });
      }
    } catch (e) {
      console.error('Payment verification error:', e);
      setBanner({ type: 'error', message: 'Network error during payment verification.' });
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrMsg(null);
    try {
      const res = await fetch('/api/v1/addresses/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          street_address: streetAddress,
          city: 'Addis Ababa',
          subcity_or_zone: subcityOrZone,
          is_default: isDefaultAddr,
        }),
      });
      if (res.ok) {
        setAddrMsg('Address added successfully!');
        setStreetAddress('');
        setSubcityOrZone('');
        fetchAddresses();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Add address error:', errorData);
        setAddrMsg(`Failed to add address: ${JSON.stringify(errorData)}`);
      }
    } catch (err) {
      console.error('Failed to add address exception:', err);
      setAddrMsg('Failed to add address due to a network error.');
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const res = await fetch('/api/v1/auth/me/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone }),
      });
      if (res.ok) {
        setProfileMsg('Profile updated successfully!');
        checkAuth();
      } else {
        setProfileMsg('Failed to update profile.');
      }
    } catch (err) {
      setProfileMsg('Failed to update profile.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-tertiary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex flex-col justify-between">
        <Header cartCount={0} onOpenCart={() => {}} onOpenSommelier={() => {}} />
        <main className="max-w-md mx-auto my-auto p-6 text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-tertiary">lock</span>
          <h2 className="font-headline text-2xl font-bold text-white">Sign In Required</h2>
          <p className="text-sm text-on-surface-variant">Please sign in to view your orders and manage your profile.</p>
          <Link href="/" className="inline-block px-6 py-2.5 rounded-full bg-tertiary text-on-tertiary font-bold text-xs">
            Return to Home
          </Link>
        </main>
      </div>
    );
  }

  const handleDownloadReceipt = (order: Order) => {
    const text = `====================================
        ARTISANAL RESERVE CAFE
====================================
Receipt Ref: #${order.order_number}
Date: ${new Date(order.created_at).toLocaleString()}
Type: ${order.order_type}
Customer: ${order.contact_name} (${order.contact_phone})
------------------------------------
ITEMS:
${order.items.map(i => `${i.quantity}x ${i.item_name} ${i.variant_name ? `(${i.variant_name})` : ''} - ${i.subtotal_etb} ETB`).join('\n')}
------------------------------------
TOTAL AMOUNT: ${order.total_amount_etb} ETB
Status: ${order.status}
====================================
Thank you for dining with us!
`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt_${order.order_number}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'SUCCESS':
      case 'PLACED':
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'PREPARING':
      case 'READY':
      case 'OUT_FOR_DELIVERY':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'CANCELLED':
      case 'REJECTED':
      case 'FAILED':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default:
        return 'bg-tertiary/20 text-tertiary border-tertiary/30';
    }
  };

  const bannerColors = {
    success: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200',
    error: 'bg-red-950/80 border-red-500/40 text-red-200',
    info: 'bg-blue-950/80 border-blue-500/40 text-blue-200',
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col">
      <Header cartCount={0} onOpenCart={() => {}} onOpenSommelier={() => {}} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-24 pb-12 space-y-6">
        {/* Payment Status Banner */}
        {banner && (
          <div className={`p-4 rounded-xl border text-sm font-medium flex items-start gap-3 ${bannerColors[banner.type]}`}>
            <span className="material-symbols-outlined text-lg mt-0.5 shrink-0">
              {banner.type === 'success' ? 'check_circle' : banner.type === 'error' ? 'error' : 'info'}
            </span>
            <span className="flex-1 leading-relaxed">{banner.message}</span>
            <button
              onClick={() => setBanner(null)}
              className="opacity-60 hover:opacity-100 text-xs shrink-0"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        {/* User Card Header */}
        <div className="p-6 rounded-2xl bg-primary-container/90 border border-tertiary/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-tertiary/20 border border-tertiary/50 text-tertiary flex items-center justify-center font-bold text-2xl font-headline">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-headline text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                <span>{user.first_name ? `${user.first_name} ${user.last_name}` : user.username}</span>
                <span className="px-2 py-0.5 text-[10px] rounded bg-tertiary text-on-tertiary font-bold uppercase tracking-wider">
                  {user.role}
                </span>
              </h1>
              <p className="text-xs text-on-surface-variant">{user.email} • {user.phone || 'No phone set'}</p>
            </div>
          </div>

          <Link href="/" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-tertiary text-xs font-semibold flex items-center gap-1.5 transition-all">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            <span>Back to Menu</span>
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 gap-4">
          {[
            { id: 'orders', label: 'My Orders', icon: 'receipt_long' },
            { id: 'addresses', label: 'Delivery Addresses', icon: 'location_on' },
            { id: 'profile', label: 'Profile Details', icon: 'person' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-2 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-tertiary text-tertiary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Tab 1: Orders ── */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-headline text-base font-bold text-white">
                Order History {orders.length > 0 && <span className="text-tertiary">({orders.length})</span>}
              </h2>
              <button
                onClick={fetchOrders}
                className="text-xs text-on-surface-variant hover:text-tertiary flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Refresh
              </button>
            </div>

            {isLoadingOrders ? (
              <div className="text-center py-12 text-on-surface-variant">
                <div className="w-6 h-6 border-2 border-tertiary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading your order history...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 p-8 rounded-2xl bg-surface-container/60 border border-white/5 space-y-3">
                <span className="material-symbols-outlined text-4xl text-tertiary/60">coffee</span>
                <h3 className="font-headline text-lg font-bold text-white">No Orders Yet</h3>
                <p className="text-xs text-on-surface-variant">You haven't placed any artisanal coffee or food orders yet.</p>
                <Link href="/" className="inline-block px-5 py-2 rounded-full bg-tertiary text-on-tertiary text-xs font-bold">
                  Browse Menu & Order
                </Link>
              </div>
            ) : (
              orders.map((ord) => (
                <div key={ord.id} className="p-5 rounded-2xl bg-surface-container-high/60 border border-white/10 space-y-4 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div>
                      <span className="font-headline font-bold text-white text-base">#{ord.order_number}</span>
                      <span className="text-xs text-on-surface-variant block">
                        Placed on {new Date(ord.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {(ord.status === 'PENDING_PAYMENT' || ord.status === 'UNPAID') && (
                        <button
                          onClick={() => setPaymentOrder(ord)}
                          className="px-3 py-1 rounded-full bg-tertiary text-on-tertiary font-bold text-xs hover:brightness-110 flex items-center gap-1 shadow-md transition-all active:scale-95"
                        >
                          <span className="material-symbols-outlined text-sm">payments</span>
                          <span>Pay Now</span>
                        </button>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getStatusColor(ord.status)}`}>
                        {ord.status.replace(/_/g, ' ')}
                      </span>
                      <span className="font-headline font-bold text-tertiary text-lg">ETB {ord.total_amount_etb}</span>
                    </div>
                  </div>

                  {/* Compact Receipt Card Box */}
                  <div className="bg-[#1a1415] border border-tertiary/30 rounded-xl p-4 font-mono text-xs text-amber-100 max-w-md shadow-inner space-y-2">
                    <div className="flex items-center justify-between border-b border-dashed border-amber-500/30 pb-2">
                      <div>
                        <p className="font-bold text-tertiary text-sm font-headline">ARTISANAL RESERVE CAFE</p>
                        <p className="text-[10px] text-amber-200/60">Receipt Ref: #{ord.order_number}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedReceiptOrder(ord)}
                          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1 text-[11px] font-sans font-bold transition-all"
                          title="Open Receipt Card Modal"
                        >
                          <span className="material-symbols-outlined text-base text-tertiary">print</span>
                          <span>Receipt</span>
                        </button>
                        <button
                          onClick={() => handleDownloadReceipt(ord)}
                          className="px-2.5 py-1 bg-tertiary/20 hover:bg-tertiary/30 text-tertiary rounded-lg flex items-center gap-1 text-[11px] font-sans font-bold transition-all"
                          title="Download Receipt"
                        >
                          <span className="material-symbols-outlined text-base">download</span>
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-amber-200/80 space-y-0.5">
                      <p>Type: <span className="font-bold text-white">{ord.order_type}</span></p>
                      <p>Date: {new Date(ord.created_at).toLocaleString()}</p>
                    </div>
                    <div className="border-t border-dashed border-amber-500/30 pt-2 space-y-1">
                      {ord.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span>{item.quantity}x {item.item_name} {item.variant_name && `(${item.variant_name})`}</span>
                          <span className="font-bold text-tertiary">{item.subtotal_etb} ETB</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-dashed border-amber-500/30 pt-2 flex justify-between font-bold text-sm text-tertiary">
                      <span>TOTAL:</span>
                      <span>{ord.total_amount_etb} ETB</span>
                    </div>
                  </div>

                  {/* Order Tracker Component */}
                  <OrderTracker status={ord.status} />
                </div>
              ))
            )}
          </div>
        )}

        {/* Receipt Popup Modal */}
        <ReceiptModal
          order={selectedReceiptOrder}
          onClose={() => setSelectedReceiptOrder(null)}
        />

        {/* ── Tab 2: Delivery Addresses ── */}
        {activeTab === 'addresses' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Add Address Form */}
            <div className="p-5 rounded-2xl bg-surface-container-high/60 border border-white/10 space-y-4">
              <h3 className="font-headline text-base font-bold text-tertiary flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">add_location</span>
                Add New Delivery Address
              </h3>

              {addrMsg && (
                <div className={`p-2.5 rounded-lg border text-xs ${
                  addrMsg.includes('success')
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/60 border-red-500/40 text-red-200'
                }`}>
                  {addrMsg}
                </div>
              )}

              <form onSubmit={handleAddAddress} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                    Street Address / House No.
                  </label>
                  <input
                    type="text"
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="e.g. Bole Atlas, House No. 452"
                    className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-white/10 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">
                    Subcity / Zone
                  </label>
                  <input
                    type="text"
                    required
                    value={subcityOrZone}
                    onChange={(e) => setSubcityOrZone(e.target.value)}
                    placeholder="e.g. Bole, Kazanchis, Kirkos"
                    className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-white/10 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={isDefaultAddr}
                    onChange={(e) => setIsDefaultAddr(e.target.checked)}
                    className="rounded text-tertiary accent-tertiary"
                  />
                  <label htmlFor="is_default" className="text-xs text-on-surface-variant">Set as default delivery address</label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-tertiary text-on-tertiary font-bold text-xs hover:brightness-110 transition-all"
                >
                  Save Address
                </button>
              </form>
            </div>

            {/* Address List */}
            <div className="space-y-3">
              <h3 className="font-headline text-base font-bold text-white">Saved Addresses</h3>
              {addresses.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No saved addresses yet.</p>
              ) : (
                addresses.map((addr) => (
                  <div key={addr.id} className="p-4 rounded-xl bg-surface-container/60 border border-white/10 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white text-xs">{addr.street_address}</p>
                      <p className="text-[11px] text-on-surface-variant">{addr.subcity_or_zone}, {addr.city}</p>
                    </div>
                    {addr.is_default && (
                      <span className="px-2 py-0.5 text-[9px] rounded bg-tertiary/20 text-tertiary font-bold uppercase">Default</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Tab 3: Profile Details ── */}
        {activeTab === 'profile' && (
          <div className="max-w-md p-6 rounded-2xl bg-surface-container-high/60 border border-white/10 space-y-4">
            <h3 className="font-headline text-base font-bold text-tertiary flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">manage_accounts</span>
              Edit Profile Information
            </h3>

            {profileMsg && (
              <div className={`p-2.5 rounded-lg border text-xs ${
                profileMsg.includes('success')
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/60 border-red-500/40 text-red-200'
              }`}>
                {profileMsg}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-white/10 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-white/10 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase mb-1">Ethiopian Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251911223344"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-white/10 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-tertiary text-on-tertiary font-bold text-xs hover:brightness-110 transition-all"
              >
                Update Profile
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Chapa Payment Modal for Unpaid Orders */}
      {paymentOrder && (
        <PaymentModal
          isOpen={Boolean(paymentOrder)}
          onClose={() => setPaymentOrder(null)}
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.order_number}
          totalAmountEtb={paymentOrder.total_amount_etb}
          onPaymentComplete={(payStatus, txRef, message) => {
            setPaymentOrder(null);
            if (payStatus === 'SUCCESS') {
              setBanner({ type: 'success', message: `✅ ${message}` });
            } else if (payStatus === 'PENDING') {
              setBanner({ type: 'info', message: `⏳ ${message}` });
            }
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}

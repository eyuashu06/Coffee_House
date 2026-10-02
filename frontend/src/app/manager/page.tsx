'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import Link from 'next/link';
import NotificationsDropdown from '../../components/NotificationsDropdown';
import ReceiptModal from '../../components/ReceiptModal';

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
  customer_username: string;
  order_type: string;
  table_number: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: string;
  total_amount_etb: string;
  status: string;
  created_at: string;
  items: OrderItem[];
}

interface MenuItem {
  id: number;
  name: string;
  category_name?: string;
  base_price_etb?: string;
  is_available: boolean;
  variants?: { id: number; name: string; price_etb: string }[];
}

export default function ManagerDashboard() {
  const { user, loading, logout } = useAuth();
  const { toggleLanguage, t } = useLanguage();
  
  // Primary Dashboard State
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'reports' | 'settings'>('orders');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectingOrderId, setRejectingOrderId] = useState<number | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
    fetchStoreStatus();
    fetchMenuItems();

    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/v1/orders/', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' },
      });
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
      const res = await fetch('/api/v1/coffees/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMenuItems(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStoreStatus = async () => {
    try {
      const res = await fetch('/api/v1/restaurant-settings/', { credentials: 'include' });
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
      const res = await fetch('/api/v1/restaurant-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_open: !isOpen }),
      });
      if (res.ok) {
        setIsOpen(!isOpen);
        setActionMsg(`Cafe is now ${!isOpen ? 'OPEN' : 'CLOSED'}`);
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (e) {
      setActionMsg('Failed to update store status.');
    }
  };

  const toggleMenuItemAvailability = async (item: MenuItem) => {
    try {
      const res = await fetch(`/api/v1/coffees/${item.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      if (res.ok) {
        setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_available: !item.is_available } : m));
        setActionMsg(`${item.name} is now ${!item.is_available ? 'Available' : 'Sold Out'}`);
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (e) {
      setActionMsg('Failed to update menu item status.');
    }
  };

  const handleUpdateStatus = async (orderId: number, newStatus: string, reason = '') => {
    setActionMsg(null);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus, rejection_reason: reason }),
      });

      if (res.ok) {
        const updatedOrder = await res.json();
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: updatedOrder.status } : o));
        setActionMsg(`Order #${updatedOrder.order_number} status updated to: ${newStatus.replace(/_/g, ' ')}`);
        setRejectingOrderId(null);
        setRejectionReason('');
        setTimeout(() => setActionMsg(null), 3000);
      } else {
        const err = await res.json();
        setActionMsg(err.error || 'Failed to update order status.');
      }
    } catch (e) {
      setActionMsg('Error updating status.');
    }
  };

  const handleDownloadReceipt = (order: Order) => {
    const text = `====================================
        ARTISANAL RESERVE CAFE
====================================
Receipt Ref: #${order.order_number}
Date: ${new Date(order.created_at).toLocaleString()}
Type: ${order.order_type} ${order.table_number ? `(${order.table_number})` : ''}
Customer: ${order.contact_name} (${order.contact_phone})
------------------------------------
ITEMS:
${order.items.map(i => `${i.quantity}x ${i.item_name} ${i.variant_name ? `(${i.variant_name})` : ''} - ${i.subtotal_etb} ETB`).join('\n')}
------------------------------------
TOTAL AMOUNT: ${order.total_amount_etb} ETB
Status: ${order.status}
====================================
Thank you for visiting Artisanal Cafe!
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

  const handlePrintTicket = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Kitchen Ticket - ${order.order_number}</title>
          <style>
            body { font-family: monospace; padding: 20px; width: 300px; }
            h2 { margin: 0 0 10px 0; font-size: 18px; text-align: center; }
            .line { border-bottom: 1px dashed #000; margin: 10px 0; }
            .item { display: flex; justify-content: space-between; margin: 5px 0; }
            .total { font-weight: bold; font-size: 16px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <h2>CAFE KITCHEN TICKET</h2>
          <div>Order: #${order.order_number}</div>
          <div>Type: ${order.order_type} ${order.table_number ? `(${order.table_number})` : ''}</div>
          <div>Customer: ${order.contact_name} (${order.contact_phone})</div>
          <div>Date: ${new Date(order.created_at).toLocaleString()}</div>
          <div class="line"></div>
          ${order.items.map(i => `
            <div class="item">
              <span>${i.quantity}x ${i.item_name} ${i.variant_name ? `(${i.variant_name})` : ''}</span>
              <span>${i.subtotal_etb} ETB</span>
            </div>
          `).join('')}
          <div class="line"></div>
          <div class="total item">
            <span>TOTAL:</span>
            <span>${order.total_amount_etb} ETB</span>
          </div>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Order Number,Type,Customer,Phone,Total ETB,Status,Date\n"
      + orders.map(o => `"${o.order_number}","${o.order_type}","${o.contact_name}","${o.contact_phone}","${o.total_amount_etb}","${o.status}","${o.created_at}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Cafe_Sales_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#fbbb50] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'MANAGER' && user.role !== 'ADMIN')) {
    return (
      <div className="min-h-screen bg-[#131313] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#3b141c] p-8 rounded-2xl border border-[#fbbb50]/20 text-center space-y-4 shadow-xl">
          <span className="material-symbols-outlined text-5xl text-amber-500">lock</span>
          <h2 className="text-2xl font-bold font-headline text-[#fbbb50]">Manager Access Required</h2>
          <p className="text-sm text-gray-300">You must be logged in as a Manager or Administrator to view this dashboard.</p>
          <Link href="/" className="inline-block px-6 py-2.5 rounded-full bg-[#fbbb50] text-[#131313] font-bold text-sm hover:bg-amber-400 transition-colors">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  // Filtered lists
  const newOrders = orders.filter(o => o.status === 'PLACED');
  const preparingOrders = orders.filter(o => o.status === 'ACCEPTED' || o.status === 'PREPARING');
  const readyOrders = orders.filter(o => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY');
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');

  const filteredOrders = filterStatus === 'ALL' 
    ? orders 
    : orders.filter(o => o.status === filterStatus);

  const totalRevenue = orders
    .filter(o => !['PENDING_PAYMENT', 'CANCELLED', 'REJECTED'].includes(o.status))
    .reduce((acc, o) => acc + parseFloat(o.total_amount_etb || '0'), 0);

  return (
    <div className="min-h-screen bg-[#131313] text-white font-sans selection:bg-[#fbbb50] selection:text-[#131313]">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-[#3b141c] border-b border-[#fbbb50]/20 px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-[#fbbb50]">coffee</span>
              <div>
                <h1 className="font-headline text-xl font-bold text-[#fbbb50] tracking-wide">Cafe Manager</h1>
                <p className="text-xs text-amber-200/80">Live Orders & Cafe Control</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {/* Cafe Open/Closed Toggle */}
            <button
              onClick={toggleStoreStatus}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all shadow-sm ${
                isOpen 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30' 
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
              <span>{isOpen ? 'CAFE OPEN' : 'CAFE CLOSED'}</span>
            </button>

            <NotificationsDropdown />

            {/* User Profile Info */}
            <div className="flex items-center gap-3 border-l border-white/10 pl-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user.first_name || user.username}</p>
                <p className="text-xs text-[#fbbb50] uppercase font-bold">{user.role}</p>
              </div>
              <button 
                onClick={logout} 
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                title="Logout"
              >
                <span className="material-symbols-outlined text-xl">logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Action Banner */}
      {actionMsg && (
        <div className="bg-[#fbbb50] text-[#131313] px-6 py-2.5 font-bold text-center text-sm shadow-md animate-fade-in flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-lg">info</span>
          <span>{actionMsg}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#3b141c]/60 border border-[#fbbb50]/20 p-5 rounded-2xl shadow-md">
            <div className="flex items-center justify-between text-amber-400/80 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">New Paid Orders</span>
              <span className="material-symbols-outlined text-2xl">pending_actions</span>
            </div>
            <p className="text-3xl font-extrabold text-amber-300">{newOrders.length}</p>
          </div>

          <div className="bg-[#3b141c]/60 border border-[#fbbb50]/20 p-5 rounded-2xl shadow-md">
            <div className="flex items-center justify-between text-sky-400/80 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">In Preparation</span>
              <span className="material-symbols-outlined text-2xl">skillet</span>
            </div>
            <p className="text-3xl font-extrabold text-sky-300">{preparingOrders.length}</p>
          </div>

          <div className="bg-[#3b141c]/60 border border-[#fbbb50]/20 p-5 rounded-2xl shadow-md">
            <div className="flex items-center justify-between text-emerald-400/80 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Ready / Serving</span>
              <span className="material-symbols-outlined text-2xl">task_alt</span>
            </div>
            <p className="text-3xl font-extrabold text-emerald-300">{readyOrders.length}</p>
          </div>

          <div className="bg-[#3b141c]/60 border border-[#fbbb50]/20 p-5 rounded-2xl shadow-md">
            <div className="flex items-center justify-between text-[#fbbb50]/80 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Sales (ETB)</span>
              <span className="material-symbols-outlined text-2xl">payments</span>
            </div>
            <p className="text-3xl font-extrabold text-[#fbbb50]">{totalRevenue.toFixed(2)}</p>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'orders' ? 'bg-[#fbbb50] text-[#131313] shadow-md' : 'text-gray-300 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">format_list_bulleted</span>
              <span>Live Orders</span>
              {newOrders.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold ml-1 animate-pulse">
                  {newOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('menu')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'menu' ? 'bg-[#fbbb50] text-[#131313] shadow-md' : 'text-gray-300 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">restaurant_menu</span>
              <span>Menu Inventory</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'reports' ? 'bg-[#fbbb50] text-[#131313] shadow-md' : 'text-gray-300 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">monitoring</span>
              <span>Sales Reports</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'settings' ? 'bg-[#fbbb50] text-[#131313] shadow-md' : 'text-gray-300 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-lg">tune</span>
              <span>Settings</span>
            </button>
          </div>

          {activeTab === 'reports' && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-colors shadow-md"
            >
              <span className="material-symbols-outlined text-base">download</span>
              <span>Export Sales CSV</span>
            </button>
          )}
        </div>

        {/* TAB 1: LIVE ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            {/* Status Filter Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <span className="text-xs font-bold text-gray-400 uppercase mr-2">Filter Status:</span>
              {['ALL', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REJECTED'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                    filterStatus === st 
                      ? 'bg-[#fbbb50] text-[#131313]' 
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {st.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {/* Orders Kanban Grid */}
            {isLoading ? (
              <div className="py-12 text-center text-gray-400">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center bg-[#3b141c]/30 rounded-2xl border border-white/5 space-y-3">
                <span className="material-symbols-outlined text-4xl text-gray-500">inbox</span>
                <p className="text-lg font-bold text-gray-300">No orders found</p>
                <p className="text-xs text-gray-500">Orders placed by customers will appear here in real-time.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders.map(order => (
                  <div 
                    key={order.id} 
                    className={`bg-[#3b141c]/80 border rounded-2xl p-6 space-y-4 shadow-xl transition-all ${
                      order.status === 'PLACED' 
                        ? 'border-amber-500/60 ring-1 ring-amber-500/40' 
                        : 'border-white/10'
                    }`}
                  >
                    {/* Header: Order Number & Type Badge */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-[#fbbb50]">#{order.order_number}</span>
                        <h3 className="font-bold text-lg text-white mt-0.5">{order.contact_name}</h3>
                        <p className="text-xs text-gray-400">{order.contact_phone}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        order.order_type === 'DELIVERY' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                        order.order_type === 'PICKUP' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      }`}>
                        {order.order_type} {order.table_number && `(${order.table_number})`}
                      </span>
                    </div>

                    {/* Delivery Address if applicable */}
                    {order.delivery_address && (
                      <div className="bg-black/30 p-2.5 rounded-xl text-xs text-gray-300 flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm text-[#fbbb50] shrink-0">location_on</span>
                        <span className="line-clamp-2">{order.delivery_address}</span>
                      </div>
                    )}

                    {/* Compact Receipt Card Box Mode */}
                    <div className="bg-[#1a1415] border border-[#fbbb50]/30 rounded-xl p-3.5 font-mono text-xs text-amber-100 shadow-inner space-y-2">
                      <div className="flex items-center justify-between border-b border-dashed border-amber-500/30 pb-2">
                        <div>
                          <p className="font-bold text-[#fbbb50] text-xs">RECEIPT CARD</p>
                          <p className="text-[10px] text-amber-200/60">#{order.order_number}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedReceiptOrder(order)}
                            className="p-1.5 bg-white/10 hover:bg-[#fbbb50] hover:text-[#131313] text-[#fbbb50] rounded-lg transition-colors flex items-center gap-1 text-[11px] font-sans font-bold"
                            title="Open Receipt Card Modal"
                          >
                            <span className="material-symbols-outlined text-base">print</span>
                            <span>Receipt</span>
                          </button>
                          <button
                            onClick={() => handleDownloadReceipt(order)}
                            className="p-1.5 bg-white/10 hover:bg-[#fbbb50] hover:text-[#131313] text-[#fbbb50] rounded-lg transition-colors"
                            title="Download Receipt TXT"
                          >
                            <span className="material-symbols-outlined text-base">download</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[11px]">
                            <span className="truncate max-w-[160px]">
                              {item.quantity}x {item.item_name} {item.variant_name && `(${item.variant_name})`}
                            </span>
                            <span className="font-bold text-[#fbbb50]">{item.subtotal_etb} ETB</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-dashed border-amber-500/30 pt-1.5 flex justify-between font-bold text-xs text-[#fbbb50]">
                        <span>TOTAL:</span>
                        <span>{order.total_amount_etb} ETB</span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Order Status:</span>
                      <span className="font-bold px-3 py-0.5 rounded-full bg-white/10 text-gray-200 uppercase text-[11px]">
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 space-y-2">
                      {order.status === 'PLACED' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'ACCEPTED')}
                          className="w-full py-2.5 bg-[#fbbb50] hover:bg-amber-400 text-[#131313] font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
                        >
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          <span>Accept & Start Preparing</span>
                        </button>
                      )}

                      {(order.status === 'ACCEPTED' || order.status === 'PREPARING') && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'READY')}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
                        >
                          <span className="material-symbols-outlined text-sm">task_alt</span>
                          <span>Mark Ready</span>
                        </button>
                      )}

                      {(order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY') && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'COMPLETED')}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
                        >
                          <span className="material-symbols-outlined text-sm">verified</span>
                          <span>Complete Order</span>
                        </button>
                      )}

                      {/* Reject modal toggle */}
                      {['PLACED', 'ACCEPTED'].includes(order.status) && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRejectingOrderId(rejectingOrderId === order.id ? null : order.id)}
                            className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-xs rounded-xl border border-red-500/30 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handlePrintTicket(order)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-colors"
                            title="Print Kitchen Ticket"
                          >
                            <span className="material-symbols-outlined text-base">print</span>
                          </button>
                        </div>
                      )}

                      {/* Rejection input box */}
                      {rejectingOrderId === order.id && (
                        <div className="bg-black/40 p-3 rounded-xl space-y-2 mt-2">
                          <input
                            type="text"
                            placeholder="Reason for rejection..."
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#fbbb50]"
                          />
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'REJECTED', rejectionReason)}
                            className="w-full py-1.5 bg-red-600 text-white font-bold text-xs rounded-lg hover:bg-red-500 transition-colors"
                          >
                            Confirm Rejection
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MENU INVENTORY */}
        {activeTab === 'menu' && (
          <div className="bg-[#3b141c]/60 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#fbbb50]">Menu & Item Availability</h2>
                <p className="text-xs text-gray-400">Toggle items as "Sold Out" or "Available" in real-time.</p>
              </div>
            </div>

            <div className="divide-y divide-white/10">
              {menuItems.map(item => (
                <div key={item.id} className="py-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{item.name}</h4>
                    <p className="text-xs text-gray-400">{item.category_name || 'Coffee & Food'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      item.is_available 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {item.is_available ? 'Available' : 'Sold Out'}
                    </span>
                    <button
                      onClick={() => toggleMenuItemAvailability(item)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      {item.is_available ? 'Mark Sold Out' : 'Mark Available'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SALES REPORTS */}
        {activeTab === 'reports' && (
          <div className="bg-[#3b141c]/60 border border-white/10 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-[#fbbb50]">Shift Sales Summary</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-gray-400 uppercase font-bold">
                  <tr>
                    <th className="p-3">Order Number</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Total (ETB)</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono text-[#fbbb50]">#{o.order_number}</td>
                      <td className="p-3 font-semibold">{o.contact_name}</td>
                      <td className="p-3">{o.order_type}</td>
                      <td className="p-3 font-bold font-mono">{o.total_amount_etb} ETB</td>
                      <td className="p-3 uppercase text-gray-300">{o.status}</td>
                      <td className="p-3 text-gray-400">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: CAFE SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-[#3b141c]/60 border border-white/10 rounded-2xl p-6 space-y-6 max-w-xl">
            <h2 className="text-lg font-bold text-[#fbbb50]">Cafe Operational Settings</h2>

            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Store Acceptance Switch</h4>
                  <p className="text-xs text-gray-400">Master toggle to receive online customer orders.</p>
                </div>
                <button
                  onClick={toggleStoreStatus}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isOpen ? 'bg-emerald-500 text-[#131313]' : 'bg-rose-500 text-white'
                  }`}
                >
                  {isOpen ? 'OPEN' : 'CLOSED'}
                </button>
              </div>

              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">Default Preparation Time (Minutes)</label>
                <input
                  type="number"
                  defaultValue="20"
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#fbbb50]"
                />
              </div>

              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">Support Contact Phone</label>
                <input
                  type="text"
                  defaultValue="+251911234567"
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#fbbb50]"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Popup Receipt Card Modal */}
      <ReceiptModal
        order={selectedReceiptOrder}
        onClose={() => setSelectedReceiptOrder(null)}
      />
    </div>
  );
}

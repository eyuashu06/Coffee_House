'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import Link from 'next/link';
import ReceiptModal from '../../components/ReceiptModal';
import NotificationsDropdown from '../../components/NotificationsDropdown';

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
  price?: string;
  is_available: boolean;
  variants?: { id: number; name: string; price_etb: string }[];
}

interface TableReservation {
  id: number;
  name: string;
  date_time: string;
  party_size: number;
  contact_phone: string;
  status: string;
  created_at: string;
}

export default function ManagerDashboard() {
  const { user, loading, logout } = useAuth();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [analytics, setAnalytics] = useState({ daily_revenue: 0, monthly_revenue: 0, daily_orders_count: 0, monthly_orders_count: 0 });
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'menu' | 'reservations'>('dashboard');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
    fetchStoreStatus();
    fetchMenuItems();
    fetchAnalytics();
    fetchReservations();

    const interval = setInterval(() => {
      fetchOrders();
      fetchAnalytics();
      fetchReservations();
    }, 10000);
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

  const fetchReservations = async () => {
    try {
      const res = await fetch('/api/v1/reservations/', { credentials: 'include' });
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
      const res = await fetch('/api/v1/analytics/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
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

  const handleUpdateStatus = async (orderId: number, newStatus: string) => {
    setActionMsg(null);
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const updatedOrder = await res.json();
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: updatedOrder.status } : o));
        setActionMsg(`Order #${updatedOrder.order_number} status updated to: ${newStatus}`);
        setTimeout(() => setActionMsg(null), 3000);
        fetchAnalytics(); // Refresh analytics after order update
      } else {
        const err = await res.json();
        setActionMsg(err.error || 'Failed to update order status.');
      }
    } catch (e) {
      setActionMsg('Error updating status.');
    }
  };

  const handleUpdateReservationStatus = async (reservationId: number, newStatus: string) => {
    setActionMsg(null);
    try {
      const res = await fetch(`/api/v1/reservations/${reservationId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const updatedRes = await res.json();
        setReservations(prev => prev.map(r => r.id === reservationId ? { ...r, status: updatedRes.status } : r));
        setActionMsg(`Reservation status updated to: ${newStatus}`);
        setTimeout(() => setActionMsg(null), 3000);
      } else {
        const err = await res.json();
        setActionMsg(err.error || 'Failed to update reservation status.');
      }
    } catch (e) {
      setActionMsg('Error updating reservation status.');
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f7b5be] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'MANAGER' && user.role !== 'ADMIN')) {
    return (
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex flex-col items-center justify-center font-body">
        <span className="material-symbols-outlined text-5xl text-red-500 mb-4">gavel</span>
        <h2 className="font-display text-[26px] font-bold">Access Denied</h2>
        <p className="text-[#d5c2c3] mt-2 mb-6 text-[15px]">You do not have permission to view this page.</p>
        <Link href="/" className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold flex items-center hover:bg-[#ffd9dd] transition-colors">
          Return to Home
        </Link>
      </div>
    );
  }

  const filteredOrders = filterStatus === 'ALL' ? orders : orders.filter(o => o.status === filterStatus);

  return (
    <div className="bg-[#131313] text-[#e5e2e1] font-body min-h-screen flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-[#1c1b1b] border-r border-[#514345] md:min-h-screen flex flex-col flex-shrink-0 relative z-20">
        <div className="p-6 border-b border-[#514345]">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-full bg-[#3b141c] border border-[#683941] flex items-center justify-center text-[#f7b5be] text-[16px] group-hover:scale-105 transition-transform"><i className="ph ph-coffee-bean"></i></span>
            <span className="font-display text-[21px] tracking-wide text-white">Manager</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2 flex flex-row md:flex-col overflow-x-auto hide-scrollbar">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-chart-line-up text-xl"></i> Dashboard
          </button>
          <button onClick={() => setActiveTab('orders')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'orders' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-receipt text-xl"></i> Live Orders
            {orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length > 0 && (
              <span className="ml-auto bg-[#f7b5be] text-[#3b141c] text-[11px] font-bold px-2 py-0.5 rounded-full">{orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('menu')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'menu' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-list-dashes text-xl"></i> Menu Management
          </button>
          <button onClick={() => setActiveTab('reservations')} className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-[15.5px] transition-colors whitespace-nowrap ${activeTab === 'reservations' ? 'bg-[#3b141c] text-[#f7b5be] font-bold' : 'text-[#d5c2c3] hover:bg-[#514345]/30'}`}>
            <i className="ph ph-calendar-blank text-xl"></i> Table Reservations
            {reservations.filter(r => r.status === 'PENDING').length > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{reservations.filter(r => r.status === 'PENDING').length}</span>
            )}
          </button>
        </nav>
        <div className="p-4 border-t border-[#514345] hidden md:block">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-[#3b141c] border border-[#683941] text-[#f7b5be] flex items-center justify-center text-[16px] font-bold">{user.first_name?.[0] || 'M'}</div>
            <div>
              <p className="text-[14.5px] font-bold text-[#e5e2e1]">{user.first_name || 'Manager'}</p>
              <p className="text-[12px] text-[#9e8d8e]">{user.role}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full h-10 rounded-[12px] border border-[#514345] text-[#d5c2c3] text-[14px] flex items-center justify-center gap-2 hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">
            <i className="ph ph-sign-out text-lg"></i> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 md:p-10 md:h-screen overflow-y-auto">
        
        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-[#1c1b1b] border border-[#514345] p-5 rounded-[18px]">
          <div>
            <h1 className="font-display text-[26px] md:text-[32px] leading-none mb-1 text-white">Store Overview</h1>
            <p className="text-[#9e8d8e] text-[14.5px]">Manage incoming orders and store status.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex items-center">
              <NotificationsDropdown />
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-[15.5px] font-semibold">{isOpen ? 'STORE OPEN' : 'STORE CLOSED'}</span>
            </div>
            <button 
              onClick={toggleStoreStatus}
              className={`h-10 px-5 rounded-full font-semibold transition-colors ${isOpen ? 'bg-red-950 text-red-200 border border-red-900 hover:bg-red-900' : 'bg-green-950 text-green-200 border border-green-900 hover:bg-green-900'}`}
            >
              {isOpen ? 'Close Store' : 'Open Store'}
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
            <h2 className="font-display text-[24px] text-white">Analytics Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-[#1c1b1b] border border-[#514345] p-6 rounded-[18px] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-[120px] text-[#3b141c] opacity-30"><i className="ph ph-trend-up"></i></div>
                <h3 className="text-[#9e8d8e] font-bold text-[13px] uppercase tracking-wider mb-2">Today's Revenue</h3>
                <div className="font-display text-[42px] text-[#f7b5be] leading-none">{analytics.daily_revenue.toFixed(2)} Br</div>
                <p className="text-[#d5c2c3] text-[14.5px] mt-2">from {analytics.daily_orders_count} completed orders</p>
              </div>

              <div className="bg-[#1c1b1b] border border-[#514345] p-6 rounded-[18px] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-[120px] text-[#3b141c] opacity-30"><i className="ph ph-calendar-check"></i></div>
                <h3 className="text-[#9e8d8e] font-bold text-[13px] uppercase tracking-wider mb-2">Monthly Revenue</h3>
                <div className="font-display text-[42px] text-[#f7b5be] leading-none">{analytics.monthly_revenue.toFixed(2)} Br</div>
                <p className="text-[#d5c2c3] text-[14.5px] mt-2">from {analytics.monthly_orders_count} completed orders</p>
              </div>

            </div>
          </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="animate-fade-in">
            <h2 className="font-display text-[24px] text-white mb-6">Live Orders</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {['ALL', 'PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'].map(status => (
                <button 
                  key={status} 
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-1.5 rounded text-[13px] font-bold tracking-wider transition-colors border ${filterStatus === status ? 'bg-[#e5e2e1] text-[#131313] border-[#e5e2e1]' : 'bg-transparent text-[#9e8d8e] border-[#514345] hover:text-[#d5c2c3]'}`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {filteredOrders.length === 0 ? (
                <div className="col-span-full py-12 text-center text-[#9e8d8e] bg-[#1c1b1b] border border-[#514345] rounded-[18px]">
                  No orders found for this status.
                </div>
              ) : (
                filteredOrders.map(order => (
                  <div key={order.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[20px] font-display font-bold text-white">#{order.order_number}</span>
                          <span className="block text-[12px] text-[#9e8d8e] mt-1">{new Date(order.created_at).toLocaleTimeString()}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase ${
                          order.status === 'PENDING' ? 'bg-yellow-900/50 text-yellow-500' :
                          order.status === 'PREPARING' ? 'bg-blue-900/50 text-blue-400' :
                          order.status === 'READY' ? 'bg-green-900/50 text-green-400' :
                          'bg-[#514345] text-[#d5c2c3]'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      
                      <div className="text-[14px] text-[#d5c2c3] mb-4 space-y-1">
                        <p><strong className="text-[#e5e2e1]">Type:</strong> {order.order_type} {order.table_number && `(Table ${order.table_number})`}</p>
                        <p><strong className="text-[#e5e2e1]">Customer:</strong> {order.contact_name}</p>
                        <p><strong className="text-[#e5e2e1]">Phone:</strong> {order.contact_phone}</p>
                      </div>

                      <div className="space-y-2 mb-4">
                        <p className="text-[12px] uppercase text-[#9e8d8e] font-bold tracking-wider">Items</p>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-[14.5px] border-b border-[#514345]/50 pb-2">
                            <span>{item.quantity}x {item.item_name} <span className="text-[12px] text-[#9e8d8e]">{item.temperature !== 'Hot' ? item.temperature : ''} {item.milk_choice !== 'None' ? item.milk_choice : ''}</span></span>
                            <span>{item.subtotal_etb} Br</span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-between text-[16px] font-bold text-[#f7b5be] mb-6">
                        <span>Total:</span>
                        <span>{order.total_amount_etb} Br</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {order.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateStatus(order.id, 'PREPARING')} className="flex-1 h-10 rounded-[12px] bg-[#3b141c] text-[#f7b5be] font-bold text-[13px] hover:brightness-110">Accept & Prepare</button>
                          <button onClick={() => handleUpdateStatus(order.id, 'CANCELLED')} className="flex-1 h-10 rounded-[12px] border border-red-900 text-red-400 font-bold text-[13px] hover:bg-red-950">Reject</button>
                        </div>
                      )}
                      {order.status === 'PREPARING' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'READY')} className="w-full h-10 rounded-[12px] bg-blue-900/40 border border-blue-800 text-blue-300 font-bold text-[13px] hover:bg-blue-900/60">Mark Ready</button>
                      )}
                      {order.status === 'READY' && order.order_type === 'DELIVERY' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'OUT_FOR_DELIVERY')} className="w-full h-10 rounded-[12px] bg-purple-900/40 border border-purple-800 text-purple-300 font-bold text-[13px] hover:bg-purple-900/60">Send for Delivery</button>
                      )}
                      {order.status === 'READY' && (order.order_type === 'DINE_IN' || order.order_type === 'PICKUP') && (
                        <button onClick={() => handleUpdateStatus(order.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-900/40 border border-green-800 text-green-300 font-bold text-[13px] hover:bg-green-900/60">Complete Order</button>
                      )}
                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button onClick={() => handleUpdateStatus(order.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-900/40 border border-green-800 text-green-300 font-bold text-[13px] hover:bg-green-900/60">Mark Delivered</button>
                      )}
                      <button onClick={() => setSelectedReceiptOrder(order)} className="w-full h-9 rounded-[12px] border border-[#514345] text-[#9e8d8e] font-semibold text-[13px] hover:border-[#f7b5be] hover:text-[#f7b5be]">View Receipt</button>
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
            <h2 className="font-display text-[24px] text-white mb-6">Menu Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {menuItems.map(item => (
                <div key={item.id} className={`bg-[#1c1b1b] border rounded-[18px] p-4 flex flex-col justify-between transition-colors ${item.is_available ? 'border-[#514345]' : 'border-red-900/50 opacity-70'}`}>
                  <div>
                    <h4 className="font-display text-[20px] text-[#e5e2e1] mb-1 leading-tight">{item.name}</h4>
                    <span className="text-[12px] uppercase text-[#9e8d8e] tracking-wider font-bold">{item.category_name}</span>
                    <div className="text-[16px] text-[#f7b5be] font-semibold mt-2">{Number(item.price || 0).toFixed(2)} Br</div>
                  </div>
                  <button 
                    onClick={() => toggleMenuItemAvailability(item)}
                    className={`mt-4 w-full h-9 rounded-[12px] font-bold text-[13px] transition-colors border ${item.is_available ? 'border-[#683941] text-[#f7b5be] hover:bg-[#3b141c]' : 'bg-red-950/40 border-red-900/80 text-red-400 hover:bg-red-950/60'}`}
                  >
                    {item.is_available ? 'Available (Click to Disable)' : 'Sold Out (Click to Enable)'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESERVATIONS TAB */}
        {activeTab === 'reservations' && (
          <div className="animate-fade-in space-y-6">
            <h2 className="font-display text-[24px] text-white mb-6">Table Reservations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reservations.length === 0 ? (
                <div className="col-span-full py-12 text-center text-[#9e8d8e] bg-[#1c1b1b] border border-[#514345] rounded-[18px]">
                  No table reservations found.
                </div>
              ) : (
                reservations.map(reservation => (
                  <div key={reservation.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[20px] font-display font-bold text-white">{reservation.name}</span>
                          <span className="block text-[12px] text-[#9e8d8e] mt-1">Booked on {new Date(reservation.created_at).toLocaleDateString()}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase ${
                          reservation.status === 'PENDING' ? 'bg-yellow-900/50 text-yellow-500' :
                          reservation.status === 'CONFIRMED' ? 'bg-blue-900/50 text-blue-400' :
                          reservation.status === 'COMPLETED' ? 'bg-green-900/50 text-green-400' :
                          'bg-[#514345] text-[#d5c2c3]'
                        }`}>
                          {reservation.status}
                        </span>
                      </div>
                      
                      <div className="text-[14px] text-[#d5c2c3] mb-4 space-y-1">
                        <p><strong className="text-[#e5e2e1]">Date & Time:</strong> {new Date(reservation.date_time).toLocaleString()}</p>
                        <p><strong className="text-[#e5e2e1]">Party Size:</strong> {reservation.party_size} people</p>
                        <p><strong className="text-[#e5e2e1]">Phone:</strong> {reservation.contact_phone || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {reservation.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateReservationStatus(reservation.id, 'CONFIRMED')} className="flex-1 h-10 rounded-[12px] bg-[#3b141c] text-[#f7b5be] font-bold text-[13px] hover:brightness-110">Confirm</button>
                          <button onClick={() => handleUpdateReservationStatus(reservation.id, 'CANCELLED')} className="flex-1 h-10 rounded-[12px] border border-red-900 text-red-400 font-bold text-[13px] hover:bg-red-950">Cancel</button>
                        </div>
                      )}
                      {reservation.status === 'CONFIRMED' && (
                        <button onClick={() => handleUpdateReservationStatus(reservation.id, 'COMPLETED')} className="w-full h-10 rounded-[12px] bg-green-900/40 border border-green-800 text-green-300 font-bold text-[13px] hover:bg-green-900/60">Mark Completed</button>
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

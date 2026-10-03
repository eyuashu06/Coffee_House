'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
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
  const { user, loading, checkAuth, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'profile'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
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
        setAddrMsg(`Failed to add address: ${JSON.stringify(errorData)}`);
      }
    } catch (err) {
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
      <div className="min-h-screen bg-[#131313] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f7b5be] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex flex-col items-center justify-center font-body">
        <span className="material-symbols-outlined text-5xl text-[#f7b5be] mb-4">lock</span>
        <h2 className="font-display text-[26px] font-bold">Sign In Required</h2>
        <p className="text-[#d5c2c3] mt-2 mb-6 text-[15px]">Please sign in to view your orders and manage your profile.</p>
        <Link href="/" className="h-10 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold flex items-center hover:bg-[#ffd9dd] transition-colors">
          Return to Home
        </Link>
      </div>
    );
  }

  const pendingOrders = orders.filter(o => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY');
  const pastOrders = orders.filter(o => o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED');

  return (
    <div className="bg-[#131313] text-[#e5e2e1] font-body min-h-screen pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#131313]/90 backdrop-blur-sm border-b border-[#514345]/60">
        <div className="flex items-center justify-between px-6 h-14">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-full bg-[#3b141c] border border-[#683941] flex items-center justify-center text-[#f7b5be] text-[16px] group-hover:scale-105 transition-transform"><i className="ph ph-coffee-bean"></i></span>
            <span className="font-display text-[21px] tracking-wide">Buna Hub</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[#d5c2c3] text-[15px] hidden sm:block">Hello, {user.first_name || user.username}</span>
            <button onClick={logout} className="h-8 px-4 rounded-full border border-[#514345] text-[#d5c2c3] text-[14px] flex items-center hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">Sign Out</button>
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
        <h1 className="font-display text-[40px] leading-none mb-8">Your Account</h1>
        
        {/* TABS */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-[#514345] pb-4">
          <button onClick={() => setActiveTab('orders')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'orders' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>My Orders</button>
          <button onClick={() => setActiveTab('addresses')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'addresses' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>Delivery Addresses</button>
          <button onClick={() => setActiveTab('profile')} className={`h-10 px-5 rounded-full text-[15.5px] transition-colors ${activeTab === 'profile' ? 'bg-[#3b141c] text-[#f7b5be] border border-[#683941]' : 'bg-[#1c1b1b] text-[#d5c2c3] border border-[#514345] hover:border-[#9e8d8e]'}`}>Profile Settings</button>
        </div>

        {/* TAB: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-10 animate-fade-in">
            {isLoadingOrders ? (
              <div className="py-12 flex justify-center text-[#9e8d8e]">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-10 text-center">
                <i className="ph ph-receipt text-4xl text-[#514345] mb-4"></i>
                <h3 className="font-display text-[22px] mb-2">No orders yet</h3>
                <p className="text-[#d5c2c3] text-[15.5px] mb-6">Looks like you haven't tasted our buna yet.</p>
                <Link href="/#menu" className="h-10 px-6 rounded-full inline-flex items-center bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">Browse Menu</Link>
              </div>
            ) : (
              <>
                {/* Active Orders Section */}
                {pendingOrders.length > 0 && (
                  <div>
                    <h3 className="font-display text-[24px] mb-4 flex items-center gap-2"><i className="ph ph-hourglass text-[#f7b5be]"></i> Active Orders</h3>
                    <div className="space-y-4">
                      {pendingOrders.map(order => (
                        <div key={order.id} className="bg-[#1c1b1b] border border-[#683941] rounded-[18px] p-5">
                          <OrderTracker status={order.status} />
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#514345] pt-4">
                            <div>
                              <p className="text-[13px] text-[#9e8d8e] uppercase tracking-wider">Order #{order.order_number}</p>
                              <p className="text-[16px] font-semibold mt-0.5">{order.total_amount_etb} Br</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setSelectedReceiptOrder(order)} className="h-9 px-4 rounded-full border border-[#514345] text-[#d5c2c3] text-[14px] hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">View Receipt</button>
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
                    <h3 className="font-display text-[24px] mb-4 flex items-center gap-2"><i className="ph ph-clock-counter-clockwise text-[#9e8d8e]"></i> Order History</h3>
                    <div className="space-y-4">
                      {pastOrders.map(order => (
                        <div key={order.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#9e8d8e] transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-[16px]">#{order.order_number}</span>
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#3b141c] text-[#f7b5be] border border-[#683941]">{order.status}</span>
                            </div>
                            <p className="text-[14.5px] text-[#d5c2c3] mb-1">{new Date(order.created_at).toLocaleDateString()} • {order.items.length} items</p>
                            <p className="text-[16px] font-bold text-[#e5e2e1]">{order.total_amount_etb} Br</p>
                          </div>
                          <div>
                            <button onClick={() => setSelectedReceiptOrder(order)} className="h-9 px-4 rounded-full border border-[#514345] text-[#d5c2c3] text-[14px] hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors w-full sm:w-auto">View Receipt</button>
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

        {/* TAB: ADDRESSES */}
        {activeTab === 'addresses' && (
          <div className="space-y-8 animate-fade-in">
            <div className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-6">
              <h3 className="font-display text-[24px] mb-5">Add New Address</h3>
              {addrMsg && <div className={`mb-4 p-3 rounded-[12px] text-[14px] ${addrMsg.includes('success') ? 'bg-[#3b141c] text-[#f7b5be]' : 'bg-red-950 text-red-200'}`}>{addrMsg}</div>}
              <form onSubmit={handleAddAddress} className="space-y-4">
                <div>
                  <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">Street Address</label>
                  <input type="text" required value={streetAddress} onChange={e => setStreetAddress(e.target.value)} className="w-full h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" placeholder="Bole Road, House 123" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">City</label>
                    <input type="text" value="Addis Ababa" disabled className="w-full h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 text-[#9e8d8e] cursor-not-allowed opacity-70" />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">Subcity / Zone</label>
                    <input type="text" value={subcityOrZone} onChange={e => setSubcityOrZone(e.target.value)} className="w-full h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" placeholder="Bole, Arada, etc." />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-2 w-max">
                  <input type="checkbox" checked={isDefaultAddr} onChange={e => setIsDefaultAddr(e.target.checked)} className="rounded border-[#514345] bg-[#131313] text-[#f7b5be] focus:ring-[#f7b5be]" />
                  <span className="text-[14.5px] text-[#d5c2c3]">Set as default delivery address</span>
                </label>
                <button type="submit" className="mt-4 h-11 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">Save Address</button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="font-display text-[24px] mb-4">Saved Addresses</h3>
              {addresses.length === 0 ? (
                <p className="text-[#9e8d8e] text-[15px]">No saved addresses yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map(addr => (
                    <div key={addr.id} className="bg-[#1c1b1b] border border-[#514345] rounded-[18px] p-5 relative group">
                      {addr.is_default && (
                        <span className="absolute top-4 right-4 text-[10px] uppercase font-bold tracking-wider bg-[#3b141c] text-[#f7b5be] px-2 py-0.5 rounded">Default</span>
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
              <h3 className="font-display text-[24px] mb-5">Personal Details</h3>
              {profileMsg && <div className={`mb-4 p-3 rounded-[12px] text-[14px] ${profileMsg.includes('success') ? 'bg-[#3b141c] text-[#f7b5be]' : 'bg-red-950 text-red-200'}`}>{profileMsg}</div>}
              
              <div className="mb-6">
                <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">Username / Email</label>
                <div className="h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 flex items-center text-[#9e8d8e] opacity-70">
                  {user.email || user.username}
                </div>
                <p className="text-[#514345] text-xs mt-1">Username/email cannot be changed here.</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">First Name</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">Last Name</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] text-[#9e8d8e] uppercase tracking-wider mb-2">Phone Number</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full h-11 bg-[#131313] border border-[#514345] rounded-[12px] px-4 text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]" placeholder="+251 911 234567" />
                </div>
                <button type="submit" className="mt-4 h-11 px-6 rounded-full bg-[#f7b5be] text-[#4e232b] font-semibold hover:bg-[#ffd9dd] transition-colors">Update Profile</button>
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
    </div>
  );
}

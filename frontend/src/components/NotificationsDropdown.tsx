'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsDropdown() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const response = await apiFetch('/api/v1/auth/notifications/', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000); // Poll every 15s
      return () => clearInterval(interval);
    }
    // Deliberately keyed on `user` alone. fetchNotifications is recreated on every
    // render, so depending on it would reset the 15s poll continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    try {
      const response = await apiFetch('/api/v1/auth/notifications/mark_all_read/', {
        method: 'POST',
      });
      if (response.ok) {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      }
    } catch (err) {
      console.error('Failed to mark notifications as read', err);
    }
  };

  const markOneAsRead = async (id: string) => {
    try {
      await apiFetch(`/api/v1/auth/notifications/${id}/mark_read/`, {
        method: 'POST',
      });
    } catch (err) {
      // Non-critical: just update local state
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleNotificationClick = async (notification: Notification) => {
    setIsOpen(false);
    await markOneAsRead(notification.id);

    // Resolve the target URL: use notification's link field if available,
    // otherwise fall back to role-based routing.
    const target = notification.link ||
      ((user?.role === 'ADMIN' || user?.role === 'MANAGER') ? '/manager' : '/account');

    router.push(target);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!user) return null;

  const getNotificationIcon = (title: string) => {
    if (title.toLowerCase().includes('payment') || title.toLowerCase().includes('awaiting')) return 'payments';
    if (title.toLowerCase().includes('completed') || title.toLowerCase().includes('ready')) return 'check_circle';
    if (title.toLowerCase().includes('rejected') || title.toLowerCase().includes('cancelled')) return 'cancel';
    if (title.toLowerCase().includes('new order') || title.toLowerCase().includes('received')) return 'receipt_long';
    if (title.toLowerCase().includes('preparing') || title.toLowerCase().includes('brew')) return 'coffee_maker';
    return 'notifications';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('Notifications')}
        className="relative w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:text-tertiary transition-colors bg-surface-container/60 border border-white/5"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(239,68,68,0.5)] animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-[420px] overflow-y-auto bg-primary-container border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-fade-in">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-white/10 flex justify-between items-center sticky top-0 bg-primary-container/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-on-surface text-sm">{t('Notifications')}</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs text-tertiary hover:underline">
                {t('Mark all read')}
              </button>
            )}
          </div>

          <div className="flex flex-col">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-2">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">notifications_none</span>
                <p className="text-on-surface-variant text-xs">{t('No notifications yet')}.</p>
              </div>
            ) : (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors flex items-start gap-3 ${
                    !notification.is_read ? 'bg-tertiary/10' : ''
                  }`}
                >
                  {/* Icon */}
                  <span className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                    !notification.is_read
                      ? 'bg-tertiary/20 text-tertiary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined text-[16px]">
                      {getNotificationIcon(notification.title)}
                    </span>
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-1 mb-0.5">
                      <h4 className={`text-xs font-semibold leading-tight ${
                        !notification.is_read ? 'text-tertiary' : 'text-on-surface'
                      }`}>
                        {notification.title}
                      </h4>
                      <span className="text-[10px] text-on-surface-variant shrink-0">
                        {new Date(notification.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                      {notification.message}
                    </p>
                    {notification.link && (
                      <span className="text-[10px] text-tertiary/60 mt-0.5 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                        {notification.link.includes('/manager') ? t('View in Dashboard') : t('View My Orders')}
                      </span>
                    )}
                  </div>

                  {!notification.is_read && (
                    <span className="w-2 h-2 rounded-full bg-tertiary shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

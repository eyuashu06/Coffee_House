'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

export function resolveNotificationTarget(notification: Notification, userRole?: string): string {
  const isManagerPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/manager');
  const isStaff = userRole === 'ADMIN' || userRole === 'MANAGER' || isManagerPath;
  const fullText = `${notification.title || ''} ${notification.message || ''} ${notification.link || ''}`;

  // Extract order code e.g. ORD-20261017-8479
  const orderMatch = fullText.match(/ORD-[\w-]+/i);
  // Extract reservation code e.g. RES-20261017-8479
  const resMatch = fullText.match(/RES-[\w-]+/i);

  if (orderMatch) {
    const code = orderMatch[0];
    return isStaff
      ? `/manager?tab=orders&order=${encodeURIComponent(code)}`
      : `/account?tab=orders&highlight=${encodeURIComponent(code)}`;
  }

  if (resMatch || /reserv|table|booking|ማስያዝ|መጠባበቂያ/i.test(fullText)) {
    const code = resMatch ? resMatch[0] : '';
    return isStaff
      ? (code ? `/manager?tab=reservations&highlight=${encodeURIComponent(code)}` : `/manager?tab=reservations`)
      : (code ? `/account?tab=reservations&highlight=${encodeURIComponent(code)}` : `/account?tab=reservations`);
  }

  if (/menu|item|dish|price|ምግብ|መጠጥ/i.test(fullText)) {
    return isStaff ? `/manager?tab=menu` : `/#menu`;
  }

  if (notification.link && notification.link.trim()) {
    let rawLink = notification.link.trim();
    if (isStaff) {
      if (rawLink.startsWith('/account')) {
        rawLink = '/manager?tab=orders';
      }
      if (rawLink === '/manager' || rawLink.startsWith('/manager?order=')) {
        rawLink = rawLink.replace('/manager?order=', '/manager?tab=orders&order=');
      }
    } else {
      if (rawLink.startsWith('/manager')) {
        rawLink = '/account?tab=orders';
      }
    }
    return rawLink;
  }

  return isStaff ? '/manager?tab=orders' : '/account?tab=orders';
}

export default function NotificationsDropdown() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 12000); // Poll every 12s
      return () => clearInterval(interval);
    }
  }, [user, fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
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
    } catch {
      // Non-critical: just update local state
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleNotificationClick = async (notification: Notification) => {
    setIsOpen(false);
    // Mark as read immediately in background
    markOneAsRead(notification.id);

    // Actively redirect the user directly to the exact target where the event happened
    const targetUrl = resolveNotificationTarget(notification, user?.role);
    if (!targetUrl) return;

    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const targetPath = targetUrl.split('?')[0];

      if (currentPath === targetPath) {
        // Same page: update browser URL and dispatch event for instant in-page tab/item switch
        window.history.pushState({}, '', targetUrl);
        window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { targetUrl, notification } }));
        router.push(targetUrl);
      } else {
        // Different page: use router.push, with fallback
        router.push(targetUrl);
        setTimeout(() => {
          if (window.location.pathname !== targetPath) {
            window.location.href = targetUrl;
          }
        }, 350);
      }
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!user) return null;

  const getNotificationIconPh = (title: string, message: string) => {
    const text = `${title} ${message}`.toLowerCase();
    if (text.includes('payment') || text.includes('awaiting') || text.includes('ክፍያ')) return 'ph ph-credit-card';
    if (text.includes('completed') || text.includes('ready') || text.includes('ተጠናቋል')) return 'ph ph-check-circle';
    if (text.includes('rejected') || text.includes('cancelled') || text.includes('ተሰርዟል')) return 'ph ph-x-circle';
    if (text.includes('order') || text.includes('received') || text.includes('ትዕዛዝ')) return 'ph ph-receipt';
    if (text.includes('reserv') || text.includes('table') || text.includes('ማስያዝ')) return 'ph ph-calendar-check';
    if (text.includes('menu') || text.includes('brew') || text.includes('ቡና')) return 'ph ph-coffee';
    return 'ph ph-bell';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label={t('Notifications')}
        aria-expanded={isOpen}
        className={`relative w-9.5 h-9.5 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all border cursor-pointer ${
          isOpen
            ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
            : 'bg-surface-2 border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
        }`}
      >
        <i className="ph ph-bell text-[19px]"></i>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(239,68,68,0.5)] animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-32px)] max-w-sm sm:w-96 max-h-[460px] overflow-y-auto bg-surface-2 border border-[var(--border)] rounded-[20px] shadow-2xl py-2 z-[100] animate-fade-in backdrop-blur-md">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center sticky top-0 bg-surface-2/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text)] text-[14.5px]">{t('Notifications')}</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/30 text-[10px] font-bold">
                  {unreadCount} {t('unread')}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
                className="text-xs text-[var(--accent)] hover:underline font-semibold cursor-pointer"
              >
                {t('Mark all read')}
              </button>
            )}
          </div>

          <div className="flex flex-col divide-y divide-[var(--border)]">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-surface border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--muted)]">
                  <i className="ph ph-bell-slash text-2xl"></i>
                </div>
                <p className="text-[var(--muted)] text-[13px]">{t('No notifications yet')}.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const target = resolveNotificationTarget(notification, user?.role);
                const orderCode = (`${notification.title} ${notification.message}`).match(/ORD-[\w-]+/i)?.[0];
                const resCode = (`${notification.title} ${notification.message}`).match(/RES-[\w-]+/i)?.[0];

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNotificationClick(notification);
                    }}
                    className={`w-full text-left p-3.5 hover:bg-[var(--accent-soft)]/30 transition-all flex items-start gap-3 group relative cursor-pointer ${
                      !notification.is_read ? 'bg-[var(--accent-soft)]/20' : ''
                    }`}
                  >
                    {/* Unread Indicator Bar */}
                    {!notification.is_read && (
                      <span className="absolute left-0 top-3 bottom-3 w-1 bg-[var(--accent)] rounded-r-full" />
                    )}

                    {/* Icon */}
                    <span
                      className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        !notification.is_read
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                          : 'bg-surface border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      <i className={`${getNotificationIconPh(notification.title, notification.message)} text-[18px]`}></i>
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex justify-between items-start gap-1 mb-1">
                        <h4
                          className={`text-[13px] font-bold leading-tight group-hover:text-[var(--accent)] transition-colors ${
                            !notification.is_read ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                          }`}
                        >
                          {notification.title}
                        </h4>
                        <span className="text-[10px] text-[var(--muted)] shrink-0 font-mono mt-0.5">
                          {new Date(notification.created_at).toLocaleTimeString(locale, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-[12.5px] text-[var(--muted)] line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>

                      {/* Interactive Link Action Indicator */}
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notification);
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline cursor-pointer py-0.5"
                        >
                          <span>
                            {orderCode
                              ? `${t('View Order')} #${orderCode}`
                              : resCode
                              ? `${t('View Reservation')} #${resCode}`
                              : target.includes('/manager')
                              ? t('Open in Dashboard')
                              : t('View Details')}
                          </span>
                          <i className="ph ph-arrow-up-right text-xs group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"></i>
                        </span>

                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-sm shrink-0"></span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

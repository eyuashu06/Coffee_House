'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface MenuItem {
  id: number;
  name: string;
  category_slug: string;
  category_name: string;
  price: string;
  base_price_etb?: string;
  description: string;
  image_url: string;
  is_signature: boolean;
  is_available?: boolean;
  variants?: { id: number; name: string; price_modifier_etb: string }[];
  add_ons?: { id: number; name: string; price_etb: string }[];
}

interface MenuContextType {
  items: MenuItem[];
  menuStatus: 'idle' | 'loading' | 'ready' | 'error';
  fetchMenu: (forceRefresh?: boolean) => Promise<void>;
  refreshMenu: () => Promise<void>;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

const MENU_CACHE_KEY = 'buna_cached_menu_items';
const MENU_CACHE_TIME_KEY = 'buna_cached_menu_time';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes fresh cache

function readStoredMenu(): MenuItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MENU_CACHE_KEY) || localStorage.getItem(MENU_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredMenuTime(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = sessionStorage.getItem(MENU_CACHE_TIME_KEY) || localStorage.getItem(MENU_CACHE_TIME_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

// In-memory module-level cache for instant rendering without re-fetching or skeleton spinners
let cachedMenuItems: MenuItem[] | null = null;
let cacheTimestamp = 0;

export function MenuProvider({ children }: { children: React.ReactNode }) {
  // Start with deterministic SSR-safe defaults so initial hydration matches
  // server HTML, then hydrate cached menu items on mount.
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuStatus, setMenuStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!cachedMenuItems) {
      cachedMenuItems = readStoredMenu();
      cacheTimestamp = readStoredMenuTime();
    }
    if (cachedMenuItems && cachedMenuItems.length > 0) {
      setItems(cachedMenuItems);
      setMenuStatus('ready');
    }
  }, []);

  const fetchMenu = useCallback(async (forceRefresh = false) => {
    const isCacheValid = Boolean(cachedMenuItems && cachedMenuItems.length > 0 && Date.now() - cacheTimestamp < CACHE_DURATION_MS);
    if (!forceRefresh && isCacheValid && cachedMenuItems && cachedMenuItems.length > 0) {
      setItems(cachedMenuItems);
      setMenuStatus('ready');
      return;
    }

    // Only show loading spinner if we don't have cached data yet
    setMenuStatus((prev) => (cachedMenuItems && cachedMenuItems.length > 0 ? 'ready' : 'loading'));

    try {
      const res = await fetch('/api/v1/menu/items/?page_size=200');
      if (!res.ok) throw new Error(`Menu request failed (${res.status})`);
      const data = await res.json();
      const list: MenuItem[] = Array.isArray(data) ? data : data.results || [];
      const availableList = list.filter((item) => item.is_available !== false);

      cachedMenuItems = availableList;
      cacheTimestamp = Date.now();

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify(availableList));
          sessionStorage.setItem(MENU_CACHE_TIME_KEY, String(cacheTimestamp));
        } catch {}
      }

      setItems(availableList);
      setMenuStatus('ready');
    } catch (e) {
      console.error('MenuContext fetch error:', e);
      if (!cachedMenuItems || cachedMenuItems.length === 0) {
        setMenuStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    // Only fetch if cache is empty or expired
    const isCacheValid = Boolean(cachedMenuItems && cachedMenuItems.length > 0 && Date.now() - cacheTimestamp < CACHE_DURATION_MS);
    if (!isCacheValid) {
      void fetchMenu();
    }
  }, [fetchMenu]);

  const refreshMenu = useCallback(async () => {
    await fetchMenu(true);
  }, [fetchMenu]);

  return (
    <MenuContext.Provider value={{ items, menuStatus, fetchMenu, refreshMenu }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenu must be used within a MenuProvider');
  }
  return context;
}

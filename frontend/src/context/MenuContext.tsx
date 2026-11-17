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

// In-memory module-level cache for instant rendering without re-fetching or skeleton spinners
let cachedMenuItems: MenuItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes fresh cache

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MenuItem[]>(() => cachedMenuItems || []);
  const [menuStatus, setMenuStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(() => {
    return cachedMenuItems && cachedMenuItems.length > 0 ? 'ready' : 'idle';
  });

  const fetchMenu = useCallback(async (forceRefresh = false) => {
    const isCacheValid = Boolean(cachedMenuItems && Date.now() - cacheTimestamp < CACHE_DURATION_MS);
    if (!forceRefresh && isCacheValid && cachedMenuItems && cachedMenuItems.length > 0) {
      setItems(cachedMenuItems);
      setMenuStatus('ready');
      return;
    }

    // Only show loading if we don't have cached data yet
    setMenuStatus((prev) => (cachedMenuItems && cachedMenuItems.length > 0 ? 'ready' : 'loading'));

    try {
      const res = await fetch('/api/v1/menu/items/?page_size=200');
      if (!res.ok) throw new Error(`Menu request failed (${res.status})`);
      const data = await res.json();
      const list: MenuItem[] = Array.isArray(data) ? data : data.results || [];
      const availableList = list.filter((item) => item.is_available !== false);

      cachedMenuItems = availableList;
      cacheTimestamp = Date.now();

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
    if (!cachedMenuItems || cachedMenuItems.length === 0) {
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

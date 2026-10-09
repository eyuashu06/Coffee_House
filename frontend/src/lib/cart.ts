/**
 * Server-side cart, kept in step with the browser cart.
 *
 * The cart used to live only in React state on the home page, which meant a refresh,
 * a closed tab or a second device threw the order away, and signing in did nothing to
 * it. Signed-in customers now have a cart in the database; guests still browse with a
 * local cart and it is merged into the account cart at sign-in.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

export interface CartLineOption {
  id: number;
  name: string;
  price_modifier_etb?: string;
  price_etb?: string;
}

/** One line, as the API returns it. Prices are the server's, never ours. */
export interface ServerCartLine {
  id: number;
  menu_item: number;
  menu_item_id?: number;
  menu_item_name: string;
  menu_item_available: boolean;
  variant: number | null;
  variant_label: string | null;
  add_on_labels: string[];
  quantity: number;
  temperature: string;
  milk_choice: string;
  notes: string;
  unit_price_etb: string;
  subtotal_etb: string;
}

export interface ServerCart {
  id: number;
  items: ServerCartLine[];
  total_etb: string;
  item_count: number;
  updated_at: string;
}

/** What the home page keeps for a guest, mirrored to localStorage so a refresh survives. */
export interface LocalCartLine {
  /** Stable client id so quantity changes can find the line again. */
  lineKey: string;
  coffee: { id: number; name: string; price: string | number; image_url?: string };
  quantity: number;
  temperature: string;
  milk: string;
  variant?: CartLineOption | null;
  addOns?: CartLineOption[];
}

const LOCAL_CART_KEY = 'artisanal-reserve:guest-cart';

export function localCartKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LOCAL_CART_KEY);
}

export function saveLocalCart(lines: LocalCartLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(lines));
  } catch {
    // Private mode / quota: the cart simply stays in memory for this page.
  }
}

export function readLocalCart(): LocalCartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalCartLine[]) : [];
  } catch {
    return [];
  }
}

export function clearLocalCart(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_CART_KEY);
}

/** The shape the API accepts when merging a guest cart into an account cart. */
function toMergePayload(lines: LocalCartLine[]) {
  return {
    items: lines.map((line) => ({
      menu_item_id: line.coffee.id,
      quantity: line.quantity,
      variant_name: line.variant?.name || '',
      add_on_names: (line.addOns || []).map((addon) => addon.name),
      temperature: line.temperature,
      milk_choice: line.milk,
    })),
  };
}

export interface UseCartResult {
  cart: ServerCart | null;
  isLoading: boolean;
  error: string | null;
  isSignedIn: boolean;
  reload: () => Promise<void>;
  addLine: (line: Omit<LocalCartLine, 'lineKey'>) => Promise<boolean>;
  setQuantity: (lineId: number, quantity: number) => Promise<boolean>;
  removeLine: (lineId: number) => Promise<boolean>;
  clearCart: () => Promise<void>;
  /** Push the guest's local cart into the account cart and drop the local copy. */
  syncGuestCart: () => Promise<void>;
}

export function useCart(isSignedIn: boolean): UseCartResult {
  const [cart, setCart] = useState<ServerCart | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!isSignedIn) {
      setCart(null);
      return;
    }
    // A poll landing on top of a write would render stale lines over fresh ones.
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/v1/cart/');
      if (!res.ok) throw new Error(`cart ${res.status}`);
      setCart((await res.json()) as ServerCart);
      setError(null);
    } catch {
      setError('We could not load your saved cart.');
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addLine = useCallback(
    async (line: Omit<LocalCartLine, 'lineKey'>) => {
      if (!isSignedIn) return false;
      const res = await apiFetch('/api/v1/cart/items/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_item_id: line.coffee.id,
          quantity: line.quantity,
          variant_name: line.variant?.name || '',
          add_on_names: (line.addOns || []).map((addon) => addon.name),
          temperature: line.temperature,
          milk_choice: line.milk,
        }),
      });
      if (!res.ok) return false;
      setCart((await res.json()) as ServerCart);
      return true;
    },
    [isSignedIn]
  );

  const setQuantity = useCallback(async (lineId: number, quantity: number) => {
    const res = await apiFetch(`/api/v1/cart/items/${lineId}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) return false;
    setCart((await res.json()) as ServerCart);
    return true;
  }, []);

  const removeLine = useCallback(async (lineId: number) => {
    const res = await apiFetch(`/api/v1/cart/items/${lineId}/`, { method: 'DELETE' });
    if (!res.ok) return false;
    setCart((await res.json()) as ServerCart);
    return true;
  }, []);

  const clearCart = useCallback(async () => {
    clearLocalCart();
    if (!isSignedIn) return;
    const res = await apiFetch('/api/v1/cart/merge/', { method: 'DELETE' });
    if (res.ok) setCart((await res.json()) as ServerCart);
  }, [isSignedIn]);

  const syncGuestCart = useCallback(async () => {
    if (!isSignedIn) return;
    const guestLines = readLocalCart();
    if (guestLines.length > 0) {
      const res = await apiFetch('/api/v1/cart/merge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toMergePayload(guestLines)),
      });
      // Only drop the local copy once the server has actually taken the lines, so a
      // failed merge leaves the guest cart intact instead of losing the order.
      if (res.ok) {
        clearLocalCart();
        setCart((await res.json()) as ServerCart);
        return;
      }
    }
    clearLocalCart();
    await reload();
  }, [isSignedIn, reload]);

  return {
    cart,
    isLoading,
    error,
    isSignedIn,
    reload,
    addLine,
    setQuantity,
    removeLine,
    clearCart,
    syncGuestCart,
  };
}
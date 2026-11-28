'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';

export interface HomepageSlide {
  src: string;
  alt: string;
  caption?: string;
}

export const DEFAULT_HERO_SLIDES: HomepageSlide[] = [
  {
    src: '/images/ethiopian_ceremony.jpg',
    alt: 'Traditional Ethiopian buna ceremony in Addis Ababa pouring from a clay jebena',
    caption: 'The traditional buna ceremony, poured from a clay jebena.',
  },
  {
    src: '/images/ethiopian_burger_cafe_1.jpg',
    alt: 'Artisanal burgers served with cold soft drinks on a wooden board',
    caption: 'Prime artisanal burgers and hand-cut fries fresh from our kitchen.',
  },
  {
    src: '/images/ethiopian_gathering_pizza.jpg',
    alt: 'Ethiopian friends gathered around a cafe table sharing fresh pizza and crispy fries',
    caption: 'Friends gathered together enjoying fresh pizza and crispy fries at the cafe.',
  },
  {
    src: '/images/ethiopian_roasting.jpg',
    alt: 'Fresh Ethiopian coffee beans roasting over hot coals with clay jebena and incense',
    caption: 'The morning roast, done where everyone can smell it.',
  },
  {
    src: '/images/ethiopian_pizza_cafe_2.jpg',
    alt: 'Freshly baked artisan wood-fired pizza on a marble cafe table',
    caption: 'Crisp wood-fired pizza shared among friends and family.',
  },
  {
    src: '/images/ethiopian_cafe.jpg',
    alt: 'Friends clinking warm cafe lattes and iced coffee at a wooden table',
    caption: 'A warm gathering over fresh coffee in Addis Ababa.',
  },
];

export const DEFAULT_DINING_SLIDES: HomepageSlide[] = [
  {
    src: '/images/ethiopian_gathering_pizza.jpg',
    alt: 'Ethiopian friends gathered together sharing freshly baked pizza and golden fries',
    caption: 'Friends gathered together enjoying fresh pizza and crispy fries at the cafe.',
  },
  {
    src: '/images/ethiopian_cafe_food_5.jpg',
    alt: 'Traditional painted Ethiopian clay jebena and sini coffee cups on woven basket tray',
    caption: 'Three slow pours — abol, tona, and baraka — from our clay jebena.',
  },
  {
    src: '/images/ethiopian_burger_cafe_1.jpg',
    alt: 'Artisanal burgers on a wooden board with chilled soft drinks',
    caption: 'Artisanal smash burgers made fresh with prime local beef.',
  },
  {
    src: '/images/ethiopian_pizza_cafe_2.jpg',
    alt: 'Freshly baked Neapolitan wood-fired margherita pizza',
    caption: 'Sharing freshly baked wood-fired pizza with loved ones.',
  },
  {
    src: '/images/ethiopian_burger_dining_3.jpg',
    alt: 'Double cheeseburger layered with melted cheddar and crisp greens',
    caption: 'Hearty smash burgers and crisp seasoned fries for table gatherings.',
  },
  {
    src: '/images/ethiopian_pizza_dining_4.jpg',
    alt: 'Wood-fired cheese pizza sliced fresh on an oak board with herbs',
    caption: 'Crisp artisan crusts, rich cheese, and great conversations.',
  },
];

export interface CafeSettings {
  id?: number;
  cafe_name: string;
  tagline: string;
  description: string;
  primary_phone: string;
  contact_email: string;
  opening_hours: string;
  ceremony_time: string;
  hero_slides?: HomepageSlide[];
  dining_slides?: HomepageSlide[];
}

export interface CafeLocation {
  id: number;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  opening_hours: string;
  is_primary: boolean;
  is_active: boolean;
  display_order: number;
}

export interface PromotionalEvent {
  id: number;
  title: string;
  subtitle: string;
  badge_text: string;
  kind: 'EVENT' | 'DISCOUNT' | 'AD';
  discount_percent: number;
  promo_code: string;
  min_order_etb: string;
  cta_label: string;
  cta_href: string;
  image_url: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  is_live_now: boolean;
  created_at?: string;
  updated_at?: string;
}

interface CafeContextType {
  settings: CafeSettings;
  locations: CafeLocation[];
  events: PromotionalEvent[];
  primaryLocation: CafeLocation | null;
  isLoading: boolean;
  refreshCafeData: () => Promise<void>;
  fetchAllEvents: () => Promise<PromotionalEvent[]>;
  updateSettings: (data: Partial<CafeSettings>) => Promise<boolean>;
  addLocation: (data: Partial<CafeLocation>) => Promise<boolean>;
  updateLocation: (id: number, data: Partial<CafeLocation>) => Promise<boolean>;
  deleteLocation: (id: number) => Promise<boolean>;
  createEvent: (data: Partial<PromotionalEvent>) => Promise<PromotionalEvent | null>;
  updateEvent: (id: number, data: Partial<PromotionalEvent>) => Promise<PromotionalEvent | null>;
  deleteEvent: (id: number) => Promise<boolean>;
}

const DEFAULT_SETTINGS: CafeSettings = {
  cafe_name: 'Buna Hub',
  tagline: 'Artisanal Reserve',
  description: 'An Ethiopian coffee house in Piassa — ceremony buna, slow teas, and a kitchen that stays open late.',
  primary_phone: '+251 11 555 0148',
  contact_email: 'selam@bunahub.et',
  opening_hours: '1:00 – 3:00',
  ceremony_time: '9:00 (ከቀኑ 9:00)',
};

const DEFAULT_LOCATION: CafeLocation = {
  id: 1,
  name: 'Piassa Flagship',
  address: 'Gulele Road 14, Piassa',
  city: 'Addis Ababa',
  phone: '+251 11 555 0148',
  email: 'selam@bunahub.et',
  opening_hours: '1:00 – 3:00',
  is_primary: true,
  is_active: true,
  display_order: 1,
};

const CafeContext = createContext<CafeContextType | undefined>(undefined);

export function CafeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CafeSettings>(DEFAULT_SETTINGS);
  const [locations, setLocations] = useState<CafeLocation[]>([DEFAULT_LOCATION]);
  const [events, setEvents] = useState<PromotionalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCafeData = useCallback(async () => {
    try {
      const [resSettings, resLocations, resEvents] = await Promise.all([
        fetch('/api/v1/cafe/settings/').catch(() => null),
        fetch('/api/v1/cafe/locations/').catch(() => null),
        fetch('/api/v1/cafe/events/').catch(() => null),
      ]);

      if (resSettings && resSettings.ok) {
        const data = await resSettings.json();
        if (data && data.cafe_name) {
          setSettings(data);
        }
      }

      if (resLocations && resLocations.ok) {
        const data = await resLocations.json();
        const list = Array.isArray(data) ? data : data.results || [];
        if (list.length > 0) {
          setLocations(list);
        }
      }

      if (resEvents && resEvents.ok) {
        const data = await resEvents.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setEvents(list);
      }
    } catch {
      // Use fallback defaults
    }
  }, []);

  const fetchAllEvents = useCallback(async (): Promise<PromotionalEvent[]> => {
    try {
      const res = await apiFetch('/api/v1/cafe/events/?all=true');
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : data.results || [];
      }
    } catch {
      // ignore
    }
    return [];
  }, []);

  useEffect(() => {
    refreshCafeData();
  }, [refreshCafeData]);

  const updateSettings = useCallback(async (data: Partial<CafeSettings>): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/v1/cafe/settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(prev => ({ ...prev, ...updated }));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const addLocation = useCallback(async (data: Partial<CafeLocation>): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/v1/cafe/locations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await refreshCafeData();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [refreshCafeData]);

  const updateLocation = useCallback(async (id: number, data: Partial<CafeLocation>): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/v1/cafe/locations/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await refreshCafeData();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [refreshCafeData]);

  const deleteLocation = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/v1/cafe/locations/${id}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await refreshCafeData();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [refreshCafeData]);

  const createEvent = useCallback(async (data: Partial<PromotionalEvent>): Promise<PromotionalEvent | null> => {
    try {
      const res = await apiFetch('/api/v1/cafe/events/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        await refreshCafeData();
        return created;
      }
    } catch {
      // ignore
    }
    return null;
  }, [refreshCafeData]);

  const updateEvent = useCallback(async (id: number, data: Partial<PromotionalEvent>): Promise<PromotionalEvent | null> => {
    try {
      const res = await apiFetch(`/api/v1/cafe/events/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        await refreshCafeData();
        return updated;
      }
    } catch {
      // ignore
    }
    return null;
  }, [refreshCafeData]);

  const deleteEvent = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/v1/cafe/events/${id}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await refreshCafeData();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [refreshCafeData]);

  const primaryLocation = useMemo(() => {
    return locations.find(l => l.is_primary) || locations[0] || DEFAULT_LOCATION;
  }, [locations]);

  const value = useMemo(
    () => ({
      settings,
      locations,
      events,
      primaryLocation,
      isLoading,
      refreshCafeData,
      fetchAllEvents,
      updateSettings,
      addLocation,
      updateLocation,
      deleteLocation,
      createEvent,
      updateEvent,
      deleteEvent,
    }),
    [
      settings,
      locations,
      events,
      primaryLocation,
      isLoading,
      refreshCafeData,
      fetchAllEvents,
      updateSettings,
      addLocation,
      updateLocation,
      deleteLocation,
      createEvent,
      updateEvent,
      deleteEvent,
    ]
  );

  return <CafeContext.Provider value={value}>{children}</CafeContext.Provider>;
}

export function useCafe() {
  const context = useContext(CafeContext);
  if (!context) {
    throw new Error('useCafe must be used within a CafeProvider');
  }
  return context;
}

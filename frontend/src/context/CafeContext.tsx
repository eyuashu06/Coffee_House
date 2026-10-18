'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';

export interface CafeSettings {
  id?: number;
  cafe_name: string;
  tagline: string;
  description: string;
  primary_phone: string;
  contact_email: string;
  opening_hours: string;
  ceremony_time: string;
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

interface CafeContextType {
  settings: CafeSettings;
  locations: CafeLocation[];
  primaryLocation: CafeLocation | null;
  isLoading: boolean;
  refreshCafeData: () => Promise<void>;
  updateSettings: (data: Partial<CafeSettings>) => Promise<boolean>;
  addLocation: (data: Partial<CafeLocation>) => Promise<boolean>;
  updateLocation: (id: number, data: Partial<CafeLocation>) => Promise<boolean>;
  deleteLocation: (id: number) => Promise<boolean>;
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
  const [isLoading, setIsLoading] = useState(false);

  const refreshCafeData = useCallback(async () => {
    try {
      const [resSettings, resLocations] = await Promise.all([
        fetch('/api/v1/cafe/settings/').catch(() => null),
        fetch('/api/v1/cafe/locations/').catch(() => null),
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
    } catch {
      // Use fallback defaults
    }
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

  const primaryLocation = useMemo(() => {
    return locations.find(l => l.is_primary) || locations[0] || DEFAULT_LOCATION;
  }, [locations]);

  const value = useMemo(
    () => ({
      settings,
      locations,
      primaryLocation,
      isLoading,
      refreshCafeData,
      updateSettings,
      addLocation,
      updateLocation,
      deleteLocation,
    }),
    [
      settings,
      locations,
      primaryLocation,
      isLoading,
      refreshCafeData,
      updateSettings,
      addLocation,
      updateLocation,
      deleteLocation,
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

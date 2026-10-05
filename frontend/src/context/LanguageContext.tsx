'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  translations,
  categoryTranslations,
  itemTranslations,
  variantTranslations,
  addonTranslations,
} from '../utils/translations';

type Language = 'en' | 'am';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
  /** BCP-47 tag for Intl APIs, so dates and numbers follow the chosen language. */
  locale: string;
  /** Translate a database category name (falls back to the English name). */
  tCategory: (name?: string) => string;
  /** Translate a menu item, variant or add-on name. */
  tItem: (name?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Read the saved preference during the initial render rather than in an effect.
  // With the effect, the very first paint always showed English and then swapped
  // to Amharic, so a page reload flashed the wrong language before correcting itself.
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = localStorage.getItem('app_lang');
    return saved === 'am' || saved === 'en' ? saved : 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_lang', lang);
    }
  };

  const toggleLanguage = () => {
    const next = language === 'en' ? 'am' : 'en';
    setLanguage(next);
  };

  const t = (key: string, fallback?: string): string => {
    if (language === 'en') return fallback || key;
    return translations[key] || fallback || key;
  };

  // 'am-ET' rather than plain 'am': Intl needs a region to pick the Ethiopian
  // calendar conventions and the correct time/number separators.
  const locale = language === 'am' ? 'am-ET' : 'en-ET';

  // Database content arrives in English. Look it up by its exact English text and
  // fall back to the original so a new item is never rendered blank.
  const lookup = (name: string | undefined, table: Record<string, string>): string => {
    if (!name) return '';
    if (language === 'en') return name;
    return table[name] || name;
  };

  const tCategory = (name?: string) => lookup(name, categoryTranslations);
  const tItem = (name?: string) =>
    lookup(name, itemTranslations) !== name
      ? lookup(name, itemTranslations)
      : lookup(name, variantTranslations) !== name
        ? lookup(name, variantTranslations)
        : lookup(name, addonTranslations);

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, toggleLanguage, t, locale, tCategory, tItem }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

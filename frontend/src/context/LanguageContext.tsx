'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: React.ReactNode;
  /**
   * Read from the `app_lang` cookie by the server layout and passed in here.
   *
   * Reading localStorage during the first render instead - which is what this did - means
   * the client's first render uses the stored language while the server's used the
   * default, and React rejects the result as a hydration mismatch. Persisting to a cookie
   * gives the server the same answer, so the two agree and there is nothing to correct.
   */
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // One-time migration for anyone who set a language before it was stored in a cookie:
  // adopt the old localStorage value so nobody silently drops back to English.
  useEffect(() => {
    const saved = localStorage.getItem('app_lang');
    if ((saved === 'am' || saved === 'en') && saved !== initialLanguage) {
      setLanguageState(saved);
    }
    // Runs once, on mount: this is only about inheriting a pre-cookie preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Stable across renders: these only touch a state setter and the DOM, so they can be
  // listed as effect dependencies without causing anything to re-run spuriously.
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_lang', lang);
    // Read by the server on the next request, so the page renders in the right
    // language from the first byte instead of swapping after hydration.
    document.cookie = `app_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const toggleLanguage = useCallback(() => {
    const next = language === 'en' ? 'am' : 'en';
    setLanguage(next);
  }, [language, setLanguage]);

  /**
   * The translation helpers are memoised on `language`.
   *
   * They were plain functions, so a new identity was created on every render of the
   * provider. Anything that captured one - a useCallback with [] deps, a polling
   * effect - then held the *old* function forever: switch to Amharic and a payment
   * banner raised afterwards would still be built from the English strings. It also
   * made them unsafe to list as effect dependencies, because that would have made
   * every effect re-run on every render.
   */
  const t = useCallback(
    (key: string, fallback?: string): string => {
      if (language === 'en') return fallback || key;
      return translations[key] || fallback || key;
    },
    [language]
  );

  // 'am-ET' rather than plain 'am': Intl needs a region to pick the Ethiopian
  // calendar conventions and the correct time/number separators.
  const locale = language === 'am' ? 'am-ET' : 'en-ET';

  // Database content arrives in English. Look it up by its exact English text and
  // fall back to the original so a new item is never rendered blank.
  const lookup = useCallback(
    (name: string | undefined, table: Record<string, string>): string => {
      if (!name) return '';
      if (language === 'en') return name;
      return table[name] || name;
    },
    [language]
  );

  const tCategory = useCallback(
    (name?: string) => lookup(name, categoryTranslations),
    [lookup]
  );

  const tItem = useCallback(
    (name?: string) =>
      lookup(name, itemTranslations) !== name
        ? lookup(name, itemTranslations)
        : lookup(name, variantTranslations) !== name
          ? lookup(name, variantTranslations)
          : lookup(name, addonTranslations),
    [lookup]
  );

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t, locale, tCategory, tItem }),
    [language, setLanguage, toggleLanguage, t, locale, tCategory, tItem]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

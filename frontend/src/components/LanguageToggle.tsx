'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Language switch that always advertises the *other* language, so the label is
 * "what you will get", not "where you are":
 *
 *   English UI  ->  button reads "አማ"  (switch to Amharic)
 *   Amharic UI  ->  button reads "EN"   (switch to English)
 */
export default function LanguageToggle({
  className = '',
  compact = false,
}: {
  className?: string;
  /** Icon-only form for tight headers. */
  compact?: boolean;
}) {
  const { language, toggleLanguage } = useLanguage();

  const nextLabel = language === 'en' ? 'አማ' : 'EN';
  const nextFlag = language === 'en' ? '🇪🇹' : '🇬🇧';
  const title = language === 'en'
    ? 'Switch to Amharic / ወደ አማርኛ ቀይር'
    : 'Switch to English / ወደ እንግሊዝኛ ቀይር';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={title}
      aria-label={title}
      lang={language}
      data-testid="language-toggle"
      suppressHydrationWarning
      className={className || (
        'h-9 px-3 rounded-[28px] border border-[#514345] text-[#d5c2c3] text-[14px] flex items-center '
        + 'gap-1.5 hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors'
      )}
    >
      {/* The material-symbols font renders as text ligatures; explicit font size and
          line-height ensure crisp icon rendering without layout shifts. */}
      <span
        className="material-symbols-outlined text-[18px] leading-none"
        style={{ fontSize: 18, lineHeight: 1, display: 'inline-block', fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
        suppressHydrationWarning
      >
        translate
      </span>
      {compact ? (
        <span className="sr-only">{title}</span>
      ) : (
        <span className="font-semibold whitespace-nowrap">{nextFlag} {nextLabel}</span>
      )}
    </button>
  );
}
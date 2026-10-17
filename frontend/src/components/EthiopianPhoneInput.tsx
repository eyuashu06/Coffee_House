'use client';

import React, { useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

export interface EthiopianPhoneInputProps {
  id?: string;
  name?: string;
  value?: string;
  onChange: (fullPhoneNumber: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}

/**
 * Extracts 9-digit Ethiopian mobile number (starting with 9 or 7) from any phone string.
 */
export function extractEthiopianDigits(raw: string): string {
  if (!raw) return '';
  // Remove non-digits
  let digits = raw.replace(/\D/g, '');

  // Strip international prefix if present
  if (digits.startsWith('251')) {
    digits = digits.slice(3);
  }
  // Strip leading 0 if present (e.g. 0911 -> 911)
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Filter to digits starting with 9 or 7 and max 9 digits
  if (digits.length > 0 && !digits.startsWith('9') && !digits.startsWith('7')) {
    // If user somehow pasted something without 9 or 7, find first 9 or 7
    const idx = digits.search(/[79]/);
    if (idx !== -1) {
      digits = digits.slice(idx);
    } else {
      return '';
    }
  }

  return digits.slice(0, 9);
}

/**
 * Formats 9 digits as "9XX XXX XXX" for clean Ethiopian mobile display.
 */
export function formatEthiopianDisplay(digits: string): string {
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function EthiopianPhoneInput({
  id,
  name = 'phone',
  value = '',
  onChange,
  required = false,
  disabled = false,
  className = '',
  inputClassName = '',
  placeholder,
  autoFocus = false,
  'aria-label': ariaLabel,
}: EthiopianPhoneInputProps) {
  const { language } = useLanguage();

  const currentDigits = useMemo(() => extractEthiopianDigits(value), [value]);
  const displayValue = useMemo(() => formatEthiopianDisplay(currentDigits), [currentDigits]);

  const defaultPlaceholder =
    placeholder ||
    (language === 'am' ? '9... ወይም 7... (ለምሳሌ 911 234 567)' : '9... or 7... (e.g. 911 234 567)');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = extractEthiopianDigits(raw);

    if (digits.length === 0) {
      onChange('');
    } else {
      onChange(`+251${digits}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent non-numeric characters from being typed (except control keys)
    if (
      e.key.length === 1 &&
      !/[0-9]/.test(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      return;
    }

    // If typing the very first digit, enforce 9 or 7
    if (currentDigits.length === 0 && e.key.length === 1 && /[0-9]/.test(e.key)) {
      if (e.key === '0') {
        // If user typed 0, let them, but it will be stripped and waiting for 9/7
        return;
      }
      if (e.key !== '9' && e.key !== '7') {
        e.preventDefault();
      }
    }
  };

  return (
    <div
      className={`relative flex items-center rounded-[12px] bg-surface-2 border border-[var(--border)] focus-within:border-[var(--accent)] transition-all overflow-hidden ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
    >
      {/* Fixed Ethiopian Country Code Badge */}
      <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[var(--surface)] border-r border-[var(--border)] text-[var(--accent)] font-bold text-sm shrink-0 select-none">
        <span className="text-base leading-none">🇪🇹</span>
        <span className="tracking-wide text-xs sm:text-sm font-mono">+251</span>
      </div>

      {/* Number Input starting with 9 or 7 */}
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={defaultPlaceholder}
        aria-label={ariaLabel || (language === 'am' ? 'የስልክ ቁጥር' : 'Phone number')}
        className={`w-full h-full px-3.5 py-2.5 bg-transparent text-[var(--text)] text-[15px] font-mono tracking-wide placeholder:text-[var(--muted)]/60 placeholder:font-sans placeholder:text-[13px] focus:outline-none ${inputClassName}`}
      />
    </div>
  );
}

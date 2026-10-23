export type TextSize = 'small' | 'normal' | 'medium' | 'large';

export const TEXT_SIZE_STORAGE_KEY = 'preferred_text_size';

export function getSavedTextSize(): TextSize {
  if (typeof window === 'undefined') return 'normal';
  try {
    const val = localStorage.getItem(TEXT_SIZE_STORAGE_KEY) as TextSize | null;
    if (val === 'small' || val === 'normal' || val === 'medium' || val === 'large') {
      return val;
    }
  } catch {
    /* private mode fallback */
  }
  return 'normal';
}

export function applyTextSize(size: TextSize): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('data-text-size', size);
  window.dispatchEvent(new CustomEvent('text-size-change', { detail: { size } }));
}

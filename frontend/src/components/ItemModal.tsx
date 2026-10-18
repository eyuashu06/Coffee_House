'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MenuItem } from '../app/page';
import { useLanguage } from '../context/LanguageContext';

export interface SelectedVariant {
  id: number;
  name: string;
  price_modifier_etb: string;
}

export interface SelectedAddOn {
  id: number;
  name: string;
  price_etb: string;
}

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    temperature: string,
    milk: string,
    variant?: SelectedVariant | null,
    addOns?: SelectedAddOn[]
  ) => void;
}

const etb = (value: number, currency = 'Br') => `${value.toFixed(2)} ${currency}`;

export default function ItemModal({ isOpen, onClose, item, onAddToCart }: ItemModalProps) {
  const { t, tItem, language } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [quantityText, setQuantityText] = useState('1');
  const [temperature, setTemperature] = useState('Hot');
  const [milk, setMilk] = useState('None');
  const [variant, setVariant] = useState<SelectedVariant | null>(null);
  const [addOns, setAddOns] = useState<SelectedAddOn[]>([]);

  const variants: SelectedVariant[] = useMemo(() => (item?.variants as SelectedVariant[]) || [], [item]);
  const addOnOptions: SelectedAddOn[] = useMemo(() => (item?.add_ons as SelectedAddOn[]) || [], [item]);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setQuantityText('1');
      setTemperature('Hot');
      setMilk('None');
      setVariant(null);
      setAddOns([]);
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const basePrice = Number(item.base_price_etb ?? item.price ?? 0);
  const variantPrice = variant ? Number(variant.price_modifier_etb || 0) : 0;
  const addOnsPrice = addOns.reduce((sum, a) => sum + Number(a.price_etb || 0), 0);
  const unitPrice = basePrice + variantPrice + addOnsPrice;
  const lineTotal = unitPrice * quantity;

  // Match on the slug, never on the display name. The name is translated for
  // display, so testing it against English words would stop recognising drinks
  // (and start offering "Hot/Iced" on a pizza) the moment the UI switches to
  // Amharic.
  const isBeverage = ['micro-lot-coffee', 'espresso-infusions', 'premium-tea'].includes(
    (item.category_slug || '').toLowerCase()
  );

  // Amharic speakers write "ብር", not "Br".
  const birr = language === 'am' ? 'ብር' : 'Br';

  const applyQuantity = (next: number) => {
    const clamped = Math.max(1, Math.min(99, next || 1));
    setQuantity(clamped);
    setQuantityText(String(clamped));
  };

  const handleQuantityInput = (value: string) => {
    setQuantityText(value);
    const parsed = parseInt(value.replace(/\D/g, ''), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setQuantity(Math.min(99, parsed));
    }
  };

  const toggleAddOn = (option: SelectedAddOn) => {
    setAddOns(prev =>
      prev.some(a => a.id === option.id)
        ? prev.filter(a => a.id !== option.id)
        : [...prev, option]
    );
  };

  const handleAdd = () => {
    onAddToCart(
      item,
      quantity,
      isBeverage ? temperature : 'N/A',
      isBeverage ? milk : 'N/A',
      variant,
      addOns
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 animate-fade-in">
      <div className="relative w-full max-w-md bg-surface border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header image */}
        <div className="h-44 w-full relative shrink-0">
          <img
            src={item.image_url || 'https://images.pexels.com/photos/37756986/pexel-photo-37756986.jpeg?auto=compress&cs=tinysrgb&w=640&q=80'}
            alt={item.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white bg-black/40 hover:bg-black/60 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="absolute bottom-3 left-5 right-5">
            <h3 className="font-display text-2xl font-bold text-white">{tItem(item.name)}</h3>
            <p className="text-[var(--accent)] font-semibold text-sm mt-0.5">{etb(basePrice, birr)}</p>
          </div>
        </div>

        {/* Step 1 - options */}
        <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold">
            {t('Step 1 · Choose your options')}
          </p>

          {/* Variant / size */}
          {variants.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t('Size / Option')} <span className="text-[var(--accent)]">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {variants.map(v => {
                  const selected = variant?.id === v.id;
                  const modifier = Number(v.price_modifier_etb || 0);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVariant(selected ? null : v)}
                      className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                        selected
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
                          : 'bg-surface-2 border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]/60'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{tItem(v.name)}</span>
                      <span className="block text-[11px] opacity-80">
                        {modifier > 0 ? `+ ${etb(modifier, birr)}` : t('Included')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {addOnOptions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {t('Add-ons')}
              </label>
              <div className="space-y-2">
                {addOnOptions.map(option => {
                  const selected = addOns.some(a => a.id === option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleAddOn(option)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                        selected
                          ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                          : 'bg-surface-2 border-[var(--border)] hover:border-[var(--accent)]/60'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm text-[var(--text)]">
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            selected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'
                          }`}
                        >
                          {selected && <i className="ph ph-check text-[10px] text-[var(--accent-contrast)]"></i>}
                        </span>
                        {tItem(option.name)}
                      </span>
                      <span className="text-[11px] text-[var(--accent)] font-semibold">
                        + {etb(Number(option.price_etb || 0), birr)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Temperature / milk (beverages only) */}
          {isBeverage && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  {t('Temperature')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Hot', 'Iced'].map(temp => (
                    <button
                      key={temp}
                      type="button"
                      onClick={() => setTemperature(temp)}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors border ${
                        temperature === temp
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                          : 'bg-surface-2 border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {t(temp)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  {t('Milk')}
                </label>
                <select
                  value={milk}
                  onChange={e => setMilk(e.target.value)}
                  className="w-full bg-surface-2 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  {['None', 'Whole', 'Oat', 'Soy', 'Almond'].map(m => (
                    <option key={m} value={m}>{t(m)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2 - quantity */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold mb-2">
              {t('Step 2 · How many?')}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-surface-2 border border-[var(--border)] rounded-xl px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => applyQuantity(quantity - 1)}
                  disabled={quantity <= 1}
                  aria-label={t('Decrease quantity')}
                  className="w-8 h-8 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={quantityText}
                  onChange={e => handleQuantityInput(e.target.value)}
                  onBlur={() => applyQuantity(quantity)}
                  aria-label={t('Quantity')}
                  className="w-12 text-center bg-transparent text-[var(--text)] font-bold text-base focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => applyQuantity(quantity + 1)}
                  aria-label={t('Increase quantity')}
                  className="w-8 h-8 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  +
                </button>
              </div>
              <span className="text-[13px] text-[var(--muted)]">
                {etb(unitPrice, birr)} {t('each')}
                {quantity > 1 && <span className="text-[var(--accent)] font-bold"> × {quantity} = {etb(lineTotal, birr)}</span>}
              </span>
            </div>
          </div>

          {item.description && (
            <p className="text-[13px] text-[var(--muted)] leading-relaxed border-t border-[var(--border)] pt-3">
              {item.description}
            </p>
          )}
        </div>

        {/* Step 3 - confirm */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-surface-2 shrink-0">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold mb-2">
            {t('Step 3 · Review & add')}
          </p>
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-[var(--muted)]">
              {quantity} × {tItem(item.name)}
              {variant && <span className="text-[var(--accent)]"> ({tItem(variant.name)})</span>}
              {addOns.length > 0 && (
                <span className="text-[var(--muted)]"> + {addOns.map(a => tItem(a.name)).join(', ')}</span>
              )}
            </span>
            <span className="font-bold text-[var(--accent)]">{etb(lineTotal, birr)}</span>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="w-full py-3 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-sm uppercase tracking-wider hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <span>{t('Add to Cart')} ({quantity})</span>
            <span>•</span>
            <span>{etb(lineTotal, birr)}</span>
          </button>
          <p className="text-[10.5px] text-[var(--muted)] text-center mt-2">
            {t('Payment comes after this · you will choose Chapa or Cash on Delivery next')}
          </p>
        </div>
      </div>
    </div>
  );
}
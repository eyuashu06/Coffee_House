'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface OrderItem {
  id?: number;
  menu_item?: number | null;
  item_name: string;
  variant_name?: string;
  milk_choice?: string;
  unit_price_etb?: string;
  subtotal_etb?: string;
  quantity: number;
  temperature?: string;
  notes?: string;
}

interface Order {
  id: number;
  order_number: string;
  latest_payment?: { status: string } | null;
  /**
   * The backend's answer on whether money was captured, derived from whether any
   * payment for this order succeeded. Reading the newest attempt instead can
   * withhold the receipt from a customer who already paid.
   */
  payment_state?: 'paid' | 'settling' | 'failed' | 'unpaid';
  order_type: string;
  table_number?: string;
  contact_name: string;
  contact_phone: string;
  delivery_address?: string;
  total_amount_etb: string;
  status: string;
  created_at: string;
  items: OrderItem[];
}

interface ReceiptModalProps {
  order: Order | null;
  onClose: () => void;
}

const lineTotal = (item: OrderItem) =>
  Number(item.subtotal_etb ?? (Number(item.unit_price_etb || 0) * item.quantity)).toFixed(2);

export default function ReceiptModal({ order, onClose }: ReceiptModalProps) {
  const { t, tItem, locale, language } = useLanguage();
  const birr = language === 'am' ? 'ብር' : 'ETB';

  if (!order) return null;

  const ref = order.order_number || `ORD-${order.id}`;
  // A receipt is only ever issued for money that was actually captured.
  const paid = order.payment_state
    ? order.payment_state === 'paid'
    : order.latest_payment?.status === 'SUCCESS';

  const handleDownload = () => {
    if (!paid) return;
    // The downloaded file is a legal-ish artefact the customer keeps, so it is
    // written in the language they were browsing in.
    const text = `====================================
        ${t('Artisanal Reserve Cafe')}
====================================
${t('Receipt Ref:')} ${ref}
${t('Date:')} ${new Date(order.created_at).toLocaleString(locale)}
${t('Type:')} ${t(order.order_type, order.order_type)} ${order.table_number ? `(${t('Table')} ${order.table_number})` : ''}
${t('Customer:')} ${order.contact_name} (${order.contact_phone})
------------------------------------
${t('ITEMS:')}
${order.items.map(i => `${i.quantity}x ${tItem(i.item_name)}${i.variant_name ? ` (${tItem(i.variant_name)})` : ''} ${i.temperature && i.temperature !== 'Hot' ? `[${t(i.temperature)}]` : ''}${i.milk_choice && i.milk_choice !== 'None' ? `(${t(i.milk_choice)})` : ''} - ${lineTotal(i)} ${birr}`).join('\n')}
------------------------------------
${t('TOTAL AMOUNT:')} ${order.total_amount_etb} ${birr}
${t('Status:')} ${t(order.status, order.status)}
====================================
${t('Thank you for visiting Artisanal Cafe!')}
`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt_${ref}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-container border border-[#514345] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-[#e5e2e1] relative">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-dashed border-[#514345] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f7b5be] text-2xl">receipt_long</span>
            <div>
              <h3 className="font-bold text-[#f7b5be] text-sm tracking-wide">{t('RECEIPT CARD')}</h3>
              <p className="text-[10px] text-outline">{t('Ref:', 'ቁጥር፦')} {ref}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-transparent hover:bg-outline-variant/10 text-[#9e8d8e] transition-colors"
            title={t('Close')}
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Thermal Receipt Content Card */}
        {!paid ? (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-xs text-red-200 space-y-2">
            <p className="font-bold flex items-center gap-2">
              <i className="ph ph-warning-octagon"></i> {t('Payment not completed')}
            </p>
            <p>
              {t('Order')} {ref} — {t('has not been paid for yet, so a receipt cannot be issued. The receipt becomes available as soon as the payment is confirmed.', 'እስካሁን አልተከፈለም፣ ስለዚህ ደረሰኝ መስጠት አይቻልም። ክፍያው ከተረጋገጠ በኋላ ደረሰኙ ይገኛል።')}
            </p>
          </div>
        ) : (
        <div className="bg-surface-container-lowest border border-[#514345] rounded-xl p-4 font-mono text-xs text-[#9e8d8e] space-y-3 shadow-inner">
          <div className="text-center border-b border-dashed border-[#514345] pb-2">
            <p className="font-bold text-sm text-[#f7b5be]">{t('Artisanal Reserve Cafe')}</p>
            <p className="text-[10px] text-outline">{t('Bole Medhanialem, Addis Ababa')}</p>
            <p className="text-[10px] text-outline">{new Date(order.created_at).toLocaleString(locale)}</p>
          </div>

          <div className="text-[11px] space-y-0.5 border-b border-dashed border-[#514345] pb-2">
            <p>{t('Order Type:')} <span className="font-bold text-white">{t(order.order_type, order.order_type)}</span> {order.table_number && `(${t('Table')} ${order.table_number})`}</p>
            <p>{t('Customer:')} <span className="text-white">{order.contact_name}</span></p>
            <p>{t('Phone:')} <span className="text-white">{order.contact_phone}</span></p>
          </div>

          <div className="space-y-1.5 py-1 border-b border-dashed border-[#514345] max-h-48 overflow-y-auto pr-1">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-[11px]">
                <span className="truncate max-w-[180px]">
                  {item.quantity}x {tItem(item.item_name)} {item.milk_choice && item.milk_choice !== 'None' ? `(${t(item.milk_choice)})` : ''}
                </span>
                <span className="font-bold text-[#f7b5be]">{lineTotal(item)} {birr}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-1 font-bold text-sm text-[#f7b5be]">
            <span>{t('TOTAL AMOUNT:')}</span>
            <span>{order.total_amount_etb} {birr}</span>
          </div>
          <div className="pt-1 border-t border-dashed border-[#514345] text-[10px]">
            {t('Paid', 'ተከፍሏል')} · {order.latest_payment?.status === 'SUCCESS' ? t('confirmed') : ''}
          </div>
        </div>
        )}

        {/* Footer Actions inside Card Popup */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDownload}
            className="flex-1 py-3 px-6 bg-[#f7b5be] hover:brightness-110 text-[#4e232b] font-bold text-xs uppercase tracking-wider rounded-full flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>{t('Download')}</span>
          </button>
          <button
            onClick={onClose}
            className="py-3 px-6 bg-transparent border border-[#514345] hover:bg-outline-variant/10 text-[#9e8d8e] font-bold text-xs uppercase tracking-wider rounded-full transition-all"
          >
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
}

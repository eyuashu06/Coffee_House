'use client';

import React from 'react';

interface OrderItem {
  id?: number;
  item_name: string;
  variant_name?: string;
  unit_price_etb?: string;
  quantity: number;
  subtotal_etb: string;
  temperature?: string;
  milk_choice?: string;
}

interface Order {
  id: number;
  order_number: string;
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

export default function ReceiptModal({ order, onClose }: ReceiptModalProps) {
  if (!order) return null;

  const handleDownload = () => {
    const text = `====================================
        ARTISANAL RESERVE CAFE
====================================
Receipt Ref: #${order.order_number}
Date: ${new Date(order.created_at).toLocaleString()}
Type: ${order.order_type} ${order.table_number ? `(Table ${order.table_number})` : ''}
Customer: ${order.contact_name} (${order.contact_phone})
------------------------------------
ITEMS:
${order.items.map(i => `${i.quantity}x ${i.item_name} ${i.variant_name ? `(${i.variant_name})` : ''} - ${i.subtotal_etb} ETB`).join('\n')}
------------------------------------
TOTAL AMOUNT: ${order.total_amount_etb} ETB
Status: ${order.status}
====================================
Thank you for visiting Artisanal Cafe!
`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt_${order.order_number}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#131313]-container border border-[#514345] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-[#e5e2e1] relative">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-dashed border-[#514345] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f7b5be] text-2xl">receipt_long</span>
            <div>
              <h3 className="font-bold text-[#f7b5be] text-sm tracking-wide">RECEIPT CARD</h3>
              <p className="text-[10px] text-outline">Ref: #{order.order_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-transparent hover:bg-outline-variant/10 text-[#9e8d8e] transition-colors"
            title="Close"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Thermal Receipt Content Card */}
        <div className="bg-[#131313]-container-lowest border border-[#514345] rounded-xl p-4 font-mono text-xs text-[#9e8d8e] space-y-3 shadow-inner">
          <div className="text-center border-b border-dashed border-[#514345] pb-2">
            <p className="font-bold text-sm text-[#f7b5be]">ARTISANAL RESERVE CAFE</p>
            <p className="text-[10px] text-outline">Bole Medhanialem, Addis Ababa</p>
            <p className="text-[10px] text-outline">{new Date(order.created_at).toLocaleString()}</p>
          </div>

          <div className="text-[11px] space-y-0.5 border-b border-dashed border-[#514345] pb-2">
            <p>Order Type: <span className="font-bold text-white">{order.order_type}</span> {order.table_number && `(Table ${order.table_number})`}</p>
            <p>Customer: <span className="text-white">{order.contact_name}</span></p>
            <p>Phone: <span className="text-white">{order.contact_phone}</span></p>
          </div>

          <div className="space-y-1.5 py-1 border-b border-dashed border-[#514345] max-h-48 overflow-y-auto pr-1">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-[11px]">
                <span className="truncate max-w-[180px]">
                  {item.quantity}x {item.item_name} {item.variant_name ? `(${item.variant_name})` : ''}
                </span>
                <span className="font-bold text-[#f7b5be]">{item.subtotal_etb} ETB</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-1 font-bold text-sm text-[#f7b5be]">
            <span>TOTAL AMOUNT:</span>
            <span>{order.total_amount_etb} ETB</span>
          </div>
        </div>

        {/* Footer Actions inside Card Popup */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDownload}
            className="flex-1 py-3 px-6 bg-[#f7b5be] hover:brightness-110 text-[#4e232b] font-bold text-xs uppercase tracking-wider rounded-full flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Download</span>
          </button>
          <button
            onClick={onClose}
            className="py-3 px-6 bg-transparent border border-[#514345] hover:bg-outline-variant/10 text-[#9e8d8e] font-bold text-xs uppercase tracking-wider rounded-full transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

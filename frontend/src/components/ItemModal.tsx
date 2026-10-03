'use client';

import React, { useState, useEffect } from 'react';
import { MenuItem } from '../app/page';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onAddToCart: (item: MenuItem, quantity: number, temperature: string, milk: string) => void;
}

export default function ItemModal({ isOpen, onClose, item, onAddToCart }: ItemModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [temperature, setTemperature] = useState('Hot');
  const [milk, setMilk] = useState('None');

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setTemperature('Hot');
      setMilk('None');
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleAdd = () => {
    onAddToCart(item, quantity, temperature, milk);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#131313] border border-[#514345] rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header Image */}
        <div className="h-48 w-full relative">
          <img 
            src={item.image_url || 'https://images.pexels.com/photos/37756986/pexels-photo-37756986.jpeg?auto=compress&cs=tinysrgb&w=640&q=80'} 
            alt={item.name} 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white bg-black/40 hover:bg-black/60 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 -mt-6 relative">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-display text-2xl font-bold text-[#f7b5be]">{item.name}</h3>
            <span className="font-body italic font-bold text-xl text-[#fbbb50]">{parseFloat(item.price)} Br</span>
          </div>
          <p className="text-sm text-[#9e8d8e] mb-6">{item.description}</p>

          {/* Options */}
          <div className="space-y-5">
            {/* Temperature (Only show for coffees/teas conceptually, but we can show for all or based on category) */}
            <div>
              <label className="block text-xs font-semibold text-outline uppercase tracking-wider mb-2">Temperature</label>
              <div className="grid grid-cols-2 gap-2">
                {['Hot', 'Iced'].map(temp => (
                  <button
                    key={temp}
                    onClick={() => setTemperature(temp)}
                    className={`py-2 rounded-lg text-sm font-semibold transition-colors border ${
                      temperature === temp 
                        ? 'bg-[#f7b5be] text-[#1b1212] border-tertiary' 
                        : 'bg-[#131313]-container border-[#514345] text-[#e5e2e1] hover:border-tertiary/50'
                    }`}
                  >
                    {temp}
                  </button>
                ))}
              </div>
            </div>

            {/* Milk Choice */}
            <div>
              <label className="block text-xs font-semibold text-outline uppercase tracking-wider mb-2">Milk Choice</label>
              <div className="grid grid-cols-3 gap-2">
                {['None', 'Whole', 'Oat', 'Soy', 'Almond'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMilk(m)}
                    className={`py-2 rounded-lg text-sm font-semibold transition-colors border ${
                      milk === m 
                        ? 'bg-[#f7b5be] text-[#1b1212] border-tertiary' 
                        : 'bg-[#131313]-container border-[#514345] text-[#e5e2e1] hover:border-tertiary/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-outline uppercase tracking-wider mb-2">Quantity</label>
              <div className="flex items-center gap-4 bg-[#131313]-container border border-[#514345] rounded-lg p-2 w-max">
                <button 
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded bg-[#131313]-bright flex items-center justify-center text-lg font-bold hover:text-[#f7b5be] text-[#e5e2e1]"
                >
                  -
                </button>
                <span className="text-base font-bold text-white min-w-[20px] text-center">{quantity}</span>
                <button 
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-8 h-8 rounded bg-[#131313]-bright flex items-center justify-center text-lg font-bold hover:text-[#f7b5be] text-[#e5e2e1]"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="w-full mt-8 py-3 rounded-[28px] bg-[#f7b5be] text-[#1b1212] font-bold text-sm uppercase tracking-wider hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_rgba(247,181,190,0.25)] flex items-center justify-center gap-2"
          >
            <span>Add {quantity} to Cart</span>
            <span>•</span>
            <span>{(parseFloat(item.price) * quantity).toFixed(2)} Br</span>
          </button>
        </div>
      </div>
    </div>
  );
}

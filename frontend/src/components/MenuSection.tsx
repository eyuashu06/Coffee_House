'use client';

import React, { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

export interface CoffeeItemData {
  id: number;
  name: string;
  category_slug: string;
  price: number;
  description: string;
  origin?: string;
  altitude?: string;
  roast_level?: string;
  tasting_notes?: string;
  rating: number;
  image_url: string;
  is_signature: boolean;
}

interface MenuSectionProps {
  coffees: CoffeeItemData[];
  onAddToCart: (item: CoffeeItemData, temperature: string, milk: string) => void;
}

const CATEGORIES = [
  { slug: 'all', name: 'All Offerings', icon: 'restaurant_menu' },
  { slug: 'micro-lot-coffee', name: 'Micro-Lot Coffee', icon: 'local_cafe' },
  { slug: 'espresso-infusions', name: 'Espresso', icon: 'coffee' },
  { slug: 'premium-tea', name: 'Premium Tea', icon: 'emoji_food_beverage' },
  { slug: 'artisanal-burgers', name: 'Artisanal Burgers', icon: 'lunch_dining' },
  { slug: 'wood-fired-pizza', name: 'Wood-Fired Pizza', icon: 'local_pizza' },
  { slug: 'shawarma-wraps', name: 'Shawarma & Wraps', icon: 'kebab_dining' },
  { slug: 'fast-food', name: 'Fast Food', icon: 'fastfood' },
  { slug: 'bakery-pastry', name: 'Bakery & Pastry', icon: 'bakery_dining' },
];

export default function MenuSection({ coffees, onAddToCart }: MenuSectionProps) {
  const { t, tItem } = useLanguage();
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<{ [key: number]: { temp: string; milk: string } }>({});

  const handleTempChange = (id: number, temp: string) => {
    setSelectedOptions(prev => ({
      ...prev,
      [id]: { temp, milk: prev[id]?.milk || 'Oat Silk (Barista)' }
    }));
  };

  const handleMilkChange = (id: number, milk: string) => {
    setSelectedOptions(prev => ({
      ...prev,
      [id]: { temp: prev[id]?.temp || 'Hot', milk }
    }));
  };

  // Only keep categories that actually have items (plus 'all')
  const availableCategorySlugs = new Set(coffees.map(c => c.category_slug));
  const visibleCategories = CATEGORIES.filter(c => c.slug === 'all' || availableCategorySlugs.has(c.slug));

  const filteredItems = coffees.filter(item => {
    const matchesCategory = activeCategory === 'all' || item.category_slug === activeCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category_slug.toLowerCase().includes(query) ||
      (item.tasting_notes && item.tasting_notes.toLowerCase().includes(query)) ||
      (item.origin && item.origin.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  return (
    <section id="menu-section" className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* Section Heading */}
      <div className="flex flex-col items-start gap-2 mb-8">
        <div className="relative inline-block">
          <h2 className="font-headline text-3xl sm:text-4xl text-on-surface font-semibold tracking-tight">{t('Our Curated Menu')}</h2>
          <span className="absolute -bottom-1.5 left-0 w-20 h-1 rounded-full bg-secondary-container shadow-[0_0_12px_rgba(223,134,0,0.8)]" />
        </div>
        <p className="text-sm text-outline max-w-md">
          {t('Explore our wide selection of artisanal coffees, premium teas, mouth-watering burgers, wood-fired pizzas and more.')}
        </p>

        {/* Search Input Bar */}
        <div className="w-full max-w-md relative mt-4">
          <div className="relative flex items-center bg-surface-container-high/70 backdrop-blur-md rounded-xl p-1 shadow-inner border border-white/5">
            <span className="material-symbols-outlined text-outline ml-3 text-lg">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('Search coffee, burgers, pizza...')}
              className="w-full bg-transparent px-3 py-2 text-on-surface placeholder:text-outline text-sm focus:outline-none"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="p-1 mr-2 text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center gap-2 overflow-x-auto w-full pt-4 pb-2 no-scrollbar">
          {visibleCategories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(cat.slug)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
                activeCategory === cat.slug
                  ? 'bg-secondary text-on-secondary shadow-[0_2px_10px_rgba(223,134,0,0.3)] font-bold'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{cat.icon}</span>
              <span>{t(cat.name)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Item Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map(item => {
          const currentOpt = selectedOptions[item.id] || { temp: 'Hot', milk: 'Oat Silk (Barista)' };
          const notes = item.tasting_notes ? item.tasting_notes.split(',').filter(n => n.trim()) : [];
          
          // Determine if it's a beverage that requires temp/milk selections
          const isDrink = ['micro-lot-coffee', 'espresso-infusions', 'premium-tea'].includes(item.category_slug);

          return (
            <article 
              key={item.id}
              className="bg-surface-container rounded-2xl p-5 shadow-xl border border-white/5 flex flex-col justify-between hover:border-secondary/30 transition-all duration-300"
            >
              <div>
                {/* Image Container */}
                <div className="relative w-full h-48 rounded-xl overflow-hidden mb-4 bg-surface-container-highest">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent" />
                  
                  {/* Rating Tag */}
                  {item.rating > 0 && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-md flex items-center gap-1 border border-white/10 shadow-md">
                      <span className="material-symbols-outlined text-secondary text-xs">star</span>
                      <span className="text-xs text-on-surface font-semibold">{item.rating}</span>
                    </div>
                  )}

                  {/* Signature Badge */}
                  {item.is_signature && (
                    <div className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-primary-container/80 backdrop-blur-md border border-primary/20">
                      <span className="text-[10px] text-primary tracking-wider uppercase font-bold">Signature</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-headline text-lg text-on-surface font-semibold">{tItem(item.name)}</h3>
                    <p className="text-xs text-outline mt-1 leading-relaxed">{item.description}</p>
                  </div>
                  <span className="font-headline text-lg text-secondary font-bold whitespace-nowrap">{Number(item.price).toFixed(2)} ETB</span>
                </div>

                {/* Tasting Notes / Tags Chips */}
                {notes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 my-3">
                    {notes.map((note, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-[11px] text-[#fff9f6] bg-primary-container/60 border border-secondary/20">
                        {note.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {/* Custom Options (Hot/Iced & Milk) - Only for Drinks */}
                {isDrink && (
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-2 border-t border-white/5">
                    {/* Temp Toggle */}
                    <div className="bg-surface-container-high rounded-lg p-1 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => handleTempChange(item.id, 'Hot')}
                        className={`w-1/2 py-1 rounded font-semibold transition-all ${
                          currentOpt.temp === 'Hot' ? 'bg-secondary text-on-secondary shadow-sm' : 'text-on-surface-variant'
                        }`}
                      >
                        {t('Hot')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTempChange(item.id, 'Iced')}
                        className={`w-1/2 py-1 rounded font-semibold transition-all ${
                          currentOpt.temp === 'Iced' ? 'bg-secondary text-on-secondary shadow-sm' : 'text-on-surface-variant'
                        }`}
                      >
                        {t('Iced')}
                      </button>
                    </div>

                    {/* Milk Selector */}
                    <div className="relative bg-surface-container-high rounded-lg flex items-center text-xs">
                      <select
                        value={currentOpt.milk}
                        onChange={(e) => handleMilkChange(item.id, e.target.value)}
                        className="w-full bg-transparent px-2 py-1 text-on-surface appearance-none focus:outline-none cursor-pointer pr-6"
                      >
                        <option value="Oat Silk (Barista)" className="bg-surface-container-high text-on-surface">{t('Oat Silk (Barista)')}</option>
                        <option value="Whole Farmstead" className="bg-surface-container-high text-on-surface">{t('Whole Farmstead')}</option>
                        <option value="Sprouted Almond" className="bg-surface-container-high text-on-surface">{t('Sprouted Almond')}</option>
                        <option value="Macadamia Cream" className="bg-surface-container-high text-on-surface">{t('Macadamia Cream')}</option>
                      </select>
                      <span className="material-symbols-outlined text-outline absolute right-1.5 pointer-events-none text-sm">expand_more</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer Action */}
              <div className="mt-4 pt-3 flex items-center justify-between border-t border-white/5">
                <span className="text-[11px] text-outline">
                  {item.roast_level ? item.roast_level : item.category_slug.replace('-', ' ')}
                </span>
                <button
                  onClick={() => onAddToCart(item, isDrink ? currentOpt.temp : '', isDrink ? currentOpt.milk : '')}
                  className="px-4 py-2 rounded-full bg-secondary hover:bg-tertiary-fixed text-on-secondary font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span>{t('Add to Order')}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

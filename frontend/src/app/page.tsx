'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import Header from '../components/Header';
import HeroSection from '../components/HeroSection';
import MenuSection, { CoffeeItemData } from '../components/MenuSection';
import SpotlightSection from '../components/SpotlightSection';
import CartDrawer, { CartItem } from '../components/CartDrawer';
import SommelierChatModal from '../components/SommelierChatModal';

const DEFAULT_COFFEES: CoffeeItemData[] = [
  {
    id: 1,
    name: 'Smoked Vanilla Bourbon Latte',
    category_slug: 'signature',
    price: 6.80,
    description: 'Double shot espresso, Madagascar bourbon vanilla, steamed oat silk, charred cinnamon bark.',
    origin: 'Highland Bourbon Valley',
    altitude: '1,850 MASL',
    roast_level: 'Medium Roast',
    tasting_notes: 'Bourbon Vanilla, Charred Cinnamon, Caramelized Oak',
    rating: 4.90,
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAOsK0B2OaF9I1OZxSUmDnm8qVaqONlJQwneI__5Y98mYedTSqhLCwKMbh_yYMUoX_eUKtCG4XOoN1iYhwTTAAQailct0cSDGiYxMLx223qoiQk2a3Shhfczo_yE0YXfox9nvtslrAiHqEEgJfcTNqy1rmruhPHXMUT3l55C4mM_DkwUcxDRgkoCBYTI2AJX8thxOlM---aZURc-Fb_EK5jAMliLo_2VqlMtSbXj6ZEr9Qg2JNONSsa',
    is_signature: true,
  },
  {
    id: 2,
    name: 'Spanish Saffron Flat White',
    category_slug: 'signature',
    price: 7.10,
    description: 'Micro-foamed whole milk, infused saffron thread extraction, single estate Colombian roast.',
    origin: 'Huila, Colombia',
    altitude: '1,900 MASL',
    roast_level: 'Light Roast',
    tasting_notes: 'Saffron Crema, Floral Honey, Golden Apricot',
    rating: 5.00,
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCpHZ8vSVDO1Vu3HwH7vxd0OE8IempIuTx14iLJMSoVByavHRxFdKaofA28FlVi5ecCpEECgu3q-9zgdWp80LOL-yg7cdsn4ZVE3F950AXCgB80HN6PQZCgmpphbU2cWVlJy4HWb1pd_A8LVeM-TFjzewhyDqXrTXBvVOaZ7U05aCYK0xlHWj8N5eNH6SggIcpEMwVw2gYCOsAt0ILrtVjejzlErimnE2dzYCtVx4tyNc52HdMIO_ay',
    is_signature: true,
  },
  {
    id: 3,
    name: 'Kyoto 16-Hour Cold Drip',
    category_slug: 'cold-drip',
    price: 8.00,
    description: 'Cold water extraction drop-by-drop over Dutch glass towers. Whiskey barrel aged hints with silky finish.',
    origin: 'Antioquia, Colombia',
    altitude: '2,000 MASL',
    roast_level: 'Dark Barrel',
    tasting_notes: 'Whiskey Oak, Dark Cacao, Black Cherry',
    rating: 4.95,
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuALioPFauhCbqw0rs4z3AreRdOt8RlK_1_Eq9Ye4gVwMrfw1aJL4uNl4MLfVvfXT7-Nu4wIIjx979DeoOZ3u1abUp_0ihmOZkji1UxHzebDQ5wXBwgiKAa9f-QVUYWvpBLafdOmP52X-U4wy5GpxP5Ntv7KkYryUKLFqexCnpFTgcIlDTCi4kF9qm4nfT8mEPrsoCPaacWJWdT3Lpxm_Eyd4i0sOBiQ96rmSxhWTVVougxtU9LE9uNg',
    is_signature: true,
  },
  {
    id: 4,
    name: 'Panama Boquete Geisha Pour-Over',
    category_slug: 'pour-over',
    price: 9.50,
    description: 'Hand-poured V60 with delicate notes of wild guava, jasmine tea, and vibrant Meyer lemon zest.',
    origin: 'Boquete, Panama',
    altitude: '2,150 MASL',
    roast_level: 'Ultra Light Roast',
    tasting_notes: 'Jasmine Tea, Meyer Lemon Zest, Bergamot, Guava',
    rating: 4.95,
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWZcMNjiW8Tw3nw5GCvRtaI0nwk7JFs6cCwxVZhTVFoVKn845tJj21jG_sGbJEPSHeK3TLuJWrXGd0WY9q0Z63P9atQiZyRK6Z5HboVHRrBx7ZuePEhfgC_PwZn_fJiuleiGHt7xZuXr9YJxAIoQBgAJH7Aw7n75H_R6izN9LfaImd21FbeJOj5Es7qib9SCNCMlmDWu-JDtqATWq4r1-mdjrmrmYkRSL7TGRBI3fOqpioWfakvVRs',
    is_signature: true,
  },
  {
    id: 5,
    name: 'Ethiopian Geisha Honey Wash',
    category_slug: 'pour-over',
    price: 7.25,
    description: 'Single-origin micro-lot from Bench Maji. Soaring florals, peach blossom, and sparkling bergamot.',
    origin: 'Bench Maji, Ethiopia',
    altitude: '2,100 MASL',
    roast_level: 'Light Roast',
    tasting_notes: 'Jasmine, Peach Blossom, Bergamot',
    rating: 4.95,
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCBeQuQkvjJch3k03gIZ1HXmn5HoBPeJqL3EQzpxczX_Jvl7WdQ6BVxTU6nDe8q26SyVyRjTdbddPt01l4s18LLBbxlbzmnPN4O7hyaOft5wYn1SkqQcPjLsSxw7QArl-OFK3hpMQW04JL5ch8DpY6T5FGtJ9-f9HHF7r_MSY1uyu0x7FG04T8UTVvlhwhScHysvhNyGTMN5pVKl0-defg3r0D13EXPvldYY9-8bktXFoHcdUPgNnDF',
    is_signature: false,
  },
  {
    id: 6,
    name: 'Sumatra Blue Batak Dark Roast',
    category_slug: 'beans',
    price: 6.00,
    description: 'Volcanic terroir single-origin from Lake Toba. Full body, wet hulled with dark chocolate and cedar.',
    origin: 'Lake Toba, Sumatra',
    altitude: '1,600 MASL',
    roast_level: 'Full Dark Roast',
    tasting_notes: 'Dark Chocolate, Cedarwood, Clove',
    rating: 4.88,
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrfhhUrffca4cUdOdFoEkgTf5qoUpYLRJmFy1KAsvpUo8Lch79bpB1i69jgQt0t3T4O6yp4d7-RZtYpVtk4WgQYVzRvSrGpcjs4KJRnDMg8t93N8kGoUpYc3xY4L4RdKBOW_r-C9zJVCwxZyYJ_NuS0JA2DazN8aRdgsZcI1JQoT-0anEEvyVRtBZlwtFmJHYKhuflrzEmVGcH_sgj2XeBVb__VeGD4RX1xKV9VUBGSUgdKpjB4Uym',
    is_signature: false,
  },
  {
    id: 101,
    name: 'Classic Wagyu Burger',
    category_slug: 'artisanal-burgers',
    price: 12.50,
    description: 'Juicy wagyu beef patty with caramelized onions, sharp cheddar, and house sauce.',
    origin: 'Local Farms',
    roast_level: 'Medium Well',
    rating: 4.8,
    image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 102,
    name: 'Double Truffle Burger',
    category_slug: 'artisanal-burgers',
    price: 15.00,
    description: 'Double wagyu patty with truffle mayo, mushrooms, and aged gruyere cheese.',
    origin: 'Local Farms',
    roast_level: 'Medium',
    rating: 4.95,
    image_url: 'https://images.unsplash.com/photo-1594212202875-8622c81373d5?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 103,
    name: 'Spicy Chicken Burger',
    category_slug: 'artisanal-burgers',
    price: 10.50,
    description: 'Crispy fried chicken breast, spicy slaw, jalapeños, and brioche bun.',
    origin: 'Local',
    roast_level: 'Crispy',
    rating: 4.60,
    image_url: 'https://images.unsplash.com/photo-1615719413546-198b25453f85?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 104,
    name: 'Margherita Wood-Fired Pizza',
    category_slug: 'wood-fired-pizza',
    price: 14.00,
    description: 'Authentic Neapolitan pizza with San Marzano tomato sauce, fresh mozzarella, and basil.',
    origin: 'Naples Style',
    rating: 4.9,
    image_url: 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 105,
    name: 'Pepperoni Feast Pizza',
    category_slug: 'wood-fired-pizza',
    price: 16.50,
    description: 'Double pepperoni, hot honey drizzle, and fresh mozzarella on a charred crust.',
    origin: 'New York Style',
    rating: 4.85,
    image_url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 106,
    name: 'Truffle Mushroom Pizza',
    category_slug: 'wood-fired-pizza',
    price: 17.00,
    description: 'White base pizza with wild mushrooms, truffle oil, and ricotta cheese.',
    origin: 'Italian Style',
    rating: 4.95,
    image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 107,
    name: 'BBQ Chicken Pizza',
    category_slug: 'wood-fired-pizza',
    price: 15.50,
    description: 'Smoky BBQ sauce, grilled chicken, red onions, and cilantro.',
    origin: 'California Style',
    rating: 4.75,
    image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 108,
    name: 'Authentic Chicken Shawarma Wrap',
    category_slug: 'shawarma-wraps',
    price: 8.50,
    description: 'Marinated chicken spit-roasted to perfection, wrapped with garlic sauce and pickles.',
    rating: 4.7,
    image_url: 'https://images.unsplash.com/photo-1655195672076-13d6a4db4c13?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 109,
    name: 'Beef Shawarma Wrap',
    category_slug: 'shawarma-wraps',
    price: 9.50,
    description: 'Thinly sliced seasoned beef, tahini sauce, parsley, and sumac onions.',
    rating: 4.8,
    image_url: 'https://images.unsplash.com/photo-1529144415895-6aaf8be872fb?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 110,
    name: 'Falafel & Hummus Wrap',
    category_slug: 'shawarma-wraps',
    price: 7.50,
    description: 'Crispy falafel, creamy hummus, fresh tomatoes, and cucumber wrap.',
    rating: 4.6,
    image_url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 111,
    name: 'Matcha Green Tea Latte',
    category_slug: 'premium-tea',
    price: 5.50,
    description: 'Ceremonial grade matcha blended with silky oat milk and a touch of honey.',
    origin: 'Kyoto, Japan',
    rating: 4.95,
    image_url: 'https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 112,
    name: 'Earl Grey Classic',
    category_slug: 'premium-tea',
    price: 4.00,
    description: 'Bold black tea infused with bergamot oil, perfect for afternoon tea.',
    origin: 'England',
    rating: 4.7,
    image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 113,
    name: 'Jasmine Dragon Pearl',
    category_slug: 'premium-tea',
    price: 6.00,
    description: 'Hand-rolled green tea pearls scented with fresh jasmine flowers.',
    origin: 'Fujian, China',
    rating: 4.9,
    image_url: 'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?q=80&w=600&auto=format&fit=crop',
    is_signature: true,
  },
  {
    id: 114,
    name: 'Chamomile Blossom',
    category_slug: 'premium-tea',
    price: 4.50,
    description: 'Caffeine-free herbal tea with sweet floral notes of whole chamomile.',
    origin: 'Egypt',
    rating: 4.65,
    image_url: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  },
  {
    id: 115,
    name: 'Iced Peach Black Tea',
    category_slug: 'premium-tea',
    price: 5.00,
    description: 'Refreshing iced black tea infused with natural peach syrup and mint.',
    origin: 'Global Blend',
    rating: 4.85,
    image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?q=80&w=600&auto=format&fit=crop',
    is_signature: false,
  }
];

export default function Home() {
  const router = useRouter();
  const { t } = useLanguage();
  const [coffees, setCoffees] = useState<CoffeeItemData[]>(DEFAULT_COFFEES);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSommelierOpen, setIsSommelierOpen] = useState(false);

  // Auto-redirect managers/admins to their dashboard
  useEffect(() => {
    fetch('/api/v1/auth/me/', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(userData => {
        if (userData?.role === 'MANAGER' || userData?.role === 'ADMIN') {
          router.replace('/manager');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchCoffees() {
      try {
        const res = await fetch('/api/v1/coffees/');
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            if (data && (Array.isArray(data) ? data.length > 0 : data.results?.length > 0)) {
              setCoffees(Array.isArray(data) ? data : data.results);
            }
          }
        }
      } catch (e) {
        // Keeps default seed data
      }
    }
    fetchCoffees();
  }, []);

  const handleAddToCart = (coffee: CoffeeItemData, temperature: string, milk: string) => {
    setCartItems(prev => {
      const existingIdx = prev.findIndex(
        item => item.coffee.id === coffee.id && item.temperature === temperature && item.milk === milk
      );
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }
      return [...prev, { coffee, quantity: 1, temperature, milk }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQty = (index: number, delta: number) => {
    setCartItems(prev => {
      const updated = [...prev];
      updated[index].quantity += delta;
      if (updated[index].quantity <= 0) {
        updated.splice(index, 1);
      }
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const scrollToMenu = () => {
    const el = document.getElementById('menu-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main className="min-h-screen bg-background text-on-surface flex flex-col justify-between">
      {/* Header Navigation */}
      <Header
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenSommelier={() => setIsSommelierOpen(true)}
      />

      {/* Hero Section */}
      <HeroSection
        onOpenSommelier={() => setIsSommelierOpen(true)}
        onScrollToMenu={scrollToMenu}
      />

      {/* Menu Section */}
      <MenuSection
        coffees={coffees}
        onAddToCart={handleAddToCart}
      />

      {/* Spotlight & Master Barista Section */}
      <SpotlightSection />

      {/* Footer */}
      <footer className="bg-primary-container text-on-surface border-t border-white/10 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex flex-col gap-1">
            <span className="font-headline text-lg font-bold text-tertiary">{t('Artisanal Reserve')}</span>
            <p className="text-xs text-outline">{t('Savor every moment with our micro-lot single origins and AI Coffee Sommelier.')}</p>
          </div>
          <div className="text-xs text-outline">
            {t('© 2026 Artisanal Reserve. All rights reserved.')}
          </div>
        </div>
      </footer>

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      {/* AI Sommelier Chat Widget */}
      <SommelierChatModal
        isOpen={isSommelierOpen}
        onClose={() => setIsSommelierOpen(false)}
      />
    </main>
  );
}

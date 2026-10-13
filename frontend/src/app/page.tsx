'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CartDrawer, { CartItem } from '../components/CartDrawer';
import AuthModal from '../components/AuthModal';
import ItemModal from '../components/ItemModal';
import AssistantChat from '../components/AssistantChat';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';
import { apiFetch } from '../lib/api';
import { useCart, readLocalCart, saveLocalCart, clearLocalCart } from '../lib/cart';
import Link from 'next/link';

export interface MenuItem {
    id: number;
    name: string;
    category_slug: string;
    category_name: string;
    price: string;
    base_price_etb?: string;
    description: string;
    image_url: string;
    is_signature: boolean;
    is_available?: boolean;
    variants?: { id: number; name: string; price_modifier_etb: string }[];
    add_ons?: { id: number; name: string; price_etb: string }[];
}

export interface DeliveryZone {
    id: number;
    name: string;
    delivery_fee_etb: string;
}

/**
 * Render the server cart in the drawer's line shape.
 *
 * The saved cart stores ids and names only, so the drink's photo and description are
 * looked up from the menu already loaded on this page. A drink that left the menu falls
 * back to its stored name rather than rendering an empty row.
 */
function serverCartToCartItems(
    cart: { items: import('../lib/cart').ServerCartLine[] } | null,
    menu: MenuItem[]
): CartItem[] {
    if (!cart) return [];
    return cart.items.map((line) => {
        const menuItem = menu.find((item) => item.id === line.menu_item);
        return {
            lineKey: `server-${line.id}`,
            serverLineId: line.id,
            coffee: {
                id: line.menu_item,
                name: line.menu_item_name,
                price: menuItem?.base_price_etb ?? menuItem?.price ?? line.unit_price_etb,
                image_url: menuItem?.image_url ?? '',
            },
            quantity: line.quantity,
            temperature: line.temperature,
            milk: line.milk_choice,
            variant: line.variant_label
                ? { id: line.variant ?? 0, name: line.variant_label, price_modifier_etb: '0' }
                : null,
            addOns: line.add_on_labels.map((name, index) => ({ id: index, name })),
        };
    });
}

export default function Home() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { t, language, tCategory, tItem } = useLanguage();
    const [items, setItems] = useState<MenuItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [initialAuthMode, setInitialAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [postLoginRedirect, setPostLoginRedirect] = useState<string | null>(null);
    const [activeCat, setActiveCat] = useState('all');
    const [bookingData, setBookingData] = useState({ name: '', date_time: '', party_size: 2, contact_phone: '' });
    const [bookingStatus, setBookingStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [minDateTime, setMinDateTime] = useState('');

    // Order tracking. This used to be a form that always printed a hardcoded
    // "BH-1024 ready for pickup" for any input, which told customers their order was
    // ready before it existed. It now asks the API about their actual orders.
    const [trackCode, setTrackCode] = useState('');
    const [trackResult, setTrackResult] = useState<string | null>(null);
    const [isTracking, setIsTracking] = useState(false);

    const handleTrackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            setInitialAuthMode('LOGIN');
            setIsAuthModalOpen(true);
            return;
        }
        const code = trackCode.trim();
        if (!code) return;

        setIsTracking(true);
        setTrackResult(null);
        try {
            const res = await apiFetch(`/api/v1/orders/?search=${encodeURIComponent(code)}`);
            if (!res.ok) {
                setTrackResult(t('We could not check that order right now. Please try again.'));
                return;
            }
            const data = await res.json();
            const orders = Array.isArray(data) ? data : data.results || [];
            const match = orders.find(
                (order: { order_number: string }) => order.order_number === code
            );
            setTrackResult(
                match
                    ? `${match.order_number} · ${t(match.status.replace(/_/g, ' ').toLowerCase())}`
                    : t('No order with that code on your account.')
            );
        } catch {
            setTrackResult(t('We could not check that order right now. Please try again.'));
        } finally {
            setIsTracking(false);
        }
    };

    // Signed-in customers get a cart in the database (it survives a refresh, a closed
    // tab and a second device). Guests keep theirs locally and it is merged at sign-in.
    const isSignedIn = !!user && !authLoading;
    const { cart: serverCart, addLine: addServerLine, setQuantity: setServerQuantity,
            removeLine: removeServerLine, clearCart: clearServerCart, syncGuestCart } =
        useCart(isSignedIn);
    // Guests start from whatever was left in localStorage so a refresh keeps the order.
    const [guestCart, setGuestCart] = useState<CartItem[]>([]);
    useEffect(() => { if (!isSignedIn) setGuestCart(readLocalCart() as CartItem[]); }, [isSignedIn]);

    const cartItems = isSignedIn ? serverCartToCartItems(serverCart, items) : guestCart;

    // Middleware sends signed-out visitors here with ?auth=login&redirect=/account —
    // honour it so the sign-in form actually opens (and remember where to go after).
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const auth = params.get('auth');
        const redirect = params.get('redirect');
        if (redirect) setPostLoginRedirect(redirect);
        if (auth === 'login' || auth === 'register') {
            setInitialAuthMode(auth === 'register' ? 'REGISTER' : 'LOGIN');
            setIsAuthModalOpen(true);
        }
    }, []);

    useEffect(() => {
        // Staff never get dumped on the customer welcome page - they go to the dashboard.
        // (?welcome=1 means they clicked "Return to home" on purpose, so let them stay.)
        const wantsWelcomePage = new URLSearchParams(window.location.search).has('welcome');
        if (!authLoading && user && !wantsWelcomePage && (user.role === 'ADMIN' || user.role === 'MANAGER')) {
            router.replace('/manager');
        }
    }, [user, authLoading, router]);

    // On sign-in the guest's local cart is merged into the account cart, so nothing
    // that was in the basket disappears. Runs on every transition into "signed in".
    useEffect(() => {
        if (isSignedIn) void syncGuestCart();
    }, [isSignedIn, syncGuestCart]);

    useEffect(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
        setMinDateTime(tomorrow.toISOString().slice(0, 16));
        async function fetchMenu() {
            try {
                const res = await fetch('/api/v1/menu/items/?page_size=200');
                if (res.ok) {
                    const data = await res.json();
                    const list: MenuItem[] = Array.isArray(data) ? data : data.results || [];
                    setItems(list.filter(item => item.is_available !== false));
                }
            } catch (e) {
                console.error(e);
            }
        }
        fetchMenu();
    }, []);

    const handleBookingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            setInitialAuthMode('LOGIN');
            setIsAuthModalOpen(true);
            return;
        }

        setBookingStatus('LOADING');
        setBookingError(null);
        try {
            const res = await apiFetch('/api/v1/reservations/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData),
            });
            if (res.ok) {
                setBookingStatus('SUCCESS');
                setBookingData({ name: '', date_time: '', party_size: 2, contact_phone: '' });
                setTimeout(() => setBookingStatus('IDLE'), 5000);
            } else {
                // The API explains why (slot full, party too large, past date) and can
                // suggest free times nearby - showing that beats a bare "failed".
                let message = t('That time is not available. Please try another.');
                let alternatives: string[] = [];
                try {
                    const data = await res.json();
                    const flat = Object.entries(data)
                        .filter(([key]) => key !== 'alternatives')
                        .map(([, value]) => (Array.isArray(value) ? value.join(' ') : String(value)))
                        .join(' ');
                    if (flat) message = flat;
                    if (Array.isArray(data.alternatives)) alternatives = data.alternatives;
                } catch { /* keep the generic message */ }
                setBookingError(
                    alternatives.length > 0
                        ? `${message} ${t('Free times nearby:')} ${alternatives.join(', ')}`
                        : message
                );
                setBookingStatus('ERROR');
                setTimeout(() => setBookingStatus('IDLE'), 8000);
            }
        } catch (error) {
            setBookingError(t('Network error. Please check your connection and try again.'));
            setBookingStatus('ERROR');
            setTimeout(() => setBookingStatus('IDLE'), 5000);
        }
    };

    const handleOpenItemModal = (item: MenuItem) => {
        setSelectedItem(item);
        setIsItemModalOpen(true);
    };

    const handleConfirmAddToCart = (
        item: MenuItem,
        quantity: number,
        temperature: string,
        milk: string,
        variant?: { id: number; name: string; price_modifier_etb: string } | null,
        addOns: { id: number; name: string; price_etb: string }[] = []
    ) => {
        const newLine: CartItem = {
            lineKey: `guest-${item.id}-${temperature}-${milk}-${variant?.id ?? 'none'}-${addOns.map(a => a.id).sort().join('.')}`,
            coffee: {
                id: item.id,
                name: item.name,
                price: parseFloat(item.base_price_etb ?? item.price),
                image_url: item.image_url,
            },
            quantity,
            temperature,
            milk,
            variant: variant ?? null,
            addOns
        };

        if (isSignedIn) {
            // The server merges identical lines itself, so this is a single call.
            void addServerLine({
                coffee: newLine.coffee,
                quantity,
                temperature,
                milk,
                variant: variant ?? null,
                addOns
            });
        } else {
            setGuestCart(prev => {
                // Same drink + same options = one line with a higher quantity.
                const index = prev.findIndex(
                    (i) =>
                        i.coffee.id === item.id &&
                        i.temperature === temperature &&
                        i.milk === milk &&
                        (i.variant?.id ?? null) === (variant?.id ?? null) &&
                        (i.addOns || []).map(a => a.name).sort().join('|') ===
                            addOns.map(a => a.name).sort().join('|')
                );
                if (index === -1) return [...prev, newLine];
                const next = [...prev];
                next[index] = { ...next[index], quantity: next[index].quantity + quantity };
                return next;
            });
        }
        setIsItemModalOpen(false);
        setIsCartOpen(true);
    };

    const handleUpdateQty = (index: number, delta: number) => {
        const line = cartItems[index];
        if (!line) return;
        const nextQty = line.quantity + delta;

        if (isSignedIn && line.serverLineId) {
            // Quantity 0 removes the line; the API treats it that way.
            void setServerQuantity(line.serverLineId, nextQty);
            return;
        }
        setGuestCart(prev => {
            const next = [...prev];
            if (nextQty <= 0) {
                next.splice(index, 1);
            } else {
                next[index] = { ...next[index], quantity: nextQty };
            }
            saveLocalCart(next as unknown as Parameters<typeof saveLocalCart>[0]);
            return next;
        });
    };

    const handleRemoveItem = (index: number) => {
        const line = cartItems[index];
        if (isSignedIn && line?.serverLineId) {
            void removeServerLine(line.serverLineId);
            return;
        }
        setGuestCart(prev => {
            const next = prev.filter((_, i) => i !== index);
            saveLocalCart(next as unknown as Parameters<typeof saveLocalCart>[0]);
            return next;
        });
    };

    const handleClearCart = () => {
        clearLocalCart();
        if (isSignedIn) {
            void clearServerCart();
        } else {
            setGuestCart([]);
        }
    };

    const filteredItems = activeCat === 'all' 
        ? items 
        : items.filter(item => item.category_slug === activeCat);

    const categories = Array.from(new Set(items.map(item => item.category_slug)))
        .filter(Boolean)
        .map(slug => {
            const item = items.find(item => item.category_slug === slug);
            return item ? { slug: item.category_slug, name: item.category_name } : null;
        })
        .filter(Boolean);

    const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="relative">
            
  <div id="root"><style dangerouslySetInnerHTML={{__html: `
@import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap');
@import url("https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css");
.font-display{font-family:'Old Standard TT',serif}
.font-body{font-family:'Crimson Text',serif}
::selection{background:#3b141c;color:#f7b5be}

.hero-haze{
  background-image:
    radial-gradient(38% 55% at 22% 30%, rgba(255,184,110,.22), rgba(255,184,110,0) 62%),
    radial-gradient(45% 60% at 78% 68%, rgba(255,184,110,.14), rgba(255,184,110,0) 60%),
    radial-gradient(30% 45% at 58% 16%, rgba(247,181,190,.10), rgba(247,181,190,0) 65%);
  background-size: 280% 280%;
  mixBlendMode: screen;
}
.dish-card{
  background:#20201f;
  border:1px solid #514345;
  border-radius:18px;
  box-shadow: 0 22px 34px -20px rgba(0,0,0,.75), 0 6px 12px -6px rgba(0,0,0,.55), inset 0 1px 0 rgba(229,226,225,.04);
}
.dish-card-signature{
  background:#3b141c;
  border:1px solid #683941;
}
.dish-well{ box-shadow: inset 0 4px 14px rgba(0,0,0,.6); }
.chip{ background:#2a2a2a; border:1px solid #514345; color:#d5c2c3; }
.chip:hover{ border-color:#9e8d8e; }
.chip-active{ background:#3b141c !important; color:#f7b5be !important; border-color:#683941 !important; }
.field{ background:#1c1b1b; border:1px solid #514345; border-radius:18px; color:#e5e2e1; }
.field:focus{ outline:none; border-color:#f7b5be; }
.field::placeholder{ color:#9e8d8e; font-style:italic; }
.grain{position:relative}
.grain::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:.08;mixBlendMode:overlay;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");}
.linen-sheet{ clip-path: polygon(0 0, 100% 0, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0 100%); }
`}} />

<div className="bg-[#131313] text-[#e5e2e1] font-body overflow-x-clip">

  {/* ======================= NAV ======================= */}
  <header className="sticky top-0 z-50 bg-[#131313]/90 backdrop-blur-sm border-b border-[#514345]/60">
    <div className="flex items-center justify-between px-6 h-14">
      <a href="#" className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-[#3b141c] border border-[#683941] flex items-center justify-center text-[#f7b5be] text-[16px]"><i className="ph ph-coffee-bean"></i></span>
        <span className="font-display text-[21px] tracking-wide">Buna Hub</span>
      </a>
      <nav className="flex items-center gap-8 text-[15px] text-[#d5c2c3]">
        <a className="hover:text-[#f7b5be] transition-colors" href="#menu">{t('Menu')}</a>
        <a className="hover:text-[#f7b5be] transition-colors" href="#story">{t('Story')}</a>
        <a className="hover:text-[#f7b5be] transition-colors" href="#gallery">{t('Gallery')}</a>
        <a className="hover:text-[#f7b5be] transition-colors" href="#visit">{t('Visit us')}</a>
      </nav>
      <div className="flex items-center gap-3">
        <LanguageToggle />
        {user ? (
            <Link href="/account" className="h-9 px-5 rounded-[28px] border border-[#514345] text-[#d5c2c3] text-[14.5px] flex items-center hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">{t('Account')}</Link>
        ) : (
          <>
            <button onClick={() => { setInitialAuthMode('LOGIN'); setIsAuthModalOpen(true); }} className="h-9 px-5 rounded-[28px] border border-[#514345] text-[#d5c2c3] text-[14.5px] flex items-center hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">{t('Sign In')}</button>
            <button onClick={() => { setInitialAuthMode('REGISTER'); setIsAuthModalOpen(true); }} className="h-9 px-5 rounded-[28px] bg-[#f7b5be] text-[#4e232b] font-semibold text-[14.5px] flex items-center hover:bg-[#ffd9dd] transition-colors">{t('Sign Up')}</button>
          </>
        )}
        <button onClick={() => setIsCartOpen(true)} className="h-9 px-5 rounded-[28px] border border-[#9e8d8e] text-[14.5px] flex items-center hover:border-[#e5e2e1] transition-colors">{t('Cart')}{language === 'am' ? '' : ` (${totalCartCount})`}</button>
      </div>
    </div>
  </header>

  {/* ======================= HERO (hero-micro) ======================= */}
  <div className="p-4">
    <section className="relative h-[580px] rounded-[18px] overflow-hidden border border-[#514345] bg-[#0e0e0e]">
      <video src="https://videos.pexels.com/video-files/6062823/6062823-hd_1280_720_60fps.mp4" poster="https://images.pexels.com/videos/6062823/pexels-photo-6062823.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200" autoPlay muted loop playsInline preload="metadata" aria-label="Coffee poured slowly from a small pot — video by Nikita Belokhonov on Pexels" className="absolute inset-0 w-full h-full object-cover opacity-75" style={{filter: 'sepia(.32) brightness(.6) contrast(1.06)'}}></video>
      <div className="hero-haze absolute inset-0"></div>
      <div className="absolute inset-0" style={{background: 'linear-gradient(100deg, rgba(14,14,14,.94) 0%, rgba(14,14,14,.55) 36%, rgba(14,14,14,0) 64%)'}}></div>
      <div className="absolute inset-0" style={{background: 'linear-gradient(to top, rgba(14,14,14,.88), rgba(14,14,14,0) 42%)'}}></div>
      <div className="absolute inset-0" style={{boxShadow: 'inset 0 0 140px rgba(14,14,14,.85)'}}></div>

      <div className="absolute top-6 right-8 flex items-center gap-2 text-[14px] text-[#d5c2c3]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#fbbb50]"></span>
        {t('Open today')} · 7:00 – 22:00 · Piassa, {t('Addis Ababa')}
      </div>

      <div className="hero-copy absolute left-12 bottom-[104px] max-w-[620px]">
        <h1 className="font-display text-[96px] leading-[0.95] text-[#e5e2e1]">Buna Hub</h1>
        <p className="mt-4 text-[21px] leading-snug text-[#d5c2c3] max-w-[46ch]">{t('Three rounds from one jebena — coffee poured the slow way, in the city that invented it.')}</p>
        <div className="mt-8 flex items-center gap-4">
          <a href="#menu" className="h-12 px-7 rounded-[28px] bg-[#f7b5be] text-[#4e232b] text-[16.5px] font-semibold flex items-center gap-2 hover:bg-[#ffd9dd] transition-colors">{t('View the Menu')} <i className="ph ph-arrow-down text-[15px]"></i></a>
          <Link href="/account" className="h-12 px-7 rounded-[28px] border border-[#9e8d8e] text-[#e5e2e1] text-[16.5px] flex items-center hover:border-[#e5e2e1] hover:bg-[#20201f] transition-colors">{t('Order Buna')}</Link>
        </div>
        <Link href="/account" className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] text-[#9e8d8e] hover:text-[#f7b5be] transition-colors">{t('Track your order')} <i className="ph ph-arrow-right text-[13px]"></i></Link>
      </div>

      {/* tibeb path-draw strip */}
      <svg className="absolute bottom-0 left-0 w-full h-[46px]" viewBox="0 0 1440 46" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path className="tibeb-path" d="M0 0" stroke="#9e8d8e" strokeWidth="1.3" opacity="0.7"/>
      </svg>
    </section>

    {/* micro card row */}
    <div className="flex gap-2 mt-2">
      <Link href="/account" className="flex-1 h-16 rounded-[14px] bg-[#1c1b1b] border border-[#514345] flex items-center gap-3 px-4 hover:border-[#9e8d8e] transition-colors">
        <span className="text-[#f7b5be] text-[22px]"><i className="ph ph-coffee-bean"></i></span>
        <span><span className="block text-[16px] font-semibold leading-tight">{t('Order')}</span><span className="block text-[12.5px] italic text-[#9e8d8e]">{t('pickup & delivery')}</span></span>
      </Link>
      <a href="#visit" className="flex-1 h-16 rounded-[14px] bg-[#1c1b1b] border border-[#514345] flex items-center gap-3 px-4 hover:border-[#9e8d8e] transition-colors">
        <span className="text-[#f7b5be] text-[22px]"><i className="ph ph-calendar-check"></i></span>
        <span><span className="block text-[16px] font-semibold leading-tight">{t('Book')}</span><span className="block text-[12.5px] italic text-[#9e8d8e]">{t('save a stool')}</span></span>
      </a>
      <a href="#menu" className="flex-1 h-16 rounded-[14px] bg-[#1c1b1b] border border-[#514345] flex items-center gap-3 px-4 hover:border-[#9e8d8e] transition-colors">
        <span className="text-[#f7b5be] text-[22px]"><i className="ph ph-book-open"></i></span>
        <span><span className="block text-[16px] font-semibold leading-tight">{t('Menu')}</span><span className="block text-[12.5px] italic text-[#9e8d8e]">{t('buna, teas & bites')}</span></span>
      </a>
      <a href="#story" className="flex-1 h-16 rounded-[14px] bg-[#1c1b1b] border border-[#514345] flex items-center gap-3 px-4 hover:border-[#9e8d8e] transition-colors">
        <span className="text-[#f7b5be] text-[22px]"><i className="ph ph-scroll"></i></span>
        <span><span className="block text-[16px] font-semibold leading-tight">{t('Story')}</span><span className="block text-[12.5px] italic text-[#9e8d8e]">{t("from Kaldi's hills")}</span></span>
      </a>
      <Link href="/account" className="flex-1 h-16 rounded-[14px] bg-[#1c1b1b] border border-[#514345] flex items-center gap-3 px-4 hover:border-[#9e8d8e] transition-colors">
        <span className="text-[#f7b5be] text-[22px]"><i className="ph ph-map-pin"></i></span>
        <span><span className="block text-[16px] font-semibold leading-tight">{t('Track')}</span><span className="block text-[12.5px] italic text-[#9e8d8e]">{t('order status')}</span></span>
      </Link>
    </div>
  </div>

  <main>
    {/* ======================= MENU (pinboard) ======================= */}
    <section id="menu" className="scroll-mt-20 px-10 pt-24">
      <div className="max-w-[1360px] mx-auto">
        <h2 className="font-display text-[44px] leading-tight">{t('Laid out like dishes on the table')}</h2>
        <p className="mt-2 text-[18px] text-[#d5c2c3] max-w-[62ch]">{t('Everything is roasted, brewed or baked in-house. Prices in birr, taxes included — the ceremony is always on the house when you stay for all three rounds.')}</p>

        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <button onClick={() => setActiveCat('all')} className={`chip h-10 px-5 rounded-full text-[15px] transition-colors ${activeCat === 'all' ? 'chip-active' : ''}`} >{t('All')}</button>
          {categories.map((cat, idx) => cat && (
            <button key={cat.slug || idx} onClick={() => setActiveCat(cat.slug)} className={`chip h-10 px-5 rounded-full text-[15px] transition-colors ${activeCat === cat.slug ? 'chip-active' : ''}`} >{tCategory(cat.name)}</button>
          ))}
        </div>

   
        <div className="mt-12 flex flex-wrap items-start justify-center gap-x-8 gap-y-12 pb-8">
          {filteredItems.length === 0 ? (
             <div className="text-center text-[#d5c2c3] py-12 w-full">
<p className="text-[20px] font-display">{t('No menu items found.')}</p>
                 <p className="mt-2 text-[15px]">{t('Please ensure your Django backend is running on port 8000 so the menu can be loaded!')}</p>
             </div>
          ) : (
             filteredItems.map((item, idx) => {
               const rotation = (idx % 2 === 0 ? 1 : -1) * (1 + (idx % 3));
               return (
                 <div key={item.id} className="dish-slot w-[280px] mt-4" style={{transform: `rotate(${rotation}deg)`}}>
                   <div className={`dish-card p-5 ${item.is_signature ? 'dish-card-signature' : ''}`}>
                     <div className="dish-well w-full aspect-square rounded-full overflow-hidden border border-[#514345]">
<img src={item.image_url || 'https://images.pexels.com/photos/37756986/pexels-photo-37756986.jpeg?auto=compress&cs=tinysrgb&w=640&q=80'} alt={tItem(item.name)} className="w-full h-full object-cover" />
                      </div>
                      <h3 className="mt-5 font-display text-[23px] leading-tight text-[#e5e2e1]">
                        {tItem(item.name)} <span className="italic font-body text-[16px] text-[#ffb86e] whitespace-nowrap">{parseFloat(item.price)} {language === 'am' ? 'ብር' : 'Br'}</span>
                      </h3>
                      <p className="mt-1.5 text-[15px] leading-snug text-[#d5c2c3]">{item.description}</p>
                      <button onClick={() => handleOpenItemModal(item)} className="mt-4 w-full h-10 rounded-full border border-[#9e8d8e] text-[#e5e2e1] text-[14.5px] hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors">
                        {t('Add to Cart')}
                      </button>
                   </div>
                 </div>
               );
             })
          )}
        </div>
        
      </div>
    </section>

    {/* ======================= STORY (full-bleed editorial) ======================= */}
    <section id="story" className="scroll-mt-20 pt-32 pb-8">
      <div className="max-w-xl mx-auto px-6">
        <h2 className="font-display text-[44px] leading-[1.08] text-[#e5e2e1]">{t('Roasted in the room,')}<br/>{t('poured three times.')}</h2>
        <p className="mt-7 text-[19px] leading-[1.75] text-[#d5c2c3]">{t('Coffee began here — not in a roastery with a logo, but in the highlands of Kaffa, where a goat herder named Kaldi noticed his flock dancing. Centuries later, the drink is still made the unhurried way across Ethiopia: green beans washed by hand, roasted over charcoal in a flat pan, ground with a mortar, and brewed in a black clay jebena.')}</p>
        <p className="mt-5 text-[19px] leading-[1.75] text-[#d5c2c3]">{t('At Buna Hub we kept the whole ceremony indoors. Every afternoon the pan comes out, the room fills with smoke and frankincense, and whoever is seated nearby gets the first cup.')}</p>
      </div>

      <figure className="my-16">
        <img src="https://images.pexels.com/photos/6742970/pexels-photo-6742970.jpeg?auto=compress&cs=tinysrgb&w=1800&q=80" alt="Woman preparing coffee over charcoal in the traditional way — photo by Lan Yao on Pexels" decoding="async" loading="lazy" className="w-full h-[58vh] object-cover" style={{filter: 'brightness(.78) sepia(.15)'}}/>
        <figcaption className="max-w-xl mx-auto px-6 mt-3 text-[14px] italic text-[#9e8d8e]">{t('The morning roast, done where everyone can smell it.')}</figcaption>
      </figure>

      <div className="max-w-xl mx-auto px-6">
        <p className="text-[19px] leading-[1.75] text-[#d5c2c3]">{t('The pour matters as much as the roast. The jebena is lifted high so the stream falls thin and steady into small handleless cups — sini — and the coffee arrives in three rounds, each weaker and sweeter than the last: abol, tona, and baraka, the blessing. Leaving before the third is bad manners; staying for it is how strangers become regulars.')}</p>

        <blockquote className="linen-sheet relative mt-12 bg-[#1c1b1b] border border-[#514345] px-9 py-9 overflow-hidden">
          <img src="https://kombai-assets.b-cdn.net/generated_assets/533c69694ca847a7a8de3493df7110e2.jpg" alt="" aria-hidden="true" decoding="async" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-[0.16]" style={{filter: 'invert(.92) sepia(.2) brightness(.8) saturate(.8)', mixBlendMode: 'screen'}}/>
          <p className="relative font-display italic text-[27px] leading-[1.35] text-[#e5e2e1]">“{t('Buna dabo naw')}”<span className="block mt-3 not-italic font-body text-[15.5px] text-[#d5c2c3]">{t('— “Coffee is our bread.” The first thing a guest is offered, the last thing they are rushed through.')}</span></p>
        </blockquote>

        <p className="mt-12 text-[19px] leading-[1.75] text-[#d5c2c3]">{t('Our own roastery sits behind the counter — a small drum that turns out eight kilos at a time, mostly Yirgacheffe and Guji lots we buy through two family exporters. The burger grill and the pizza oven came later, because a ceremony that lasts three hours makes people hungry.')}</p>
      </div>
    </section>

    {/* ======================= GALLERY (staggered + parallax lag) ======================= */}
    <section id="gallery" className="gallery-sec scroll-mt-20 pt-28 pb-32 px-10">
      <div className="max-w-[1360px] mx-auto">
        <h2 className="font-display text-[40px] leading-tight">{t('The room, the smoke, the regulars')}</h2>
        <p className="mt-2 text-[18px] text-[#d5c2c3] max-w-[60ch]">{t('Shot over one slow week — mornings at the roast pan, evenings under the lamps.')}</p>

        <div className="mt-14 grid grid-cols-4 gap-6 items-start">
          <div className="gcol-1 flex flex-col gap-6 mt-0">
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.pexels.com/photos/38519871/pexels-photo-38519871.jpeg?auto=compress&cs=tinysrgb&w=720&q=80" alt="Young woman in traditional dress pouring buna — photo by LekePOV on Pexels" decoding="async" loading="lazy" className="w-full aspect-[3/4] object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('The high pour, Friday ceremony')}</figcaption>
            </figure>
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.unsplash.com/photo-1582298538104-fe2e74c27f59?auto=format&w=720&q=80&fit=crop" alt="Friends laughing together in a cafe — photo by Toa Heftiba on Unsplash" decoding="async" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('Third-round laughter')}</figcaption>
            </figure>
          </div>
          <div className="gcol-2 flex flex-col gap-6 mt-12">
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.unsplash.com/photo-1574781475422-a8b327766703?auto=format&w=720&q=80&fit=crop" alt="Guests sitting by the cafe window — photo by Spencer Davis on Unsplash" decoding="async" loading="lazy" className="w-full aspect-[4/5] object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('Slow Tuesday at the window')}</figcaption>
            </figure>
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.pexels.com/photos/9452515/pexels-photo-9452515.jpeg?auto=compress&cs=tinysrgb&w=720&q=80" alt="Steaming clay jebena pot — photo by Yosef Futsum on Pexels" decoding="async" loading="lazy" className="w-full aspect-square object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('Jebena resting on the coals')}</figcaption>
            </figure>
          </div>
          <div className="gcol-3 flex flex-col gap-6 mt-24">
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <video src="https://videos.pexels.com/video-files/5540803/5540803-sd_960_540_24fps.mp4" poster="https://images.pexels.com/videos/5540803/pexels-photo-5540803.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200" autoPlay muted loop playsInline preload="metadata" aria-label="Espresso brewing into a cup — video by Phillip Dillow on Pexels" className="w-full aspect-[4/5] object-cover rounded-[9px]"></video>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('The machine, for the impatient')}</figcaption>
            </figure>
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.pexels.com/photos/29692583/pexels-photo-29692583.jpeg?auto=compress&cs=tinysrgb&w=720&q=80" alt="Inviting cafe interior with pendant lights — photo by Valeria Boltneva on Pexels" decoding="async" loading="lazy" className="w-full aspect-square object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('Lamps on, rain outside')}</figcaption>
            </figure>
          </div>
          <div className="gcol-4 flex flex-col gap-6 mt-6">
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.pexels.com/photos/3794811/pexels-photo-3794811.jpeg?auto=compress&cs=tinysrgb&w=720&q=80" alt="Freshly roasted coffee beans in the pan, seen from above — photo by K on Pexels" decoding="async" loading="lazy" className="w-full aspect-[3/4] object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t("Tuesday's Guji lot, cooling")}</figcaption>
            </figure>
            <figure className="grain bg-[#1c1b1b] border border-[#514345] rounded-[14px] p-2.5">
              <img src="https://images.pexels.com/photos/38519890/pexels-photo-38519890.jpeg?auto=compress&cs=tinysrgb&w=720&q=80" alt="Woman performing the coffee ceremony in traditional dress — photo by LekePOV on Pexels" decoding="async" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-[9px]"/>
              <figcaption className="px-1.5 pt-2.5 pb-1 text-[13.5px] italic text-[#9e8d8e]">{t('Aster at the mesob')}</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>

    {/* ======================= VISIT & BOOKING (asymmetric 3-col) ======================= */}
    <section id="visit" className="scroll-mt-20 px-10 pt-4">
      <div className="max-w-[1360px] mx-auto">
        <div className="grid grid-cols-[250px_1fr_420px] rounded-[18px] overflow-hidden border border-[#514345]">
          <aside className="bg-[#0e0e0e] px-7 py-9 border-r border-[#514345]">
            <div className="flex items-center gap-2 text-[14px] text-[#fbbb50]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fbbb50]"></span> {t('Open now')} · {t('kitchen till 22:00')}
            </div>
            <h2 className="mt-6 font-display text-[28px] leading-tight">{t('Hours')}</h2>
            <dl className="mt-4 space-y-2.5 text-[15.5px]">
              <div className="flex justify-between gap-3"><dt className="text-[#d5c2c3]">{t('Mon – Thu')}</dt><dd>7:00–22:00</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#d5c2c3]">{t('Friday')}</dt><dd>7:00–23:00</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#d5c2c3]">{t('Saturday')}</dt><dd>8:00–23:00</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#d5c2c3]">{t('Sunday')}</dt><dd>8:00–21:00</dd></div>
            </dl>
            <p className="mt-5 text-[14px] italic text-[#9e8d8e]">{t('Full ceremony every afternoon from 15:00 — no booking needed, just be near the roast pan.')}</p>
            <div className="mt-8 pt-7 border-t border-[#514345]">
              <p className="text-[15.5px] leading-relaxed text-[#d5c2c3]">{t('Gulele Road 14, Piassa')}<br/>{t('Addis Ababa')}</p>
              <p className="mt-3 text-[15.5px]">+251 11 555 0148</p>
              <p className="text-[15.5px] text-[#d5c2c3]">selam@bunahub.et</p>
            </div>
          </aside>

          <div className="bg-[#131313] px-12 py-10">
            <h2 className="font-display text-[36px] leading-tight">{t('Book a table')}</h2>
            <p className="mt-2 text-[16.5px] text-[#d5c2c3] max-w-[52ch]">{t("Three fields and you're in. We confirm every request by phone within the hour — for parties over eight, call us instead.")}</p>
            <form id="booking-form" onSubmit={handleBookingSubmit} className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 max-w-[560px]">
              <div className="col-span-2">
                <label htmlFor="bk-name" className="block text-[15px] text-[#d5c2c3] mb-2">{t('Name')}</label>
                <input id="bk-name" type="text" required value={bookingData.name} onChange={(e) => setBookingData({...bookingData, name: e.target.value})} placeholder="Aster Kebede" className="field w-full h-12 px-5 text-[16px]"/>
              </div>
              <div>
                <label htmlFor="bk-phone" className="block text-[15px] text-[#d5c2c3] mb-2">{t('Phone')}</label>
                <input id="bk-phone" type="text" required value={bookingData.contact_phone} onChange={(e) => setBookingData({...bookingData, contact_phone: e.target.value})} placeholder="+251 911..." className="field w-full h-12 px-5 text-[16px]"/>
              </div>
              <div>
                <label htmlFor="bk-party" className="block text-[15px] text-[#d5c2c3] mb-2">{t('Party size')}</label>
                <input id="bk-party" type="number" min="1" required value={bookingData.party_size} onChange={(e) => setBookingData({...bookingData, party_size: parseInt(e.target.value)})} placeholder="2 guests" className="field w-full h-12 px-5 text-[16px]"/>
              </div>
              <div className="col-span-2">
                <label htmlFor="bk-date" className="block text-[15px] text-[#d5c2c3] mb-2">{t('Date & time')}</label>
                <input id="bk-date" type="datetime-local" min={minDateTime} required value={bookingData.date_time} onChange={(e) => setBookingData({...bookingData, date_time: e.target.value})} className="field w-full h-12 px-5 text-[16px] [color-scheme:dark]"/>
              </div>
              <div className="col-span-2 flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-5">
                  <button id="bk-btn" type="submit" disabled={bookingStatus === 'LOADING'} className="h-12 px-8 rounded-[28px] bg-[#f7b5be] text-[#4e232b] text-[16px] font-semibold hover:bg-[#ffd9dd] transition-colors flex items-center gap-2 disabled:opacity-50">
                    {user ? t('Book a table') : t('Sign in to book')}
                  </button>
                  <p id="bk-note" className="text-[14px] italic text-[#9e8d8e]">{t('No deposit — we hold your table for 20 minutes.')}</p>
                </div>
                {bookingStatus === 'SUCCESS' && <p className="text-[#f7b5be] font-semibold text-sm">{t('Your table is booked! We\'ll call you shortly to confirm.')}</p>}
                {bookingStatus === 'ERROR' && (
                  <p className="text-red-400 text-sm">
                    {bookingError ?? t('There was an error booking your table. Please try again.')}
                  </p>
                )}
              </div>
            </form>
          </div>

          <div className="relative min-h-[440px]">
            <img src="https://images.pexels.com/photos/2079448/pexels-photo-2079448.jpeg?auto=compress&cs=tinysrgb&w=1000&q=80" alt="Warm and inviting cafe terrace in the evening — photo by Emre Can Acer on Pexels" decoding="async" loading="lazy" className="absolute inset-0 w-full h-full object-cover" style={{filter: 'brightness(.85) sepia(.12)'}}/>
          </div>
        </div>
      </div>
    </section>
  </main>

  {/* ======================= FOOTER ======================= */}
  <footer id="track" className="scroll-mt-20 mt-28 bg-[#0e0e0e] border-t border-[#514345]">
    <div className="max-w-[1360px] mx-auto px-10 pt-16 pb-8">
      <div className="grid grid-cols-[1.3fr_1fr_1fr_1.3fr] gap-12">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-[#3b141c] border border-[#683941] flex items-center justify-center text-[#f7b5be] text-[16px]"><i className="ph ph-coffee-bean"></i></span>
            <span className="font-display text-[24px]">Buna Hub</span>
          </div>
          <p className="mt-4 text-[15.5px] leading-relaxed text-[#d5c2c3] max-w-[34ch]">{t('An Ethiopian coffee house in Piassa — ceremony buna, slow teas, and a kitchen that stays open late.')}</p>
          <div className="mt-5 flex items-center gap-3 text-[#d5c2c3]">
            <a href="#" aria-label="Instagram" className="w-9 h-9 rounded-full border border-[#514345] flex items-center justify-center text-[17px] hover:border-[#9e8d8e] hover:text-[#f7b5be] transition-colors"><i className="ph ph-instagram-logo"></i></a>
            <a href="#" aria-label="Telegram" className="w-9 h-9 rounded-full border border-[#514345] flex items-center justify-center text-[17px] hover:border-[#9e8d8e] hover:text-[#f7b5be] transition-colors"><i className="ph ph-telegram-logo"></i></a>
            <a href="#" aria-label="TikTok" className="w-9 h-9 rounded-full border border-[#514345] flex items-center justify-center text-[17px] hover:border-[#9e8d8e] hover:text-[#f7b5be] transition-colors"><i className="ph ph-tiktok-logo"></i></a>
            <a href="#" aria-label="Facebook" className="w-9 h-9 rounded-full border border-[#514345] flex items-center justify-center text-[17px] hover:border-[#9e8d8e] hover:text-[#f7b5be] transition-colors"><i className="ph ph-facebook-logo"></i></a>
          </div>
        </div>
        <div>
          <h3 className="font-display text-[20px]">{t('Hours')}</h3>
          <ul className="mt-4 space-y-2 text-[15px] text-[#d5c2c3]">
            <li className="flex justify-between gap-4"><span>{t('Mon – Thu')}</span><span className="text-[#e5e2e1]">7:00–22:00</span></li>
            <li className="flex justify-between gap-4"><span>{t('Fri')}</span><span className="text-[#e5e2e1]">7:00–23:00</span></li>
            <li className="flex justify-between gap-4"><span>{t('Sat')}</span><span className="text-[#e5e2e1]">8:00–23:00</span></li>
            <li className="flex justify-between gap-4"><span>{t('Sun')}</span><span className="text-[#e5e2e1]">8:00–21:00</span></li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-[20px]">{t('Find us')}</h3>
          <ul className="mt-4 space-y-3 text-[15px] text-[#d5c2c3]">
            <li className="flex gap-2.5"><i className="ph ph-map-pin text-[16px] mt-0.5 text-[#9e8d8e]"></i><span>{t('Gulele Road 14, Piassa')}<br/>{t('Addis Ababa')}</span></li>
            <li className="flex gap-2.5 items-center"><i className="ph ph-phone text-[16px] text-[#9e8d8e]"></i>+251 11 555 0148</li>
            <li className="flex gap-2.5 items-center"><i className="ph ph-envelope text-[16px] text-[#9e8d8e]"></i>selam@bunahub.et</li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-[20px]"><Link href="/account" className="inline-flex items-center gap-1.5 text-[14.5px] text-[#9e8d8e] hover:text-[#f7b5be] transition-colors">{t('Track your order')}</Link></h3>
          <p className="mt-4 text-[14.5px] text-[#d5c2c3]">{t('Order pickup by phone — +251 11 555 0148. Already ordered? The code on your receipt starts with BH.')}</p>
          <form id="track-form" className="mt-3 flex gap-2.5" onSubmit={handleTrackSubmit}>
            <input
              type="text"
              value={trackCode}
              onChange={(e) => setTrackCode(e.target.value)}
              placeholder="ORD-20260930-1234"
              aria-label={t('Order code')}
              className="field flex-1 h-11 px-4 text-[15px] min-w-0"
            />
            <button type="submit" disabled={isTracking} className="h-11 px-5 rounded-[28px] bg-[#f7b5be] text-[#4e232b] text-[15px] font-semibold hover:bg-[#ffd9dd] transition-colors shrink-0 disabled:opacity-50">
              {isTracking ? t('Checking...') : t('Check')}
            </button>
          </form>
          {trackResult && (
            <p className="mt-4 flex items-center gap-2 text-[14.5px] text-[#fbbb50]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fbbb50]"></span> {trackResult}
            </p>
          )}
        </div>
      </div>
      <div className="mt-14 pt-6 border-t border-[#514345] flex items-center justify-between text-[13.5px] text-[#9e8d8e]">
        <span>{t('© 2026 Buna Hub · Buna tetu — come, drink coffee')}</span>
        <span>{t('Photography: Pexels & Unsplash contributors')}</span>
      </div>
    </div>
  </footer>
</div>

</div>

            
            {/* Auth and Cart Modals */}
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                initialMode={initialAuthMode}
                postLoginRedirect={postLoginRedirect}
            />
            <ItemModal
                isOpen={isItemModalOpen}
                onClose={() => setIsItemModalOpen(false)}
                item={selectedItem}
                onAddToCart={handleConfirmAddToCart}
            />
            {/* Bilingual AI assistant (RAG, grounded in the live menu database) */}
            <AssistantChat />

            <CartDrawer
                isOpen={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                cartItems={cartItems}
                onUpdateQty={handleUpdateQty}
                onRemoveItem={handleRemoveItem}
                onClearCart={handleClearCart}
            />
        </div>
    );
}

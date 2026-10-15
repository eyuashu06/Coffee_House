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
import ThemeToggle from '../components/ThemeToggle';
import Slideshow, { Slide } from '../components/Slideshow';
import Reveal from '../components/Reveal';
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

/** Section kicker shown above each heading — small, spaced, accent-coloured. */
function Kicker({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[12.5px] sm:text-[13px] uppercase tracking-[0.22em] font-semibold text-[var(--accent)]">
            {children}
        </p>
    );
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
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        } catch {
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

    const heroSlides: Slide[] = [
        {
            src: 'https://images.pexels.com/photos/6742970/pexels-photo-6742970.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80',
            alt: 'Woman preparing coffee over charcoal in the traditional way — photo by Lan Yao on Pexels',
            caption: t('The morning roast, done where everyone can smell it.'),
        },
        {
            src: 'https://images.pexels.com/photos/38519871/pexels-photo-38519871.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80',
            alt: 'Young woman in traditional dress pouring buna — photo by LekePOV on Pexels',
            caption: t('The high pour, Friday ceremony'),
        },
        {
            src: 'https://images.pexels.com/photos/9452515/pexels-photo-9452515.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80',
            alt: 'Steaming clay jebena pot — photo by Yosef Futsum on Pexels',
            caption: t('Jebena resting on the coals'),
        },
        {
            src: 'https://images.pexels.com/photos/29692583/pexels-photo-29692583.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80',
            alt: 'Inviting cafe interior with pendant lights — photo by Valeria Boltneva on Pexels',
            caption: t('Lamps on, rain outside'),
        },
    ];

    const gallerySlides: Slide[] = [
        {
            src: 'https://images.pexels.com/photos/38519871/pexels-photo-38519871.jpeg?auto=compress&cs=tinysrgb&w=1600&q=80',
            alt: 'Young woman in traditional dress pouring buna — photo by LekePOV on Pexels',
            caption: t('The high pour, Friday ceremony'),
        },
        {
            src: 'https://images.unsplash.com/photo-1582298538104-fe2e74c27f59?auto=format&w=1600&q=80&fit=crop',
            alt: 'Friends laughing together in a cafe — photo by Toa Heftiba on Unsplash',
            caption: t('Third-round laughter'),
        },
        {
            src: 'https://images.unsplash.com/photo-1574781475422-a8b327766703?auto=format&w=1600&q=80&fit=crop',
            alt: 'Guests sitting by the cafe window — photo by Spencer Davis on Unsplash',
            caption: t('Slow Tuesday at the window'),
        },
        {
            src: 'https://images.pexels.com/photos/3794811/pexels-photo-3794811.jpeg?auto=compress&cs=tinysrgb&w=1600&q=80',
            alt: 'Freshly roasted coffee beans in the pan, seen from above — photo by K on Pexels',
            caption: t("Tuesday's Guji lot, cooling"),
        },
        {
            src: 'https://images.pexels.com/photos/38519890/pexels-photo-38519890.jpeg?auto=compress&cs=tinysrgb&w=1600&q=80',
            alt: 'Woman performing the coffee ceremony in traditional dress — photo by LekePOV on Pexels',
            caption: t('Aster at the mesob'),
        },
        {
            src: 'https://images.pexels.com/photos/29692583/pexels-photo-29692583.jpeg?auto=compress&cs=tinysrgb&w=1600&q=80',
            alt: 'Inviting cafe interior with pendant lights — photo by Valeria Boltneva on Pexels',
            caption: t('Lamps on, rain outside'),
        },
    ];

    const navLinks = [
        { href: '#story', label: t('Story') },
        { href: '#menu', label: t('Menu') },
        { href: '#gallery', label: t('Gallery') },
        { href: '#visit', label: t('Visit us') },
    ];

    return (
        <div className="relative">
            <div id="root" className="site-bg min-h-screen font-body text-[var(--text)] overflow-x-clip">

                {/* ======================= NAV ======================= */}
                <header className="sticky top-0 z-50 glass-bar border-b border-[var(--border)]">
                    <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-16">
                        <a href="/?welcome=1" className="flex items-center gap-2.5 min-w-0 group">
                            <span className="w-9 h-9 shrink-0 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] text-[16px] group-hover:scale-105 transition-transform"><i className="ph ph-coffee-bean"></i></span>
                            <span className="font-display text-[20px] sm:text-[21px] tracking-wide">Buna Hub</span>
                        </a>
                        <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium text-[var(--muted)]">
                            {navLinks.map((link) => (
                                <a key={link.href} className="hover:text-[var(--accent)] transition-colors" href={link.href}>{link.label}</a>
                            ))}
                        </nav>
                        <div className="flex items-center gap-2">
                            <LanguageToggle className="h-9 px-2.5 sm:px-3 rounded-full border border-[var(--border)] text-[var(--muted)] text-[13.5px] flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" />
                            <ThemeToggle />
                            {user ? (
                                <Link href="/account" className="hidden sm:flex h-9 px-4 rounded-full border border-[var(--border)] text-[var(--muted)] text-[14px] items-center hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">{t('Account')}</Link>
                            ) : (
                                <>
                                    <button onClick={() => { setInitialAuthMode('LOGIN'); setIsAuthModalOpen(true); }} className="hidden sm:flex h-9 px-4 rounded-full border border-[var(--border)] text-[var(--muted)] text-[14px] items-center hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">{t('Sign In')}</button>
                                    <button onClick={() => { setInitialAuthMode('REGISTER'); setIsAuthModalOpen(true); }} className="hidden sm:flex h-9 px-4 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold text-[14px] items-center hover:brightness-110 transition-all">{t('Sign Up')}</button>
                                </>
                            )}
                            <button onClick={() => setIsCartOpen(true)} className="h-9 px-3 sm:px-4 rounded-full border border-[var(--border)] text-[14px] flex items-center gap-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                                <i className="ph ph-shopping-bag-open text-[16px]"></i>
                                <span className="hidden sm:inline">{t('Cart')}</span>
                                {language === 'am' ? '' : `(${totalCartCount})`}
                            </button>
                            <button
                                onClick={() => setIsMobileMenuOpen((open) => !open)}
                                aria-label={isMobileMenuOpen ? t('Close menu') : t('Open menu')}
                                aria-expanded={isMobileMenuOpen}
                                className="md:hidden h-9 w-9 rounded-full border border-[var(--border)] text-[var(--muted)] flex items-center justify-center hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                            >
                                <i className={`ph ${isMobileMenuOpen ? 'ph-x' : 'ph-list'} text-[19px]`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Mobile menu — stacked links + auth, no hover required */}
                    {isMobileMenuOpen && (
                        <div className="md:hidden border-t border-[var(--border)] px-4 py-4 space-y-1">
                            {navLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="block py-2.5 px-3 rounded-xl text-[16px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <div className="pt-3 mt-1 border-t border-[var(--border)] flex gap-2">
                                {user ? (
                                    <Link href="/account" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 h-11 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold text-[15px] flex items-center justify-center">{t('Account')}</Link>
                                ) : (
                                    <>
                                        <button onClick={() => { setIsMobileMenuOpen(false); setInitialAuthMode('LOGIN'); setIsAuthModalOpen(true); }} className="flex-1 h-11 rounded-full border border-[var(--border)] text-[15px] flex items-center justify-center">{t('Sign In')}</button>
                                        <button onClick={() => { setIsMobileMenuOpen(false); setInitialAuthMode('REGISTER'); setIsAuthModalOpen(true); }} className="flex-1 h-11 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold text-[15px] flex items-center justify-center">{t('Sign Up')}</button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </header>

                {/* ======================= HERO (text + slideshow side by side) ======================= */}
                <section className="px-4 sm:px-6 pt-6 sm:pt-10">
                    <div className="max-w-[1360px] mx-auto grid lg:grid-cols-2 gap-6 lg:gap-12 items-center">
                        <div className="order-2 lg:order-1">
                            <div className="inline-flex items-center gap-2 text-[13.5px] text-[var(--muted)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]"></span>
                                {t('Open today')} · 7:00 – 22:00 · Piassa, {t('Addis Ababa')}
                            </div>
                            <h1 className="mt-4 font-display text-[42px] sm:text-[58px] lg:text-[68px] leading-[1.03] tracking-tight">
                                {'Buna Hub'.split(' ').map((word, i) => (
                                    <span key={word} className="word-in mr-3 last:mr-0" style={{ animationDelay: `${0.15 + i * 0.18}s` }}>{word}</span>
                                ))}
                            </h1>
                            <p className="mt-4 text-[17px] sm:text-[19px] leading-relaxed text-[var(--muted)] max-w-[46ch]">
                                {t('Three rounds from one jebena — coffee poured the slow way, in the city that invented it.')}
                            </p>
                            <div className="mt-7 flex flex-wrap items-center gap-3">
                                <a href="#menu" className="h-12 px-7 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[16px] font-semibold flex items-center gap-2 hover:brightness-110 transition-all shadow-[var(--shadow)]">{t('View the Menu')} <i className="ph ph-arrow-down text-[15px]"></i></a>
                                <Link href="/account" className="h-12 px-7 rounded-full border border-[var(--border)] text-[16px] flex items-center hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">{t('Order Buna')}</Link>
                            </div>
                            <Link href="/account" className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] text-[var(--muted)] hover:text-[var(--accent)] transition-colors">{t('Track your order')} <i className="ph ph-arrow-right text-[13px]"></i></Link>
                        </div>

                        <div className="order-1 lg:order-2">
                            <Slideshow
                                slides={heroSlides}
                                intervalMs={4500}
                                className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-[540px]"
                            />
                        </div>
                    </div>

                    {/* quick links — 2-up on phones, full row from sm up */}
                    <div className="max-w-[1360px] mx-auto grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 mt-8">
                        <Link href="/account" className="h-auto sm:h-16 py-3 sm:py-0 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3 px-4 hover:border-[var(--accent)] transition-colors">
                            <span className="text-[var(--accent)] text-[22px]"><i className="ph ph-coffee-bean"></i></span>
                            <span><span className="block text-[15px] font-semibold leading-tight">{t('Order')}</span><span className="block text-[12.5px] text-[var(--muted)]">{t('pickup & delivery')}</span></span>
                        </Link>
                        <a href="#visit" className="h-auto sm:h-16 py-3 sm:py-0 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3 px-4 hover:border-[var(--accent)] transition-colors">
                            <span className="text-[var(--accent)] text-[22px]"><i className="ph ph-calendar-check"></i></span>
                            <span><span className="block text-[15px] font-semibold leading-tight">{t('Book')}</span><span className="block text-[12.5px] text-[var(--muted)]">{t('save a stool')}</span></span>
                        </a>
                        <a href="#menu" className="h-auto sm:h-16 py-3 sm:py-0 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3 px-4 hover:border-[var(--accent)] transition-colors">
                            <span className="text-[var(--accent)] text-[22px]"><i className="ph ph-book-open"></i></span>
                            <span><span className="block text-[15px] font-semibold leading-tight">{t('Menu')}</span><span className="block text-[12.5px] text-[var(--muted)]">{t('buna, teas & bites')}</span></span>
                        </a>
                        <a href="#story" className="h-auto sm:h-16 py-3 sm:py-0 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3 px-4 hover:border-[var(--accent)] transition-colors">
                            <span className="text-[var(--accent)] text-[22px]"><i className="ph ph-scroll"></i></span>
                            <span><span className="block text-[15px] font-semibold leading-tight">{t('Story')}</span><span className="block text-[12.5px] text-[var(--muted)]">{t("from Kaldi's hills")}</span></span>
                        </a>
                        <Link href="/account" className="h-auto sm:h-16 py-3 sm:py-0 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3 px-4 hover:border-[var(--accent)] transition-colors">
                            <span className="text-[var(--accent)] text-[22px]"><i className="ph ph-map-pin"></i></span>
                            <span><span className="block text-[15px] font-semibold leading-tight">{t('Track')}</span><span className="block text-[12.5px] text-[var(--muted)]">{t('order status')}</span></span>
                        </Link>
                    </div>
                </section>

                <main>
                    {/* ======================= STORY (image + text, side by side) ======================= */}
                    <section id="story" className="scroll-mt-20 px-4 sm:px-6 py-16 sm:py-24">
                        <div className="max-w-[1360px] mx-auto">
                            <Reveal className="max-w-2xl">
                                <Kicker>{t('Our Story')}</Kicker>
                                <h2 className="mt-3 font-display text-[34px] sm:text-[44px] leading-[1.08]">
                                    {t('Roasted in the room,')}<br />{t('poured three times.')}
                                </h2>
                            </Reveal>

                            <div className="mt-10 sm:mt-14 grid md:grid-cols-2 gap-8 lg:gap-14 items-center">
                                <Reveal>
                                    <figure className="grain bg-[var(--surface)] border border-[var(--border)] rounded-[18px] p-2.5 shadow-[var(--shadow)]">
                                        <img
                                            src="https://images.pexels.com/photos/6742970/pexels-photo-6742970.jpeg?auto=compress&cs=tinysrgb&w=1200&q=80"
                                            alt="Woman preparing coffee over charcoal in the traditional way — photo by Lan Yao on Pexels"
                                            decoding="async"
                                            loading="lazy"
                                            className="w-full aspect-[4/3] object-cover rounded-[12px]"
                                        />
                                    </figure>
                                </Reveal>
                                <Reveal delay={120}>
                                    <h3 className="font-display text-[26px] sm:text-[30px] leading-snug">{t('Where it all began')}</h3>
                                    <p className="mt-4 text-[16.5px] leading-[1.75] text-[var(--muted)]">
                                        {t('Coffee began in the highlands of Kaffa — beans washed by hand, roasted over charcoal, and brewed in a black clay jebena.')}
                                    </p>
                                    <p className="mt-4 text-[16.5px] leading-[1.75] text-[var(--muted)]">
                                        {t('Every afternoon the pan comes out. Whoever is seated nearby gets the first cup.')}
                                    </p>
                                </Reveal>
                            </div>

                            <Reveal className="mt-14">
                                <blockquote className="linen-sheet bg-[var(--surface)] border border-[var(--border)] px-6 sm:px-10 py-9">
                                    <p className="font-display italic text-[24px] sm:text-[27px] leading-[1.35]">
                                        “{t('Buna dabo naw')}”
                                        <span className="block mt-3 not-italic font-body text-[15px] text-[var(--muted)]">
                                            {t('— “Coffee is our bread.” The first thing a guest is offered, the last thing they are rushed through.')}
                                        </span>
                                    </p>
                                </blockquote>
                            </Reveal>

                            <div className="mt-14 grid md:grid-cols-2 gap-8 lg:gap-14 items-center">
                                <Reveal className="md:order-2">
                                    <figure className="grain bg-[var(--surface)] border border-[var(--border)] rounded-[18px] p-2.5 shadow-[var(--shadow)]">
                                        <img
                                            src="https://images.pexels.com/photos/38519890/pexels-photo-38519890.jpeg?auto=compress&cs=tinysrgb&w=1200&q=80"
                                            alt="Woman performing the coffee ceremony in traditional dress — photo by LekePOV on Pexels"
                                            decoding="async"
                                            loading="lazy"
                                            className="w-full aspect-[4/3] object-cover rounded-[12px]"
                                        />
                                    </figure>
                                </Reveal>
                                <Reveal delay={120} className="md:order-1">
                                    <h3 className="font-display text-[26px] sm:text-[30px] leading-snug">{t('Three rounds, one blessing')}</h3>
                                    <p className="mt-4 text-[16.5px] leading-[1.75] text-[var(--muted)]">
                                        {t('Three rounds — abol, tona, and baraka. Staying for the third is how strangers become regulars.')}
                                    </p>
                                    <p className="mt-4 text-[16.5px] leading-[1.75] text-[var(--muted)]">
                                        {t('Our own roastery sits behind the counter — Yirgacheffe and Guji lots we buy through two family exporters.')}
                                    </p>
                                </Reveal>
                            </div>
                        </div>
                    </section>

                    {/* ======================= MENU ======================= */}
                    <section id="menu" className="scroll-mt-20 px-4 sm:px-6 py-16 sm:py-20">
                        <div className="max-w-[1360px] mx-auto">
                            <Reveal className="max-w-2xl">
                                <Kicker>{t('Menu')}</Kicker>
                                <h2 className="mt-3 font-display text-[34px] sm:text-[44px] leading-tight">{t('Laid out like dishes on the table')}</h2>
                                <p className="mt-3 text-[16.5px] text-[var(--muted)] max-w-[62ch]">
                                    {t('Everything is roasted, brewed or baked in-house. Prices in birr, taxes included — the ceremony is always on the house when you stay for all three rounds.')}
                                </p>
                            </Reveal>

                            <div className="mt-8 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
                                <div className="flex flex-nowrap sm:flex-wrap items-center gap-2.5 w-max sm:w-auto">
                                    <button onClick={() => setActiveCat('all')} className={`chip h-10 px-5 rounded-full text-[15px] transition-colors ${activeCat === 'all' ? 'chip-active' : ''}`}>{t('All')}</button>
                                    {categories.map((cat, idx) => cat && (
                                        <button key={cat.slug || idx} onClick={() => setActiveCat(cat.slug)} className={`chip h-10 px-5 rounded-full text-[15px] transition-colors ${activeCat === cat.slug ? 'chip-active' : ''}`}>{tCategory(cat.name)}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                                {filteredItems.length === 0 ? (
                                    <div className="text-center text-[var(--muted)] py-12 col-span-full">
                                        <p className="text-[20px] font-display">{t('No menu items found.')}</p>
                                        <p className="mt-2 text-[15px]">{t('Please ensure your Django backend is running on port 8000 so the menu can be loaded!')}</p>
                                    </div>
                                ) : (
                                    filteredItems.map((item) => (
                                        <div key={item.id} className="dish-card p-5 flex flex-col">
                                            <div className="dish-well w-full aspect-square rounded-full overflow-hidden border border-[var(--border)]">
                                                <img src={item.image_url || 'https://images.pexels.com/photos/37756986/pexels-photo-37756986.jpeg?auto=compress&cs=tinysrgb&w=640&q=80'} alt={tItem(item.name)} className="w-full h-full object-cover" />
                                            </div>
                                            <h3 className="mt-5 font-display text-[22px] leading-tight">
                                                {tItem(item.name)}{' '}
                                                <span className="italic font-body text-[15px] text-[var(--gold)] whitespace-nowrap">{parseFloat(item.price)} {language === 'am' ? 'ብር' : 'Br'}</span>
                                                {item.is_signature && (
                                                    <span className="ml-1.5 align-middle text-[11px] uppercase tracking-wider font-semibold font-body text-[var(--accent)]">{t('Signature')}</span>
                                                )}
                                            </h3>
                                            <p className="mt-1.5 text-[14.5px] leading-snug text-[var(--muted)] flex-1">{item.description}</p>
                                            <button onClick={() => handleOpenItemModal(item)} className="mt-4 w-full h-10 rounded-full border border-[var(--border)] text-[14.5px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                                                {t('Add to Cart')}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ======================= GALLERY (slideshow) ======================= */}
                    <section id="gallery" className="scroll-mt-20 px-4 sm:px-6 py-16 sm:py-20">
                        <div className="max-w-[1360px] mx-auto grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
                            <Reveal className="max-w-xl">
                                <Kicker>{t('Gallery')}</Kicker>
                                <h2 className="mt-3 font-display text-[32px] sm:text-[42px] leading-tight">{t('The room, the smoke, the regulars')}</h2>
                                <p className="mt-4 text-[16.5px] leading-[1.75] text-[var(--muted)] max-w-[60ch]">
                                    {t('Shot over one slow week — mornings at the roast pan, evenings under the lamps.')}
                                </p>
                                <p className="mt-5 text-[13.5px] italic text-[var(--muted)] flex items-center gap-1.5">
                                    <i className="ph ph-arrows-left-right text-[14px]"></i>
                                    {t('Swipe or tap to see more')}
                                </p>
                            </Reveal>
                            <Reveal delay={120}>
                                <Slideshow
                                    slides={gallerySlides}
                                    intervalMs={4200}
                                    className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-[480px]"
                                />
                            </Reveal>
                        </div>
                    </section>

                    {/* ======================= VISIT & BOOKING ======================= */}
                    <section id="visit" className="scroll-mt-20 px-4 sm:px-6 py-16 sm:py-20">
                        <div className="max-w-[1360px] mx-auto">
                            <Reveal className="max-w-2xl mb-10">
                                <Kicker>{t('Visit us')}</Kicker>
                                <h2 className="mt-3 font-display text-[34px] sm:text-[44px] leading-tight">{t('Book a table')}</h2>
                            </Reveal>

                            <Reveal>
                                <div className="grid lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_380px] rounded-[18px] overflow-hidden border border-[var(--border)] shadow-[var(--shadow)]">
                                    <aside className="bg-[var(--surface-2)] px-6 sm:px-7 py-9 border-b lg:border-b-0 lg:border-r border-[var(--border)]">
                                        <div className="flex items-center gap-2 text-[14px] text-[var(--gold)]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]"></span> {t('Open now')} · {t('kitchen till 22:00')}
                                        </div>
                                        <h3 className="mt-6 font-display text-[26px] leading-tight">{t('Hours')}</h3>
                                        <dl className="mt-4 space-y-2.5 text-[15px]">
                                            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">{t('Mon – Thu')}</dt><dd>7:00–22:00</dd></div>
                                            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">{t('Friday')}</dt><dd>7:00–23:00</dd></div>
                                            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">{t('Saturday')}</dt><dd>8:00–23:00</dd></div>
                                            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">{t('Sunday')}</dt><dd>8:00–21:00</dd></div>
                                        </dl>
                                        <p className="mt-5 text-[14px] italic text-[var(--muted)]">{t('Full ceremony every afternoon from 15:00 — no booking needed, just be near the roast pan.')}</p>
                                        <div className="mt-8 pt-7 border-t border-[var(--border)]">
                                            <p className="text-[15px] leading-relaxed text-[var(--muted)]">{t('Gulele Road 14, Piassa')}<br />{t('Addis Ababa')}</p>
                                            <p className="mt-3 text-[15px]">+251 11 555 0148</p>
                                            <p className="text-[15px] text-[var(--muted)]">selam@bunahub.et</p>
                                        </div>
                                    </aside>

                                    <div className="bg-[var(--surface)] px-5 sm:px-10 py-9">
                                        <p className="text-[16px] text-[var(--muted)] max-w-[52ch]">{t("Three fields and you're in. We confirm every request by phone within the hour — for parties over eight, call us instead.")}</p>
                                        <form id="booking-form" onSubmit={handleBookingSubmit} className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5 max-w-[560px]">
                                            <div className="sm:col-span-2">
                                                <label htmlFor="bk-name" className="block text-[14.5px] text-[var(--muted)] mb-2">{t('Name')}</label>
                                                <input id="bk-name" type="text" required value={bookingData.name} onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })} placeholder="Aster Kebede" className="field w-full h-12 px-4 text-[16px]" />
                                            </div>
                                            <div>
                                                <label htmlFor="bk-phone" className="block text-[14.5px] text-[var(--muted)] mb-2">{t('Phone')}</label>
                                                <input id="bk-phone" type="text" required value={bookingData.contact_phone} onChange={(e) => setBookingData({ ...bookingData, contact_phone: e.target.value })} placeholder="+251 911..." className="field w-full h-12 px-4 text-[16px]" />
                                            </div>
                                            <div>
                                                <label htmlFor="bk-party" className="block text-[14.5px] text-[var(--muted)] mb-2">{t('Party size')}</label>
                                                <input id="bk-party" type="number" min="1" required value={bookingData.party_size} onChange={(e) => setBookingData({ ...bookingData, party_size: parseInt(e.target.value) })} placeholder="2 guests" className="field w-full h-12 px-4 text-[16px]" />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label htmlFor="bk-date" className="block text-[14.5px] text-[var(--muted)] mb-2">{t('Date & time')}</label>
                                                <input id="bk-date" type="datetime-local" min={minDateTime} required value={bookingData.date_time} onChange={(e) => setBookingData({ ...bookingData, date_time: e.target.value })} className="field w-full h-12 px-4 text-[16px]" />
                                            </div>
                                            <div className="sm:col-span-2 flex flex-col gap-3 pt-1">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                    <button id="bk-btn" type="submit" disabled={bookingStatus === 'LOADING'} className="h-12 px-8 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[16px] font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                                        {user ? t('Book a table') : t('Sign in to book')}
                                                    </button>
                                                    <p id="bk-note" className="text-[13.5px] italic text-[var(--muted)]">{t('No deposit — we hold your table for 20 minutes.')}</p>
                                                </div>
                                                {bookingStatus === 'SUCCESS' && <p className="text-[var(--accent)] font-semibold text-sm">{t('Your table is booked! We\'ll call you shortly to confirm.')}</p>}
                                                {bookingStatus === 'ERROR' && (
                                                    <p className="text-red-500 dark:text-red-400 text-sm">
                                                        {bookingError ?? t('There was an error booking your table. Please try again.')}
                                                    </p>
                                                )}
                                            </div>
                                        </form>
                                    </div>

                                    <div className="relative h-56 sm:h-72 lg:h-auto lg:min-h-[440px]">
                                        <img
                                            src="https://images.pexels.com/photos/2079448/pexels-photo-2079448.jpeg?auto=compress&cs=tinysrgb&w=1200&q=80"
                                            alt="Warm and inviting cafe terrace in the evening — photo by Emre Can Acer on Pexels"
                                            decoding="async"
                                            loading="lazy"
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    </div>
                                </div>
                            </Reveal>
                        </div>
                    </section>
                </main>

                {/* ======================= FOOTER ======================= */}
                <footer id="track" className="scroll-mt-20 mt-10 bg-[var(--bg-deep)] border-t border-[var(--border)]">
                    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 pt-14 pb-8">
                        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)] text-[16px]"><i className="ph ph-coffee-bean"></i></span>
                                    <span className="font-display text-[23px]">Buna Hub</span>
                                </div>
                                <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)] max-w-[34ch]">{t('An Ethiopian coffee house in Piassa — ceremony buna, slow teas, and a kitchen that stays open late.')}</p>
                                <div className="mt-5 flex items-center gap-3 text-[var(--muted)]">
                                    <a href="#" aria-label="Instagram" className="w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center text-[17px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"><i className="ph ph-instagram-logo"></i></a>
                                    <a href="#" aria-label="Telegram" className="w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center text-[17px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"><i className="ph ph-telegram-logo"></i></a>
                                    <a href="#" aria-label="TikTok" className="w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center text-[17px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"><i className="ph ph-tiktok-logo"></i></a>
                                    <a href="#" aria-label="Facebook" className="w-9 h-9 rounded-full border border-[var(--border)] flex items-center justify-center text-[17px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"><i className="ph ph-facebook-logo"></i></a>
                                </div>
                            </div>
                            <div>
                                <h3 className="font-display text-[20px]">{t('Hours')}</h3>
                                <ul className="mt-4 space-y-2 text-[15px] text-[var(--muted)]">
                                    <li className="flex justify-between gap-4"><span>{t('Mon – Thu')}</span><span className="text-[var(--text)]">7:00–22:00</span></li>
                                    <li className="flex justify-between gap-4"><span>{t('Fri')}</span><span className="text-[var(--text)]">7:00–23:00</span></li>
                                    <li className="flex justify-between gap-4"><span>{t('Sat')}</span><span className="text-[var(--text)]">8:00–23:00</span></li>
                                    <li className="flex justify-between gap-4"><span>{t('Sun')}</span><span className="text-[var(--text)]">8:00–21:00</span></li>
                                </ul>
                            </div>
                            <div>
                                <h3 className="font-display text-[20px]">{t('Find us')}</h3>
                                <ul className="mt-4 space-y-3 text-[15px] text-[var(--muted)]">
                                    <li className="flex gap-2.5"><i className="ph ph-map-pin text-[16px] mt-0.5"></i><span>{t('Gulele Road 14, Piassa')}<br />{t('Addis Ababa')}</span></li>
                                    <li className="flex gap-2.5 items-center"><i className="ph ph-phone text-[16px]"></i>+251 11 555 0148</li>
                                    <li className="flex gap-2.5 items-center"><i className="ph ph-envelope text-[16px]"></i>selam@bunahub.et</li>
                                </ul>
                            </div>
                            <div>
                                <h3 className="font-display text-[20px]">{t('Track your order')}</h3>
                                <p className="mt-4 text-[14.5px] text-[var(--muted)]">{t('Order pickup by phone — +251 11 555 0148. Already ordered? The code on your receipt starts with BH.')}</p>
                                <form id="track-form" className="mt-3 flex gap-2.5" onSubmit={handleTrackSubmit}>
                                    <input
                                        type="text"
                                        value={trackCode}
                                        onChange={(e) => setTrackCode(e.target.value)}
                                        placeholder="ORD-20260930-1234"
                                        aria-label={t('Order code')}
                                        className="field flex-1 h-11 px-4 text-[15px] min-w-0"
                                    />
                                    <button type="submit" disabled={isTracking} className="h-11 px-5 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[15px] font-semibold hover:brightness-110 transition-all shrink-0 disabled:opacity-50">
                                        {isTracking ? t('Checking...') : t('Check')}
                                    </button>
                                </form>
                                {trackResult && (
                                    <p className="mt-4 flex items-center gap-2 text-[14.5px] text-[var(--gold)]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]"></span> {trackResult}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="mt-14 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-2 text-[13.5px] text-[var(--muted)]">
                            <span>{t('© 2026 Buna Hub · Buna tetu — come, drink coffee')}</span>
                            <span>{t('Photography: Pexels & Unsplash contributors')}</span>
                        </div>
                    </div>
                </footer>
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

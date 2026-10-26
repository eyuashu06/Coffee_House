'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import AuthModal from './AuthModal';
import LanguageToggle from './LanguageToggle';

interface AssistantItem {
  id: number;
  name: string;
  category: string;
  price: string;
  description?: string;
  available: boolean;
  image_url?: string;
}

interface QuickAction {
  id: string;
  label_en: string;
  label_am: string;
  icon: string;
  query_en: string;
  query_am: string;
}

interface AssistantAction {
  action?: string;
  /** Set when the assistant needs an account before it can continue. */
  reason_en?: string;
  reason_am?: string;
  /** Which conversation to resume once the customer has signed in. */
  resume_intent?: string;
  order_number?: string;
  order?: { order_number?: string; total_etb?: number };
}

interface AssistantOrder {
  order_number: string;
  status_label?: string;
  total_etb: number;
  item_count: number;
}

interface ChatMessage {
  id: string;
  from: 'user' | 'assistant';
  en?: string;
  am?: string;
  queryLang?: string;
  error?: boolean;
  items?: AssistantItem[];
  reservations?: Record<string, unknown>[];
  orders?: AssistantOrder[];
  action?: AssistantAction;
}

const FALLBACK_QUICK_ACTIONS: QuickAction[] = [
  { id: 'menu', label_en: 'View Menu', label_am: 'ሜኑ ይመልከቱ', icon: '☕', query_en: 'Show me the menu', query_am: 'ሜኑውን አሳይኝ' },
  { id: 'food', label_en: 'Food', label_am: 'ምግብ', icon: '🍰', query_en: 'What food do you have?', query_am: 'ምን አይነት ምግብ አላችሁ?' },
  { id: 'drinks', label_en: 'Drinks', label_am: 'መጠጦች', icon: '🥤', query_en: 'What drinks are available?', query_am: 'ምን አይነት መጠጥ አላችሁ?' },
  { id: 'reservation', label_en: 'Make Reservation', label_am: 'ቦታ ማስያዝ', icon: '📅', query_en: 'I want to reserve a table', query_am: 'ቦታ ማስያዝ እፈልጋለሁ' },
  { id: 'order', label_en: 'Start an Order', label_am: 'ትዕዛዝ ጀምር', icon: '🧾', query_en: 'I would like to place an order', query_am: 'ትዕዛዝ ለመስጠት እፈልጋለሁ' },
  { id: 'prices', label_en: 'Check Prices', label_am: 'ዋጋ ይመልከቱ', icon: '💰', query_en: 'How much is Masala Chai Latte?', query_am: 'Masala Chai Latte ዋጋው ስንት ነው?' },
  { id: 'about', label_en: 'About Buna Hub', label_am: 'ስለ ቡና ሁብ', icon: 'ℹ️', query_en: 'What is Buna Hub?', query_am: 'ቡና ሁብ ምንድነው?' },
];

const GENERIC_ERROR = {
  en: "Sorry, I'm having trouble retrieving that information right now. Please try again shortly.",
  am: 'ይቅርታ፣ ያንን መረጃ አሁን ማግኘት አልቻልኩም። እባክዎን ትንሽ ቆይተው እንደገና ይሞክሩ።',
};

/**
 * What to say once the customer has signed in, to pick the interrupted
 * conversation back up. The backend still holds what they already told us, so
 * these do not repeat any details back to them.
 */
const RESUME_PROMPTS: Record<string, string> = {
  reservation_create: 'I am signed in now, please continue with my reservation',
  reservation_cancel: 'I am signed in now, please continue with cancelling',
  reservation_status: 'I am signed in now, please show my reservations',
  order_create: "I am signed in now, please place my order",
  order_status: 'I am signed in now, please show my orders',
  default: 'I am signed in now, please continue',
};

const RESUME_PROMPTS_AM: Record<string, string> = {
  reservation_create: 'አሁን በመለያዬ ገብቻለሁ፣ እባክዎን የቦታ ማስያዣዬን ይቀጥሉ።',
  reservation_cancel: 'አሁን በመለያዬ ገብቻለሁ፣ እባክዎን ማሰረዙን ይቀጥሉ።',
  reservation_status: 'አሁን በመለያዬ ገብቻለሁ፣ እባክዎን የቦታ ማስያዣዎቼን ያሳዩኝ።',
  order_create: 'አሁን በመለያዬ ገብቻለሁ፣ እባክዎን ትዕዛዜን ያስገቡ።',
  order_status: 'አሁን በመለያዬ ገብቻለሁ፣ እባክዎን ትዕዛዞቼን ያሳዩኝ።',
  default: 'አሁን በመለያዬ ገብቻለሁ፣ እባክዎን ይቀጥሉ።',
};

let messageCounter = 0;
const nextId = () => `m${Date.now()}-${messageCounter++}`;

export interface AssistantChatProps {
  onAddToCart?: (item: AssistantItem) => void;
  onOpenCart?: () => void;
}

export default function AssistantChat({ onAddToCart, onOpenCart }: AssistantChatProps = {}) {
  // The assistant answers in ONE language at a time. Showing English and Amharic
  // stacked for every reply doubled the height of every message and, for a
  // customer who reads only one of them, buried the part they needed.
  const { language, t, tItem } = useLanguage();
  const { user, checkAuth } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quickActions, setQuickActions] = useState<QuickAction[]>(FALLBACK_QUICK_ACTIONS);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [addedItemId, setAddedItemId] = useState<number | null>(null);

  const handleItemAddToCart = useCallback((e: React.MouseEvent, item: AssistantItem) => {
    e.stopPropagation();
    e.preventDefault();
    if (onAddToCart) {
      onAddToCart(item);
      setAddedItemId(item.id);
      setTimeout(() => {
        setAddedItemId(prev => prev === item.id ? null : prev);
      }, 1500);
    }
  }, [onAddToCart]);

  // Sign-in flow. The assistant asks for an account when the customer wants to
  // reserve a table or check their own orders; the modal opens from the message
  // that asked for it, and the interrupted conversation resumes on success.
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const [pendingResume, setPendingResume] = useState<string | null>(null);

  const sessionIdRef = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Stable conversation id so the assistant keeps short-term context
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('buna_assistant_session');
      if (stored) {
        sessionIdRef.current = stored;
      } else {
        const fresh = `web-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem('buna_assistant_session', fresh);
        sessionIdRef.current = fresh;
      }
    }

    apiFetch('/api/v1/assistant/quick-actions/')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.quick_actions?.length) setQuickActions(data.quick_actions);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const send = useCallback(async (text: string) => {
    const query = text.trim();
    if (!query || isLoading) return;

    setInput('');
    setLastFailed(null);
    setMessages(prev => [...prev, { id: nextId(), from: 'user', en: query }]);

    if (!isOpen) setUnread(0);

    setIsLoading(true);
    try {
      // apiFetch, not raw fetch: an expired access cookie is refreshed and the
      // request replayed. Otherwise a signed-in customer silently drops back to
      // a guest mid-conversation and the assistant starts asking them to sign in
      // while they are already signed in.
      const res = await apiFetch('/api/v1/assistant/message/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, session_id: sessionIdRef.current }),
      });

      if (!res.ok) throw new Error('request failed');

      const data = await res.json();
      const action: AssistantAction = data.action || {};
      setMessages(prev => [
        ...prev,
        {
          id: nextId(),
          from: 'assistant',
          en: data.answer_en || data.answer || '',
          am: data.answer_am || '',
          queryLang: data.language,
          items: data.items || [],
          reservations: data.reservations || [],
          orders: data.orders || [],
          action,
        },
      ]);

      // Remember what the customer was trying to do so it can be picked up
      // after they sign in.
      if (action.action === 'auth_required') {
        setPendingResume(action.resume_intent || null);
      } else {
        setPendingResume(null);
      }
    } catch {
      setLastFailed(query);
      setMessages(prev => [
        ...prev,
        { id: nextId(), from: 'assistant', error: true, en: GENERIC_ERROR.en, am: GENERIC_ERROR.am },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isOpen]);

  const openAuth = useCallback((mode: 'LOGIN' | 'REGISTER', reason?: string) => {
    setAuthMode(mode);
    setAuthPrompt(reason ?? null);
    setAuthModalOpen(true);
  }, []);

  const handleAuthSuccess = useCallback(async () => {
    setAuthModalOpen(false);
    // The cookie is already set by the auth endpoint; re-read the profile so the
    // assistant sees an authenticated customer on the next turn.
    await checkAuth();
    if (pendingResume) {
      const prompts = language === 'am' ? RESUME_PROMPTS_AM : RESUME_PROMPTS;
      const resumeQuery = prompts[pendingResume] ?? prompts.default;
      setPendingResume(null);
      // Short delay lets the auth cookie settle before the follow-up goes out.
      setTimeout(() => send(resumeQuery), 250);
    }
  }, [checkAuth, language, pendingResume, send]);

  const handleQuickAction = (action: QuickAction) => {
    // Send the prompt in the language the customer is actually reading.
    send(language === 'am' ? action.query_am : action.query_en);
  };

  const startFresh = async () => {
    setMessages([]);
    setLastFailed(null);
    try {
      await fetch('/api/v1/assistant/reset/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_id: sessionIdRef.current }),
      });
    } catch {
      /* memory reset is best-effort */
    }
    const fresh = `web-${Math.random().toString(36).slice(2)}`;
    if (typeof window !== 'undefined') window.localStorage.setItem('buna_assistant_session', fresh);
    sessionIdRef.current = fresh;
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => {
          setIsOpen(v => !v);
          setUnread(0);
        }}
        aria-label={t('Buna Hub Assistant')}
        className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold text-sm shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:brightness-110 active:scale-95 transition-all"
      >
        <i className={`ph ${isOpen ? 'ph-x' : 'ph-chat-circle-dots'} text-xl`}></i>
        <span className="hidden sm:inline">{isOpen ? t('Close') : t('Ask Buna')}</span>
        {unread > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-5 z-[70] w-[calc(100vw-2rem)] sm:w-[420px] h-[70vh] max-h-[620px] bg-surface border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-surface-2 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] flex items-center justify-center text-[var(--accent)]">
                <i className="ph ph-coffee-bean text-lg"></i>
              </span>
              <div className="min-w-0">
                <p className="font-display text-[15px] font-bold text-[var(--text)] truncate">Buna Hub Assistant</p>
                <p className="text-[11px] text-[var(--muted)] truncate">
                  {language === 'am'
                    ? 'ስለ ሜኑ እና ቦታ ማስያዝ እርዳታ'
                    : 'Menu & reservations help'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <LanguageToggle
                className="h-7 px-2 rounded-full text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors flex items-center gap-1 text-[11px] font-semibold border border-[var(--border)] hover:border-[var(--accent)]"
              />
              <button
                onClick={startFresh}
                title={language === 'am' ? 'አዲስ ውይይት ጀምር' : 'Start a new conversation'}
                className="w-8 h-8 rounded-full text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
              >
                <i className="ph ph-arrow-counter-clockwise text-base"></i>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title={t('Close')}
                className="w-8 h-8 rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--accent-soft)] transition-colors"
              >
                <i className="ph ph-x text-base"></i>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[var(--bg)]">
            {messages.length === 0 && (
              <div className="rounded-2xl rounded-tl-sm bg-surface border border-[var(--border)] p-4 text-sm space-y-2">
                <p className="text-[var(--text)] leading-relaxed">
                  {language === 'am'
                    ? 'ሰላም! ስለ ሜኑአችን፣ ዋጋዎች፣ የምርቶች መገኘት፣ የመክፈቻ ሰዓታት እና ቦታ ማስያዝ ልረዳዎ እችላለሁ።'
                    : 'Hello! I can help with our menu, prices, availability, opening hours and table reservations. Every answer comes from our live menu database.'}
                </p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.from === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.from === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--accent)] text-[var(--accent-contrast)] px-4 py-2.5 text-sm font-medium">
                    {msg.en}
                  </div>
                ) : (
                  <div
                    className={`max-w-[92%] rounded-2xl rounded-tl-sm px-4 py-3 space-y-3 border ${
                      msg.error
                        ? 'bg-red-50 text-red-900 border-red-300 dark:bg-red-950/60 dark:border-red-800 dark:text-red-200'
                        : 'bg-surface border-[var(--border)] text-[var(--text)]'
                    }`}
                  >
                    {/* One language per bubble, matching question language or customer selection. */}
                    <div className="space-y-1">
                      <p className="text-[var(--text)] text-sm leading-relaxed whitespace-pre-line">
                        {language === 'am' || msg.queryLang === 'am' ? (msg.am || msg.en) : msg.en}
                      </p>
                    </div>
                    {msg.items && msg.items.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
                        {msg.items.slice(0, 6).map(item => {
                          const isJustAdded = addedItemId === item.id;
                          return (
                            <div
                              key={item.id}
                              className="flex flex-col justify-between p-2.5 rounded-xl bg-surface-2 border border-[var(--border)] hover:border-[var(--accent)] transition-all gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {item.image_url && (
                                  <img src={item.image_url} alt={tItem(item.name)} className="w-10 h-10 rounded-lg object-cover shrink-0 shadow-sm" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className="block text-[12px] font-bold text-[var(--text)] truncate">{tItem(item.name)}</span>
                                  <span className="block text-[11px] text-[var(--accent)] font-semibold">
                                    {Number(item.price).toFixed(0)} {language === 'am' ? 'ብር' : 'ETB'}
                                    {!item.available && <span className="text-red-600 dark:text-red-400"> · {t('Unavailable')}</span>}
                                  </span>
                                </div>
                              </div>
                              {onAddToCart && item.available && (
                                <button
                                  type="button"
                                  onClick={(e) => handleItemAddToCart(e, item)}
                                  className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                                    isJustAdded
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110'
                                  }`}
                                >
                                  <i className={`ph ${isJustAdded ? 'ph-check-bold' : 'ph-shopping-bag'} text-sm`}></i>
                                  <span>{isJustAdded ? (language === 'am' ? 'ተጨምሯል! ✓' : 'Added! ✓') : (language === 'am' ? 'ወደ ቅርጫት ጨምር' : 'Add to Cart')}</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {msg.reservations && msg.reservations.length > 0 && (
                      <div className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--muted)]">
                        <i className="ph ph-calendar-check text-[var(--accent)]"></i>{' '}
                        {msg.reservations.length} {t('reservation records saved')}
                      </div>
                    )}

                    {msg.orders && msg.orders.length > 0 && (
                      <div className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--muted)] space-y-1">
                        {msg.orders.map(order => (
                          <p key={order.order_number} className="flex items-center gap-1.5">
                            <i className="ph ph-receipt text-[var(--accent)]"></i>
                            <span className="font-semibold text-[var(--text)]">{order.order_number}</span>
                            {order.status_label && <span>· {order.status_label}</span>}
                            <span>· {Number(order.total_etb).toFixed(0)} ETB</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Sign-in / sign-up, shown only when the assistant says it
                        needs an account. The customer has already been told what
                        we were about to do for them, so these buttons just get
                        them there. */}
                    {msg.action?.action === 'auth_required' && !user && (
                      <div className="border-t border-[var(--border)] pt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => openAuth('LOGIN', msg.action?.reason_en)}
                          className="px-3 py-1.5 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[12px] font-bold hover:brightness-110 transition-all"
                        >
                          <i className="ph ph-sign-in mr-1"></i>
                          {t('Sign In')}
                        </button>
                        <button
                          onClick={() => openAuth('REGISTER', msg.action?.reason_am)}
                          className="px-3 py-1.5 rounded-full bg-transparent border border-[var(--accent)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent-soft)] transition-colors"
                        >
                          <i className="ph ph-user-plus mr-1"></i>
                          {t('Sign Up')}
                        </button>
                      </div>
                    )}

                    {msg.action?.action === 'order_placed' && (
                      <a
                        href="/account?tab=orders"
                        className="border-t border-[var(--border)] pt-3 flex items-center gap-1.5 text-[12px] font-bold text-[var(--accent)] hover:underline"
                      >
                        <i className="ph ph-receipt"></i>
                        {t('Track your order')}
                      </a>
                    )}

                    {msg.error && lastFailed && (
                      <button
                        onClick={() => send(lastFailed)}
                        className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--accent)] hover:underline"
                      >
                        <i className="ph ph-arrow-clockwise"></i> {t('Retry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-[var(--muted)] text-xs bg-surface border border-[var(--border)] rounded-xl px-3 py-2 w-max">
                <i className="ph ph-circle-notch animate-spin"></i>
                {language === 'am' ? 'መረጃ በመፈለግ ላይ…' : 'Checking the menu…'}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 bg-surface-2 border-t border-[var(--border)] flex gap-2 overflow-x-auto">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                disabled={isLoading}
                title={`${action.label_am} — ${action.label_en}`}
                className="shrink-0 px-3 py-1.5 rounded-full bg-surface border border-[var(--border)] text-[11px] font-semibold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
              >
                <span className="mr-1">{action.icon}</span>
                {language === 'am' ? action.label_am : action.label_en}
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={e => {
              e.preventDefault();
              send(input);
            }}
            className="px-3 py-3 bg-surface-2 border-t border-[var(--border)] flex items-center gap-2"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={language === 'am' ? 'ስለ ሜኑ ይጠይቁ…' : 'Ask about the menu…'}
              className="flex-1 bg-surface border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label={t('Send')}
              className="w-11 h-11 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center hover:brightness-110 transition-all disabled:opacity-40"
            >
              <i className="ph ph-paper-plane-tilt text-lg"></i>
            </button>
          </form>
        </div>
      )}

      {/* Sign-in / sign-up, opened from the assistant's own request. On success
          the interrupted conversation resumes on its own. */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        promptMessage={authPrompt}
        onClose={() => setAuthModalOpen(false)}
        onSuccessCallback={handleAuthSuccess}
      />
    </>
  );
}
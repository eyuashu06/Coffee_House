'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
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

interface ChatMessage {
  id: string;
  from: 'user' | 'assistant';
  en?: string;
  am?: string;
  error?: boolean;
  items?: AssistantItem[];
  reservations?: Record<string, unknown>[];
  action?: { action?: string };
}

const FALLBACK_QUICK_ACTIONS: QuickAction[] = [
  { id: 'menu', label_en: 'View Menu', label_am: 'ሜኑ ይመልከቱ', icon: '☕', query_en: 'Show me the menu', query_am: 'ሜኑውን አሳይኝ' },
  { id: 'food', label_en: 'Food', label_am: 'ምግብ', icon: '🍰', query_en: 'What food do you have?', query_am: 'ምን አይነት ምግብ አላችሁ?' },
  { id: 'drinks', label_en: 'Drinks', label_am: 'መጠጦች', icon: '🥤', query_en: 'What drinks are available?', query_am: 'ምን አይነት መጠጥ አላችሁ?' },
  { id: 'reservation', label_en: 'Make Reservation', label_am: 'ቦታ ማስያዝ', icon: '📅', query_en: 'I want to reserve a table', query_am: 'ቦታ ማስያዝ እፈልጋለሁ' },
  { id: 'prices', label_en: 'Check Prices', label_am: 'ዋጋ ይመልከቱ', icon: '💰', query_en: 'How much is Masala Chai Latte?', query_am: 'Masala Chai Latte ዋጋው ስንት ነው?' },
  { id: 'about', label_en: 'About Coffee House', label_am: 'ስለ Coffee House', icon: 'ℹ️', query_en: 'What is this system?', query_am: 'ይህ ስርዓት ምንነው?' },
];

const GENERIC_ERROR = {
  en: "Sorry, I'm having trouble retrieving that information right now. Please try again shortly.",
  am: 'ይቅርታ፣ ያንን መረጃ አሁን ማግኘት አልቻልኩም። እባክዎ እንደገና በትንሹ ቆይተው ይሞክሩ።',
};

let messageCounter = 0;
const nextId = () => `m${Date.now()}-${messageCounter++}`;

export default function AssistantChat() {
  // The assistant answers in ONE language at a time. Showing English and Amharic
  // stacked for every reply doubled the height of every message and, for a
  // customer who reads only one of them, buried the part they needed.
  const { language, t, tItem } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quickActions, setQuickActions] = useState<QuickAction[]>(FALLBACK_QUICK_ACTIONS);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

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

    fetch('/api/v1/assistant/quick-actions/', { credentials: 'include' })
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

  const send = useCallback(async (text: string, amharic = false) => {
    const query = text.trim();
    if (!query || isLoading) return;

    setInput('');
    setLastFailed(null);
    setMessages(prev => [...prev, { id: nextId(), from: 'user', en: query }]);

    if (!isOpen) setUnread(0);

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/assistant/message/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, session_id: sessionIdRef.current }),
      });

      if (!res.ok) throw new Error('request failed');

      const data = await res.json();
      setMessages(prev => [
        ...prev,
        {
          id: nextId(),
          from: 'assistant',
          en: data.answer_en || data.answer || '',
          am: data.answer_am || '',
          items: data.items || [],
          reservations: data.reservations || [],
          action: data.action || {},
        },
      ]);
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
        className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-full bg-[#f7b5be] text-[#4e232b] font-bold text-sm shadow-[0_10px_30px_rgba(0,0,0,0.45)] hover:brightness-110 active:scale-95 transition-all"
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
        <div className="fixed bottom-24 right-4 sm:right-5 z-[70] w-[calc(100vw-2rem)] sm:w-[420px] h-[70vh] max-h-[620px] bg-[#1c1b1b] border border-[#514345] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-[#3b141c] border-b border-[#514345] flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-[#1c1b1b] border border-[#683941] flex items-center justify-center text-[#f7b5be]">
                <i className="ph ph-coffee-bean text-lg"></i>
              </span>
              <div className="min-w-0">
                <p className="font-display text-[15px] font-bold text-white truncate">Buna Hub Assistant</p>
                <p className="text-[11px] text-[#d5c2c3] truncate">
                  {language === 'am'
                    ? 'ስለ ሜኑ እና ቦታ ማስያዝ እርዳታ'
                    : 'Menu & reservations help'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <LanguageToggle
                compact
                className="w-8 h-8 rounded-full text-[#d5c2c3] hover:text-[#f7b5be] hover:bg-white/10 transition-colors flex items-center justify-center"
              />
              <button
                onClick={startFresh}
                title={language === 'am' ? 'አዲስ ውይይት ጀምር' : 'Start a new conversation'}
                className="w-8 h-8 rounded-full text-[#d5c2c3] hover:text-[#f7b5be] hover:bg-white/10 transition-colors"
              >
                <i className="ph ph-arrow-counter-clockwise text-base"></i>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title={t('Close')}
                className="w-8 h-8 rounded-full text-[#d5c2c3] hover:text-white hover:bg-white/10 transition-colors"
              >
                <i className="ph ph-x text-base"></i>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#131313]">
{messages.length === 0 && (
              <div className="rounded-2xl rounded-tl-sm bg-[#1c1b1b] border border-[#514345] p-4 text-sm space-y-2">
                <p className="text-[#e5e2e1] leading-relaxed">
                  {language === 'am'
                    ? 'ሰላም! ስለ ሜኑአችን፣ ዋጋዎች፣ የምርቶች መገኘት፣ የመክፈቻ ሰዓታት እና ቦታ ማስያዝ ልረዳዎ እችላለሁ።'
                    : 'Hello! I can help with our menu, prices, availability, opening hours and table reservations. Every answer comes from our live menu database.'}
                </p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.from === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.from === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#f7b5be] text-[#4e232b] px-4 py-2.5 text-sm font-medium">
                    {msg.en}
                  </div>
) : (
                  <div
                    className={`max-w-[92%] rounded-2xl rounded-tl-sm px-4 py-3 space-y-3 border ${
                      msg.error
                        ? 'bg-red-950/60 border-red-800'
                        : 'bg-[#1c1b1b] border-[#514345]'
                    }`}
                  >
                    {/* One language per bubble, chosen by the customer. */}
                    <div className="space-y-1">
                      <p className="text-[#e5e2e1] text-sm leading-relaxed whitespace-pre-line">
                        {language === 'am' ? (msg.am || msg.en) : msg.en}
                      </p>
                    </div>
                    {msg.items && msg.items.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 border-t border-[#514345] pt-3">
                        {msg.items.slice(0, 6).map(item => (
                          <a
                            key={item.id}
                            href="#menu"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-2 p-2 rounded-lg bg-[#131313] border border-[#514345]/70 hover:border-[#f7b5be] transition-colors"
                          >
                            {item.image_url && (
                              <img src={item.image_url} alt={tItem(item.name)} className="w-9 h-9 rounded object-cover shrink-0" />
                            )}
                            <span className="min-w-0">
                              <span className="block text-[12px] font-bold text-[#e5e2e1] truncate">{tItem(item.name)}</span>
                              <span className="block text-[11px] text-[#f7b5be]">
                                {Number(item.price).toFixed(0)} {language === 'am' ? 'ብር' : 'ETB'}
                                {!item.available && <span className="text-red-300"> · {t('Unavailable')}</span>}
                              </span>
                            </span>
                          </a>
                        ))}
                      </div>
                    )}

                    {msg.reservations && msg.reservations.length > 0 && (
                      <div className="border-t border-[#514345] pt-2 text-[11px] text-[#d5c2c3]">
                        <i className="ph ph-calendar-check text-[#f7b5be]"></i>{' '}
                        {msg.reservations.length} {t('reservation records saved')}
                      </div>
                    )}

                    {msg.error && lastFailed && (
                      <button
                        onClick={() => send(lastFailed)}
                        className="flex items-center gap-1.5 text-[12px] font-bold text-[#f7b5be] hover:underline"
                      >
                        <i className="ph ph-arrow-clockwise"></i> {t('Retry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-[#d5c2c3] text-xs bg-[#1c1b1b] border border-[#514345] rounded-xl px-3 py-2 w-max">
                <i className="ph ph-circle-notch animate-spin"></i>
                {language === 'am' ? 'መረጃ በመፈለግ ላይ…' : 'Checking the menu…'}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 bg-[#131313] border-t border-[#514345] flex gap-2 overflow-x-auto">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                disabled={isLoading}
                title={`${action.label_am} — ${action.label_en}`}
                className="shrink-0 px-3 py-1.5 rounded-full bg-[#1c1b1b] border border-[#514345] text-[11px] font-semibold text-[#e5e2e1] hover:border-[#f7b5be] hover:text-[#f7b5be] transition-colors disabled:opacity-50"
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
            className="px-3 py-3 bg-[#1c1b1b] border-t border-[#514345] flex items-center gap-2"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={language === 'am' ? 'ስለ ሜኑ ይጠይቁ…' : 'Ask about the menu…'}
              className="flex-1 bg-[#131313] border border-[#514345] rounded-xl px-3 py-2.5 text-sm text-[#e5e2e1] focus:outline-none focus:border-[#f7b5be]"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label={t('Send')}
              className="w-11 h-11 rounded-xl bg-[#f7b5be] text-[#4e232b] flex items-center justify-center hover:brightness-110 transition-all disabled:opacity-40"
            >
              <i className="ph ph-paper-plane-tilt text-lg"></i>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
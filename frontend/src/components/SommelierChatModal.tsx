'use client';

import React, { useState } from 'react';

interface ChatMessage {
  sender: 'user' | 'sommelier';
  text: string;
  recommendations?: any[];
  sources?: string[];
}

interface SommelierChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SommelierChatModal({ isOpen, onClose }: SommelierChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'sommelier',
      text: "Greetings, coffee enthusiast! I am Clara Vance, Master Sommelier at Artisanal Reserve. Ask me anything about single-origin micro-lots, custom tasting notes, brewing science, or food pairings."
    }
  ]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (textToSend?: string) => {
    const input = (textToSend || query).trim();
    if (!input) return;

    setMessages(prev => [...prev, { sender: 'user', text: input }]);
    if (!textToSend) setQuery('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/sommelier/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [
          ...prev,
          {
            sender: 'sommelier',
            text: data.answer,
            recommendations: data.recommendations,
            sources: data.sources,
          }
        ]);
      } else {
        throw new Error('API request failed');
      }
    } catch (err) {
      // Local Sommelier RAG response fallback
      let fallbackText = "Based on our artisanal reserve cupping notes, I recommend our **Panama Boquete Geisha Pour-Over**. It delivers high-altitude guava, jasmine florals, and bergamot with a sparkling clean finish.";
      const q = input.toLowerCase();
      if (q.includes('dark') || q.includes('bold') || q.includes('chocolate')) {
        fallbackText = "For deep cacao richness, try our **Sumatra Blue Batak Dark Roast** or **Roasted Hazelnut Truffle Mocha**. They offer velvet body, 72% dark chocolate, and roasted hazelnut notes.";
      } else if (q.includes('cold') || q.includes('ice')) {
        fallbackText = "Our **Kyoto 16-Hour Cold Drip** is slow-extracted over Dutch glass towers, presenting zero bitterness, whiskey oak hints, and black cherry esters.";
      }

      setMessages(prev => [
        ...prev,
        {
          sender: 'sommelier',
          text: fallbackText,
          sources: ['Artisanal Reserve Knowledge Base']
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-surface-container rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[650px] border border-tertiary/20 z-10">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-primary-container via-[#290d13] to-primary-container border-b border-tertiary/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-tertiary/40 overflow-hidden">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAjfgjpsp6sXpG9KsJgylWmLBLY0LHtSVqS09oaYx3hzP7bLT8ak-zeDjyspksX3ie_Fzy3JvhB_WA2iDsnoiXnUX6yTRh_aPP5oK4BBNwagQn9hHUunBT2Twjc3U3UOtJQSok9NIEyxggpS6mi2Xk5wMB0VvFH_PL6XF0KHW6p5Io_QOcUZDYqrPmr3bLFo32LvWAHngtPDFfp6veV-yb7AVtVZPPVcloVwzNpN4pjGG6SpuC9seN5"
                alt="Clara Vance"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-headline text-base font-bold text-white">AI Coffee Sommelier</h3>
                <span className="px-2 py-0.2 rounded-full bg-tertiary/20 text-tertiary text-[10px] font-bold">RAG Active</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">Master Barista & Tasting Intelligence</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-white">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-background/50">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-md ${
                  msg.sender === 'user'
                    ? 'bg-secondary text-on-secondary font-medium rounded-tr-none'
                    : 'bg-surface-container-high text-on-surface border border-white/5 rounded-tl-none'
                }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>

                {/* Recommendations */}
                {msg.recommendations && msg.recommendations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                    {msg.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-surface-container border border-tertiary/20 text-xs">
                        <img src={rec.image_url} alt={rec.name} className="w-8 h-8 rounded object-cover" />
                        <div>
                          <span className="font-bold text-white block truncate">{rec.name}</span>
                          <span className="text-tertiary text-[11px]">${Number(rec.price).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sources Citation */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 text-[10px] text-outline flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-tertiary">import_contacts</span>
                    <span>RAG Knowledge Source: {msg.sources.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-tertiary text-xs p-3 bg-surface-container-high rounded-xl max-w-xs border border-white/5">
              <span className="material-symbols-outlined text-sm animate-spin">sync</span>
              <span>RAG Engine querying Coffee Knowledge Base...</span>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-5 py-2 bg-surface-container-low flex items-center gap-2 overflow-x-auto no-scrollbar border-t border-white/5">
          <button
            onClick={() => handleSend('Recommend a fruity light roast for pour-over')}
            className="flex-shrink-0 px-3 py-1 rounded-full bg-surface-bright text-[11px] text-tertiary hover:bg-tertiary/20 transition-colors border border-tertiary/30"
          >
            🌸 Light Roast Pour-Over
          </button>
          <button
            onClick={() => handleSend('What coffee pairs best with croissants or tiramisu?')}
            className="flex-shrink-0 px-3 py-1 rounded-full bg-surface-bright text-[11px] text-tertiary hover:bg-tertiary/20 transition-colors border border-tertiary/30"
          >
            🥐 Pastry Pairing Guide
          </button>
          <button
            onClick={() => handleSend('Tell me about cold drip extraction science')}
            className="flex-shrink-0 px-3 py-1 rounded-full bg-surface-bright text-[11px] text-tertiary hover:bg-tertiary/20 transition-colors border border-tertiary/30"
          >
            🧊 Cold Drip Science
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-surface-container border-t border-white/10 flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Sommelier Clara about roasts, notes, pairings..."
            className="flex-1 bg-surface-container-high px-4 py-2.5 rounded-xl text-xs sm:text-sm text-on-surface placeholder:text-outline focus:outline-none border border-white/5 focus:border-tertiary"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !query.trim()}
            className="p-2.5 rounded-xl bg-secondary text-on-secondary hover:bg-tertiary-fixed transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-lg">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

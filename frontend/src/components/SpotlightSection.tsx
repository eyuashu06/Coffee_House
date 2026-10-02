'use client';

import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function SpotlightSection() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <section className="px-4 sm:px-6 py-16 max-w-6xl mx-auto">
      <div className="rounded-3xl overflow-hidden shadow-2xl bg-[#faf4f5] text-[#290d13] border border-secondary/20">
        <div className="p-6 sm:p-10 flex flex-col gap-6">
          {/* Header & Barista Profile */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-md border-2 border-secondary">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAjfgjpsp6sXpG9KsJgylWmLBLY0LHtSVqS09oaYx3hzP7bLT8ak-zeDjyspksX3ie_Fzy3JvhB_WA2iDsnoiXnUX6yTRh_aPP5oK4BBNwagQn9hHUunBT2Twjc3U3UOtJQSok9NIEyxggpS6mi2Xk5wMB0VvFH_PL6XF0KHW6p5Io_QOcUZDYqrPmr3bLFo32LvWAHngtPDFfp6veV-yb7AVtVZPPVcloVwzNpN4pjGG6SpuC9seN5"
                alt="Clara Vance"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs uppercase tracking-wider text-secondary-container font-bold">{t('Master Barista Spotlight')}</span>
              <h4 className="font-headline text-2xl font-bold text-on-tertiary-fixed leading-tight">Clara Vance</h4>
              <span className="text-xs text-inverse-on-surface opacity-80">{t('Head of Extraction Craft')}</span>
            </div>
          </div>

          {/* Barista Quote */}
          <div className="p-4 rounded-xl bg-white/70 border border-[#4d2b00]/10">
            <p className="text-sm italic text-on-tertiary-fixed font-serif leading-relaxed">
              {t('"Hand-roasted in small 5kg batches every dawn in our micro-roastery. We listen closely for the second crack to preserve pure terroir nuance."')}
            </p>
          </div>

          {/* Reserve Club Signup */}
          <div className="pt-4 flex flex-col gap-3 border-t border-[#4d2b00]/10">
            <span className="font-headline text-lg text-on-tertiary-fixed font-bold">{t('Join Reserve Tasting Club')}</span>
            <p className="text-xs text-inverse-on-surface opacity-85 leading-relaxed">
              {t('Receive private micro-lot allocations, first-harvest cupping invites, and complimentary home grind calibrations.')}
            </p>

            {subscribed ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>Welcome to the Reserve Club! Invitation sent to your email.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mt-2">
                <div className="relative flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your email address"
                    className="w-full h-11 px-4 pr-10 rounded-xl text-xs bg-white text-on-tertiary-fixed border border-[#d5c2c3] focus:outline-none focus:border-secondary"
                  />
                  <span className="material-symbols-outlined absolute right-3 top-3 text-base text-outline pointer-events-none">mail</span>
                </div>
                <button
                  type="submit"
                  className="py-3 px-6 rounded-xl text-xs uppercase font-bold tracking-wider text-white bg-[#3b141c] hover:bg-[#290d13] transition-colors shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>{t('Request Invitation')}</span>
                  <span className="material-symbols-outlined text-sm text-tertiary">east</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

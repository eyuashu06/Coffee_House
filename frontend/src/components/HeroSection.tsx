'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface HeroSectionProps {
  onOpenSommelier: () => void;
  onScrollToMenu: () => void;
}

export default function HeroSection({ onOpenSommelier, onScrollToMenu }: HeroSectionProps) {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden px-4 sm:px-6 pt-24 pb-16 bg-gradient-to-br from-[#290d13] via-[#3b141c] to-[#4a1a24] text-on-surface">
      {/* Radial Golden Ambient Glow */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none blur-3xl opacity-60" 
        style={{ background: 'radial-gradient(circle, rgba(243, 150, 28, 0.3) 0%, rgba(59, 20, 28, 0) 70%)' }}
      />

      <div className="max-w-6xl mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        {/* Left Column: Text & Hero Details */}
        <div className="flex flex-col items-start gap-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-high/60 backdrop-blur-md border border-secondary/30 shadow-md">
            <span className="material-symbols-outlined text-sm text-tertiary">eco</span>
            <span className="text-xs uppercase tracking-wider text-tertiary font-bold">{t('100% Single-Origin Micro-Lots')}</span>
          </div>

          <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-tight">
            {t('Awaken Your Senses With')} <span className="text-tertiary italic font-serif">{t('Rare Harvests')}</span>
          </h1>

          <p className="text-base text-on-surface-variant max-w-lg leading-relaxed font-light">
            {t('Single-estate selections slow-roasted in dawn micro-batches to illuminate delicate floral guava notes and velvety cacao depths.')}
          </p>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={onScrollToMenu}
              className="w-full sm:w-auto py-3.5 px-8 rounded-full font-semibold text-sm uppercase tracking-wider text-on-secondary flex items-center justify-center gap-2 bg-[#f3961c] hover:bg-[#ffbe53] transition-all duration-200 shadow-[0_4px_20px_rgba(243,150,28,0.4)] active:scale-95"
            >
              <span>{t('Explore Reserve Menu')}</span>
              <span className="material-symbols-outlined text-lg">local_cafe</span>
            </button>

            <button
              onClick={onOpenSommelier}
              className="w-full sm:w-auto py-3.5 px-6 rounded-full font-medium text-sm text-tertiary flex items-center justify-center gap-2 bg-surface-container-high/70 hover:bg-surface-bright border border-tertiary/30 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              <span>{t('Ask AI Sommelier')}</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="w-full grid grid-cols-3 gap-3 bg-surface-container-low/70 backdrop-blur-md rounded-2xl p-4 mt-4 border border-white/5 shadow-xl">
            <div className="flex flex-col items-center text-center">
              <span className="font-headline text-2xl text-tertiary font-bold">94+</span>
              <span className="text-[11px] text-on-surface-variant uppercase mt-0.5">{t('Q-Grade Score')}</span>
            </div>
            <div className="flex flex-col items-center text-center border-x border-white/10 px-2">
              <span className="font-headline text-2xl text-secondary font-bold">48h</span>
              <span className="text-[11px] text-on-surface-variant uppercase mt-0.5">{t('Anaerobic Ferment')}</span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="font-headline text-2xl text-primary font-bold">100%</span>
              <span className="text-[11px] text-on-surface-variant uppercase mt-0.5">{t('Direct Farm Trade')}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Hero Coffee Cup Display Card */}
        <div className="relative flex justify-center items-center">
          <div className="relative group cursor-pointer animate-float">
            <div className="w-72 h-72 sm:w-88 sm:h-88 rounded-full p-1.5 bg-gradient-to-b from-tertiary/40 via-secondary-container/20 to-transparent shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)]">
              <div className="w-full h-full rounded-full overflow-hidden relative">
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCBeQuQkvjJch3k03gIZ1HXmn5HoBPeJqL3EQzpxczX_Jvl7WdQ6BVxTU6nDe8q26SyVyRjTdbddPt01l4s18LLBbxlbzmnPN4O7hyaOft5wYn1SkqQcPjLsSxw7QArl-OFK3hpMQW04JL5ch8DpY6T5FGtJ9-f9HHF7r_MSY1uyu0x7FG04T8UTVvlhwhScHysvhNyGTMN5pVKl0-defg3r0D13EXPvldYY9-8bktXFoHcdUPgNnDF"
                  alt="Signature Velvet Roast"
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#131313]/80 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>

            {/* Badge overlay */}
            <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl backdrop-blur-md bg-[#20201f]/80 border border-tertiary/20 flex items-center justify-between shadow-xl">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-headline text-sm font-semibold text-white truncate">Ethiopian Geisha Honey Wash</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-tertiary font-bold">4.95 ★</span>
                  <span className="text-[11px] text-on-surface-variant">(Bench Maji • 2,100m)</span>
                </div>
              </div>
              <span className="text-base text-tertiary font-bold flex-shrink-0">7.25 ETB</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

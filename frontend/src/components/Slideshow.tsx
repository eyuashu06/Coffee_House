'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface Slide {
  src: string;
  alt: string;
  caption?: string;
}

/**
 * Auto-advancing image slideshow with dots, arrows and swipe support.
 *
 * Slides crossfade (no layout jump) and pause while the visitor hovers or focuses
 * the frame, so reading a caption never races the timer.
 */
export default function Slideshow({
  slides,
  intervalMs = 5000,
  className = '',
  rounded = 'rounded-[18px]',
}: {
  slides: Slide[];
  /** Time each slide stays on screen. */
  intervalMs?: number;
  className?: string;
  rounded?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = slides.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, paused, intervalMs]);

  if (count === 0) return null;

  return (
    <div
      className={`relative overflow-hidden ${rounded} border border-[var(--border)] bg-[var(--surface-2)] ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) > 40) go(index + (delta < 0 ? 1 : -1));
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label="Photo slideshow"
      data-testid="slideshow"
    >
      <div className="relative w-full h-full">
        {slides.map((slide, i) => (
          <div
            key={slide.src + i}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              i === index ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
            aria-hidden={i !== index}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              decoding="async"
              loading={i === 0 ? 'eager' : 'lazy'}
              className={`w-full h-full object-cover ${i === index ? 'ken-burns' : ''}`}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(10,6,5,0.72), rgba(10,6,5,0))',
              }}
            />
          </div>
        ))}
      </div>

      {slides[index].caption && (
        <p className="absolute left-4 right-16 bottom-4 sm:left-6 sm:bottom-5 z-20 text-[13.5px] sm:text-sm italic text-white/90 drop-shadow">
          {slides[index].caption}
        </p>
      )}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">chevron_right</span>
          </button>

          <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-6 z-20 flex items-center gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.src + i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to image ${i + 1}`}
                aria-current={i === index}
                className={`rounded-full transition-all duration-300 ${
                  i === index ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

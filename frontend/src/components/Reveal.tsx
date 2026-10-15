'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Fade-up wrapper driven by IntersectionObserver.
 *
 * Children get the `.reveal` class treatment when they scroll into view, so each
 * section eases in instead of popping. Elements already in the viewport on mount
 * (the hero) are revealed immediately.
 */
export default function Reveal({
  children,
  className = '',
  as: Tag = 'div',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Element to render — section, div, figure, li… */
  as?: React.ElementType;
  /** Stagger delay in milliseconds when several reveals sit together. */
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

'use client';

import { useEffect } from 'react';

export default function SWRegister() {
  useEffect(() => {
    // Production only. The worker caches static assets cache-first, which is safe for a
    // build because Next.js content-hashes chunk filenames there. In development those
    // names are stable, so the worker happily serves a stale bundle from a previous
    // session - a change to the source appears to have no effect until the cache is
    // cleared by hand, which reads as "my fix didn't work".
    if (process.env.NODE_ENV !== 'production') return;

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('SW registration failed: ', err);
        });
      });
    }
  }, []);

  return null;
}

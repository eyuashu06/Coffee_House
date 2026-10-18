'use client';

import { useEffect } from 'react';

export default function SWRegister() {
  useEffect(() => {
    // Production only. In development, unregister any existing service workers so
    // Webpack HMR chunks are never served stale or out-of-sync.
    if (process.env.NODE_ENV !== 'production') {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      }
      return;
    }

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

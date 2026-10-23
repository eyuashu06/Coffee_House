'use client';

import { useEffect } from 'react';

export default function SWRegister() {
  useEffect(() => {
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.local'));

    // Production only on remote domains. In development or local testing, purge all service workers and caches
    // so Next.js HMR/Webpack chunks are never served stale.
    if (process.env.NODE_ENV !== 'production' || isLocalhost) {
      if (typeof window !== 'undefined') {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const reg of registrations) {
              reg.unregister();
            }
          });
        }
        if ('caches' in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              caches.delete(key);
            }
          });
        }
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

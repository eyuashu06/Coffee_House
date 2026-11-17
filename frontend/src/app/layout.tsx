import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import { CafeProvider } from '../context/CafeContext';
import { MenuProvider } from '../context/MenuContext';
import { ThemeProvider, type Theme } from '../context/ThemeContext';
import SWRegister from '../components/SWRegister';

const LANGUAGE_COOKIE = 'app_lang';
const THEME_COOKIE = 'app_theme';

function readLanguageCookie(): 'en' | 'am' {
  const value = cookies().get(LANGUAGE_COOKIE)?.value;
  return value === 'am' ? 'am' : 'en';
}

function readThemeCookie(): Theme {
  const value = cookies().get(THEME_COOKIE)?.value;
  return value === 'light' ? 'light' : 'dark';
}

export const metadata: Metadata = {
  title: 'Artisanal Reserve | Micro-Lot Coffee & AI Sommelier',
  description: 'Single-origin micro-lots, signature espresso infusions, and AI RAG Coffee Sommelier recommendations.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#3b141c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const language = readLanguageCookie();
  const theme = readThemeCookie();

  return (
    <html lang={language} className={theme === 'dark' ? 'dark' : ''} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Playfair Display (display) + Inter (body): a modern pairing that replaces
            the dated Old Standard TT / Crimson Text serifs. */}
        {/* eslint-disable-next-line @next/next/google-font-display */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet" />
        {/* Phosphor icons are self-hosted so a slow CDN cannot leave the header
            showing empty buttons (or icon names as raw text). It stays a plain
            <link> to /fonts/phosphor.css rather than a bundled import so the
            icon rules do not land in the render-blocking app stylesheet. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/fonts/phosphor.css" />
        {/* eslint-disable-next-line @next/next/google-font-display */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet" />
        {/* Apply the saved theme before first paint so a dark-mode user never sees a
            cream flash (and a light-mode user never sees espresso). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )app_theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}try{var sz=localStorage.getItem('preferred_text_size');if(sz){document.documentElement.setAttribute('data-text-size',sz);}}catch(e){}try{if(typeof window!=='undefined'&&(location.hostname==='localhost'||location.hostname==='127.0.0.1')){if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){for(var r of regs){r.unregister();}});}if('caches' in window){caches.keys().then(function(keys){for(var k of keys){caches.delete(k);}});}}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-body min-h-screen flex flex-col selection:bg-[var(--accent-soft)] selection:text-[var(--text)] transition-colors duration-300">
        <ThemeProvider initialTheme={theme}>
          <LanguageProvider initialLanguage={language}>
            <AuthProvider>
              <CafeProvider>
                <MenuProvider>
                  {children}
                </MenuProvider>
              </CafeProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
        <SWRegister />
      </body>
    </html>
  );
}


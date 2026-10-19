import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import { CafeProvider } from '../context/CafeContext';
import SWRegister from '../components/SWRegister';

const LANGUAGE_COOKIE = 'app_lang';

function readLanguageCookie(): 'en' | 'am' {
  const value = cookies().get(LANGUAGE_COOKIE)?.value;
  return value === 'am' ? 'am' : 'en';
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
  // The chosen language comes from a cookie so the server can render it. Reading it
  // from localStorage in the provider instead would make the first client render
  // disagree with the server's, which React rejects as a hydration mismatch.
  const language = readLanguageCookie();

  return (
    <html lang={language} className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Playfair Display (display) + Inter (body): a modern pairing that replaces
            the dated Old Standard TT / Crimson Text serifs. */}
        {/* eslint-disable-next-line @next/next/google-font-display */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css" rel="stylesheet" />
        {/* Apply the saved theme before first paint so a dark-mode user never sees a
            cream flash (and a light-mode user never sees espresso). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {/* display=block is what Material Symbols asks for on an icon font: with the
            default, the ligature name renders as literal text ("local_cafe") until
            the font loads. The lint rule only knows swap/optional, both of which
            reintroduce that flash. */}
        {/* eslint-disable-next-line @next/next/google-font-display */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet" />
      </head>
      <body className="font-body min-h-screen flex flex-col selection:bg-[var(--accent-soft)] selection:text-[var(--text)] transition-colors duration-300">
        <LanguageProvider initialLanguage={language}>
          <AuthProvider>
            <CafeProvider>
              {children}
            </CafeProvider>
          </AuthProvider>
        </LanguageProvider>
        <SWRegister />
      </body>
    </html>
  );
}


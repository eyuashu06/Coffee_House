import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import SWRegister from '../components/SWRegister';

export const metadata: Metadata = {
  title: 'Artisanal Reserve | Micro-Lot Coffee & AI Sommelier',
  description: 'Single-origin micro-lots, signature espresso infusions, and AI RAG Coffee Sommelier recommendations.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#3b141c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body className="bg-background font-sans text-on-surface min-h-screen flex flex-col selection:bg-tertiary selection:text-on-tertiary-fixed">
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
        <SWRegister />
      </body>
    </html>
  );
}


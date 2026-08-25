import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toast';
import { publicConfig } from '@/lib/config/public';
import { BRAND, ORGANISATION } from '@/lib/marketing/brand';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * Display face for headings.
 *
 * Bricolage Grotesque is the display font on compress.americandesignhub.com;
 * using it here is the single strongest cue that these are the same family of
 * products. Inter carries body copy on both, unchanged.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const APP_NAME = BRAND.name;
const DESCRIPTION = BRAND.description;

export const metadata: Metadata = {
  metadataBase: new URL(publicConfig.appUrl),
  title: {
    default: 'Free Background Remover — Transparent PNG at Full Resolution',
    template: `%s — ${APP_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    'background remover',
    'remove background from image',
    'transparent PNG',
    'cut out image',
    'AI background removal',
  ],
  authors: [{ name: ORGANISATION.name, url: ORGANISATION.url }],
  creator: ORGANISATION.name,
  publisher: ORGANISATION.name,
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: `${APP_NAME} — Remove image backgrounds in seconds`,
    description: DESCRIPTION,
    url: publicConfig.appUrl,
    images: [{ url: '/og.svg', width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — Remove image backgrounds in seconds`,
    description: DESCRIPTION,
    images: ['/og.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: { canonical: '/' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfaf8',
  width: 'device-width',
  initialScale: 1,
  // Never trap a user who needs to zoom into their own photo.
  maximumScale: 5,
};

const JS_FLAG = "document.documentElement.classList.add('js')";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <head>
        {/* Marks the document as scripted before the first paint. The
            scroll-reveal animations hide their content until it is observed,
            which would leave most of the homepage blank if JavaScript never
            ran. Gating the hidden state on this class keeps the page readable
            without JS, and costs no flash of hidden content with it. */}
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Skip link — first tab stop on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-paper"
        >
          Skip to content
        </a>
        <ToastProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeScript } from '@/components/theme-toggle';
import { ToastProvider } from '@/components/ui';
import { WhatsAppWidget } from '@/components/public/whatsapp-widget';
import { APP_NAME } from '@/lib/domain';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Run Your Business Smarter With AI`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'AI-powered tools that help businesses automate operations, serve customers, increase sales, and make better decisions from one platform. Built for small and medium businesses in Liberia and across West Africa.',
  applicationName: APP_NAME,
  keywords: [
    'AI business platform',
    'business automation',
    'CRM',
    'AI customer support',
    'appointment booking',
    'small business software',
    'SaaS dashboard',
    'business software Liberia',
    'West Africa business platform',
    'AI for small business Africa',
  ],
  openGraph: {
    title: `${APP_NAME} — Run Your Business Smarter With AI`,
    description:
      'One intelligent business operating system: customers, sales, appointments, inventory, marketing and AI analytics.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#080d18' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>
          {children}
          <WhatsAppWidget />
        </ToastProvider>
      </body>
    </html>
  );
}

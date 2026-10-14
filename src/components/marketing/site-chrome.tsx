import Link from 'next/link';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { APP_NAME, SUPPORT, SUPPORT_EMAIL, SUPPORT_PHONE, WHATSAPP_DEFAULT_MESSAGE, whatsappHref } from '@/lib/domain';

export function MarketingNav({ signedIn = false }: { signedIn?: boolean }) {
  const links = [
    { href: '/#problems', label: 'Why Workspace' },
    { href: '/#features', label: 'Platform' },
    { href: '/#industries', label: 'Industries' },
    { href: '/#pricing', label: 'Pricing' },
    { href: '/#faq', label: 'FAQ' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b bg-[rgb(var(--surface))]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">W</span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">{APP_NAME}</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="muted rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--text))]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle compact />
          </div>
          {signedIn ? (
            <Link
              href="/dashboard"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-[rgb(var(--surface-muted))]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Start Free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const columns = [
    {
      title: 'Platform',
      links: [
        { href: '/#features', label: 'Features' },
        { href: '/#solutions', label: 'AI solutions' },
        { href: '/#how-it-works', label: 'How it works' },
        { href: '/#pricing', label: 'Pricing' },
      ],
    },
    {
      title: 'Industries',
      links: [
        { href: '/#industries', label: 'Salons & spas' },
        { href: '/#industries', label: 'Restaurants & bars' },
        { href: '/#industries', label: 'Clinics' },
        { href: '/#industries', label: 'Retail & e-commerce' },
      ],
    },
    {
      title: 'Company',
      links: [
        { href: '/#contact', label: 'Contact & demo' },
        { href: '/#manager', label: 'Your manager' },
        { href: '/privacy', label: 'Privacy policy' },
        { href: '/terms', label: 'Terms of service' },
      ],
    },
    {
      title: 'Account',
      links: [
        { href: '/login', label: 'Sign in' },
        { href: '/signup', label: 'Create account' },
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/#faq', label: 'FAQ' },
      ],
    },
  ];

  return (
    <footer className="border-t bg-[rgb(var(--surface-muted))]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">W</span>
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <p className="muted mt-4 max-w-sm text-sm">
            The AI business operating system for small and medium businesses. Customers, sales, appointments,
            inventory, marketing and analytics in one dashboard.
          </p>
          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden />
              <a
                href={whatsappHref(WHATSAPP_DEFAULT_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                WhatsApp {SUPPORT.whatsappDisplay}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-600" aria-hidden />
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4" aria-hidden />
              <a href={`tel:${SUPPORT_PHONE}`} className="hover:underline">
                {SUPPORT_PHONE}
              </a>
            </li>
          </ul>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-semibold">{column.title}</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.label}`}>
                  <Link href={link.href} className="muted transition hover:text-[rgb(var(--text))]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="muted mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <span aria-hidden>·</span>
            <span>Multi-tenant SaaS · Tenant-isolated data · AI used responsibly with verified business data.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

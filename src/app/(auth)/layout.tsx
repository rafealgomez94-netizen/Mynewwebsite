import Link from 'next/link';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui';
import { APP_NAME, SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '@/lib/domain';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">W</span>
            <span className="font-semibold">{APP_NAME}</span>
          </Link>
          <ThemeToggle compact />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          {children}
        </main>
        <p className="muted text-xs">
          Need help? WhatsApp {SUPPORT_WHATSAPP} · {SUPPORT_EMAIL}
        </p>
      </div>

      <aside className="relative hidden overflow-hidden border-l bg-[rgb(var(--surface-muted))] lg:flex lg:flex-col lg:justify-center lg:p-14">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative max-w-lg">
          <Badge tone="brand" className="mb-5">
            <Sparkles className="h-3 w-3" /> AI business operating system
          </Badge>
          <h2 className="text-3xl font-semibold leading-snug">Run your business smarter with AI</h2>
          <p className="muted mt-4">
            One workspace for customers, sales, appointments, inventory, marketing and business analytics — with an AI
            assistant that answers from your own data.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              { title: 'AI customer support', body: 'Instant answers from your menu, price list and policies. Hands over to a human when unsure.' },
              { title: 'Guided onboarding', body: 'Business details, hours, services, staff and documents in one wizard.' },
              { title: 'Isolated workspace', body: 'Your data stays in your tenant, protected by roles and server-side checks.' },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="muted mt-10 text-xs">
            Trusted by salons, restaurants, clinics, retail stores, service businesses and agencies.
          </p>
        </div>
      </aside>
    </div>
  );
}

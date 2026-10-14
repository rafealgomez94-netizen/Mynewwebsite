import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/session';
import { APP_NAME } from '@/lib/domain';
import { Badge } from '@/components/ui';

export const metadata: Metadata = {
  title: { default: 'Platform admin', template: `%s · ${APP_NAME} admin` },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Same guard style as the dashboard: an anonymous visitor is redirected to the
  // sign-in page with a return path instead of hitting an unhandled 401 (which
  // would surface as a 500 on a server-rendered page).
  const session = await getSessionContext();
  if (!session) redirect('/login?next=/admin');
  if (session.user.platformRole !== 'PLATFORM_ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <header className="border-b bg-[rgb(var(--surface-raised))]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-sm font-semibold text-white">
              WD
            </span>
            <div>
              <p className="text-sm font-semibold">{APP_NAME} · Platform admin</p>
              <p className="muted text-xs">
                {session.user.email} — aggregate platform data only, no customer payloads
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/admin" className="font-medium hover:underline">
              Overview
            </Link>
            <Link href="/admin/businesses" className="font-medium hover:underline">
              Businesses
            </Link>
            <Link href="/admin/activity" className="font-medium hover:underline">
              Activity
            </Link>
            <Badge tone="danger">Platform admin</Badge>
            <Link href="/dashboard" className="font-medium text-brand-600 hover:underline">
              Back to workspace
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

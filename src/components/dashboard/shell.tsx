'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  FileText,
  Gauge,
  Headphones,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Megaphone,
  Receipt,
  Search,
  ClipboardList,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge, Button, apiRequest, useToast } from '@/components/ui';
import { APP_NAME, businessTypeLabel } from '@/lib/domain';
import { cn, relativeTime } from '@/lib/utils';

export type ShellBadges = {
  notifications: number;
  conversations: number;
  tickets: number;
  lowStock: number;
  overdueTasks: number;
  aiUsed: number;
  aiLimit: number;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  level: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: typeof Gauge; badge?: keyof ShellBadges }[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Gauge },
      { href: '/dashboard/assistant', label: 'AI assistant', icon: Bot },
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/dashboard/customers', label: 'Customers', icon: Users },
      { href: '/dashboard/sales', label: 'Sales pipeline', icon: LayoutGrid },
      { href: '/dashboard/support', label: 'Support inbox', icon: Headphones, badge: 'conversations' },
      { href: '/dashboard/knowledge', label: 'Knowledge base', icon: FileText },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/appointments', label: 'Appointments', icon: CalendarCheck },
      { href: '/dashboard/tasks', label: 'Tasks', icon: ListChecks, badge: 'overdueTasks' },
      { href: '/dashboard/orders', label: 'Orders', icon: Receipt },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, badge: 'lowStock' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/dashboard/marketing', label: 'Marketing', icon: Megaphone },
      { href: '/dashboard/documents', label: 'Documents', icon: FileText },
      { href: '/dashboard/reports', label: 'Reports', icon: ClipboardList },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/dashboard/billing', label: 'Plan & billing', icon: CreditCard },
      { href: '/dashboard/team', label: 'Team & roles', icon: ShieldCheck },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function DashboardShell({
  user,
  business,
  businesses,
  badges,
  children,
}: {
  user: { name: string; email: string; platformRole: string; emailVerified: boolean };
  business: { id: string; name: string; type: string; slug: string };
  businesses: { id: string; name: string }[];
  badges: ShellBadges;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(badges.notifications);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setMobileOpen(false);
    setNotificationsOpen(false);
    setUserOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!notificationsOpen) return;
    (async () => {
      const result = await apiRequest<{ unread: number; items: NotificationItem[] }>('/api/notifications', {
        method: 'GET',
      });
      if (result.ok) {
        setNotifications(result.data.items ?? []);
        setUnread(result.data.unread ?? 0);
      }
    })();
  }, [notificationsOpen]);

  const markAllRead = async () => {
    const result = await apiRequest('/api/notifications', { body: { all: true } });
    if (result.ok) {
      setUnread(0);
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      push('All notifications marked as read', 'success');
    }
  };

  const switchBusiness = async (businessId: string) => {
    const result = await apiRequest('/api/business/switch', { body: { businessId } });
    if (result.ok) {
      push('Workspace switched', 'success');
      router.refresh();
    } else {
      push(result.error, 'danger');
    }
  };

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/dashboard/customers?search=${encodeURIComponent(query.trim())}`);
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3" aria-label="Dashboard">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="muted px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const badgeValue = item.badge ? badges[item.badge] : 0;
              return (
                <li key={item.href}>
                  <Link href={item.href} data-active={active} className="sidebar-link">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badgeValue > 0 ? (
                      <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {badgeValue}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="card-muted mt-2 p-3">
        <p className="text-xs font-semibold">AI usage this month</p>
        <p className="muted mt-1 text-xs">
          {badges.aiUsed} / {badges.aiLimit} messages
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--surface))]">
          <div
            className="h-full rounded-full bg-brand-600"
            style={{ width: `${Math.min(100, (badges.aiUsed / Math.max(badges.aiLimit, 1)) * 100)}%` }}
          />
        </div>
        <Link href="/dashboard/billing" className="mt-3 block text-xs font-semibold text-brand-600 hover:underline">
          Manage plan →
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-[rgb(var(--surface-raised))] lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">W</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{business.name}</p>
            <p className="muted truncate text-[11px]">{businessTypeLabel(business.type)}</p>
          </div>
        </div>
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-72 flex-col border-r bg-[rgb(var(--surface-raised))]">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <span className="text-sm font-semibold">{business.name}</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-[rgb(var(--surface))]/90 px-3 backdrop-blur sm:px-5">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form onSubmit={search} className="relative hidden max-w-sm flex-1 sm:block">
            <Search className="muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers…"
              aria-label="Search customers"
              className="input pl-9"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/dashboard/assistant" className="hidden sm:block">
              <Button variant="secondary" size="sm">
                <Sparkles className="h-3.5 w-3.5" /> Ask the AI
              </Button>
            </Link>

            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative rounded-lg p-2 transition hover:bg-[rgb(var(--surface-muted))]"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                aria-expanded={notificationsOpen}
              >
                <Bell className="h-4 w-4" />
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className="card absolute right-0 top-11 z-40 w-80 p-0 shadow-float">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <p className="text-sm font-semibold">Notifications</p>
                    <button onClick={markAllRead} className="text-xs font-semibold text-brand-600 hover:underline">
                      Mark all read
                    </button>
                  </div>
                  <ul className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <li className="muted p-4 text-sm">You are all caught up.</li>
                    ) : (
                      notifications.map((notification) => (
                        <li key={notification.id} className="border-b last:border-b-0">
                          <Link
                            href={notification.href ?? '/dashboard'}
                            className="block px-4 py-3 transition hover:bg-[rgb(var(--surface-muted))]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn('text-sm', !notification.readAt && 'font-semibold')}>
                                {notification.title}
                              </p>
                              {notification.level === 'CRITICAL' ? <Badge tone="danger">Urgent</Badge> : null}
                            </div>
                            {notification.body ? <p className="muted mt-0.5 text-xs">{notification.body}</p> : null}
                            <p className="muted mt-1 text-[11px]">{relativeTime(notification.createdAt)}</p>
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="hidden sm:block">
              <ThemeToggle compact />
            </div>

            <div className="relative">
              <button
                onClick={() => setUserOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl border px-2 py-1.5 transition hover:bg-[rgb(var(--surface-muted))]"
                aria-expanded={userOpen}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs font-semibold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              {userOpen ? (
                <div className="card absolute right-0 top-12 z-40 w-64 p-0 shadow-float">
                  <div className="border-b px-4 py-3">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="muted truncate text-xs">{user.email}</p>
                    {!user.emailVerified ? (
                      <Link href="/verify-email" className="mt-2 block text-xs font-semibold text-amber-600 hover:underline">
                        Verify your email address
                      </Link>
                    ) : null}
                  </div>
                  <div className="border-b px-4 py-3">
                    <p className="muted mb-2 text-xs font-semibold uppercase tracking-wide">Workspaces</p>
                    <ul className="space-y-1">
                      {businesses.map((item) => (
                        <li key={item.id}>
                          <button
                            onClick={() => switchBusiness(item.id)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-[rgb(var(--surface-muted))]',
                              item.id === business.id && 'font-semibold text-brand-600',
                            )}
                          >
                            <Building2 className="h-3.5 w-3.5" aria-hidden />
                            <span className="truncate">{item.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/onboarding"
                      className="mt-2 block text-xs font-semibold text-brand-600 hover:underline"
                    >
                      + Add another business
                    </Link>
                  </div>
                  <div className="p-2">
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-[rgb(var(--surface-muted))]"
                    >
                      <Settings className="h-4 w-4" /> Profile & settings
                    </Link>
                    {user.platformRole === 'PLATFORM_ADMIN' ? (
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-[rgb(var(--surface-muted))]"
                      >
                        <ShieldCheck className="h-4 w-4" /> Platform admin
                      </Link>
                    ) : null}
                    <Link
                      href="/logout"
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex-1 bg-[rgb(var(--surface-muted))]">
          <main id="main" className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-5 lg:px-6">
            {children}
          </main>
        </div>

        <footer className="muted border-t px-4 py-4 text-xs sm:px-6">
          {APP_NAME} · workspace {business.slug} · data isolated per tenant
        </footer>
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Bot, CalendarClock, CircleDollarSign, Users } from 'lucide-react';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { buildDashboard } from '@/lib/services/dashboard';
import { Badge, Button, Card, CardHeader, Stat, StatusBadge } from '@/components/ui';
import { LineChart, DonutChart } from '@/components/charts';
import { DataTable, InsightList, PageHeader, SimpleRow } from '@/components/dashboard/shared';
import { ManagerCard } from '@/components/manager-card';
import { businessTypeLabel, channelLabel } from '@/lib/domain';
import { formatDate, formatDateTime, formatMoney, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = requireTenant(await getSessionContext());
  const data = await buildDashboard(ctx.business.id, ctx.userId);
  const currency = ctx.business.currency;

  const stats = data.stats.slice(0, 8);
  const greeting = new Date().getUTCHours() < 12 ? 'Good morning' : new Date().getUTCHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${ctx.session.user.name.split(' ')[0]}`}
        description={`Here is what is happening at ${ctx.business.name} today. Every number below is calculated from your stored records.`}
        meta={
          <>
            <Badge tone="brand">{businessTypeLabel(ctx.business.type)}</Badge>
            <Badge tone={ctx.role === 'OWNER' ? 'success' : 'neutral'}>Signed in as {ctx.role.toLowerCase()}</Badge>
            <span className="muted text-xs">Updated {relativeTime(data.facts.generatedAt)}</span>
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/assistant">
              <Button>
                <Bot className="h-4 w-4" /> Ask the AI assistant
              </Button>
            </Link>
            <Link href="/dashboard/orders">
              <Button variant="secondary">
                <CircleDollarSign className="h-4 w-4" /> Record a sale
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Stat
            key={stat.id}
            label={stat.label}
            value={stat.value}
            change={stat.changePct}
            hint={stat.hint}
            tone={stat.tone}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Revenue · last 14 days"
            description="Calculated from paid orders recorded in this workspace."
            action={<Badge tone="info">Calculated</Badge>}
          />
          <LineChart
            data={data.charts.revenue.map((point) => ({ label: point.label, value: point.value }))}
            currency={currency}
            ariaLabel="Revenue over the last fourteen days"
          />
        </Card>

        <Card>
          <CardHeader
            title="Customer mix"
            description="Status breakdown of every customer on file."
            action={
              <Link href="/dashboard/customers" className="text-xs font-semibold text-brand-600 hover:underline">
                Open CRM
              </Link>
            }
          />
          <DonutChart data={data.charts.customerMix.map((row) => ({ label: row.label, value: row.value }))} ariaLabel="Customers by status" />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader
            title="AI recommendations"
            description="Suggestions generated from your data. These are advice, not stored facts."
            action={<Badge tone="brand">AI recommendation</Badge>}
          />
          <InsightList insights={data.recommendations.slice(0, 5)} />
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Upcoming appointments"
              description="Next 7 days"
              action={
                <Link href="/dashboard/appointments" className="text-xs font-semibold text-brand-600 hover:underline">
                  Manage
                </Link>
              }
            />
            {data.recent.appointments.length === 0 ? (
              <p className="muted text-sm">No appointments booked in the next 7 days.</p>
            ) : (
              <ul className="space-y-3">
                {data.recent.appointments.slice(0, 4).map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{appointment.title}</p>
                      <p className="muted text-xs">
                        {formatDateTime(appointment.startAt)} · {appointment.staff ?? 'unassigned'}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Support inbox"
              description="AI-handled customer conversations"
              action={
                <Link href="/dashboard/support" className="text-xs font-semibold text-brand-600 hover:underline">
                  Open inbox
                </Link>
              }
            />
            {data.recent.conversations.length === 0 ? (
              <p className="muted text-sm">
                No conversations yet. Share your support widget with customers to start collecting questions.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recent.conversations.slice(0, 4).map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href="/dashboard/support"
                      className="flex items-center justify-between gap-2 rounded-xl border p-3 transition hover:bg-[rgb(var(--surface-muted))]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{conversation.contact ?? 'Website visitor'}</p>
                        <p className="muted truncate text-xs">
                          {channelLabel(conversation.channel)} · {conversation.preview?.slice(0, 70) ?? 'no messages'}
                        </p>
                      </div>
                      <StatusBadge status={conversation.needsHuman ? 'ESCALATED' : conversation.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-0">
          <div className="p-5 pb-0">
            <CardHeader
              title="Recent orders"
              description="Latest sales recorded across every channel."
              action={
                <Link href="/dashboard/orders" className="text-xs font-semibold text-brand-600 hover:underline">
                  View all
                </Link>
              }
            />
          </div>
          <DataTable columns={['Order', 'Customer', 'Total', 'Status', 'Date']} empty="">
            {data.recent.orders.map((order) => (
              <SimpleRow
                key={order.id}
                cells={[
                  <span key="n" className="font-medium">
                    {order.number}
                  </span>,
                  order.customer ?? 'Walk-in',
                  formatMoney(order.totalCents, currency),
                  <StatusBadge key="s" status={order.status} />,
                  <span key="d" className="muted text-xs">
                    {formatDate(order.placedAt)}
                  </span>,
                ]}
              />
            ))}
          </DataTable>
          {data.recent.orders.length === 0 ? (
            <p className="muted p-5 pt-0 text-sm">
              No orders yet. Record your first sale from the Orders page and your revenue charts will start filling in.
            </p>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Tasks needing attention"
              action={
                <Link href="/dashboard/tasks" className="text-xs font-semibold text-brand-600 hover:underline">
                  All tasks
                </Link>
              }
            />
            {data.recent.tasks.length === 0 ? (
              <p className="muted text-sm">Nothing outstanding. Ask the AI assistant for suggested tasks.</p>
            ) : (
              <ul className="space-y-2">
                {data.recent.tasks.slice(0, 5).map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="muted text-xs">
                        {task.assignee ?? 'Unassigned'} {task.dueAt ? `· due ${formatDate(task.dueAt)}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={task.priority} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="AI activity"
              description="Every AI action is logged so you can audit what it did."
              action={<Badge tone="info">{data.subscription.plan.name} plan</Badge>}
            />
            {data.recent.aiRuns.length === 0 ? (
              <p className="muted text-sm">No AI activity recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recent.aiRuns.map((run) => (
                  <li key={run.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate">{run.prompt ?? 'AI request'}</p>
                      <p className="muted text-xs">
                        {run.surface.toLowerCase()} · {run.provider} · {relativeTime(run.createdAt)}
                      </p>
                    </div>
                    {run.grounded ? <Badge tone="success">grounded</Badge> : <Badge tone="warning">advisory</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Business snapshot"
            description="Plan usage and operational health for this workspace."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="muted text-xs font-semibold uppercase tracking-wide">This month</p>
              <p className="text-sm">
                Revenue <strong>{formatMoney(data.business.revenueMonthCents, currency)}</strong>
              </p>
              <p className="text-sm">
                Pipeline value <strong>{formatMoney(data.business.pipelineValueCents, currency)}</strong>
              </p>
              <p className="text-sm">
                Inventory at cost <strong>{formatMoney(data.business.inventoryValueCents, currency)}</strong>
              </p>
            </div>
            <div className="space-y-2">
              <p className="muted text-xs font-semibold uppercase tracking-wide">Needs attention</p>
              <p className="text-sm">
                Low stock items <strong>{data.business.lowStockCount}</strong>
              </p>
              <p className="text-sm">
                Open conversations <strong>{data.business.openConversations}</strong>
              </p>
              <p className="text-sm">
                Open support tickets <strong>{data.business.openTickets}</strong>
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/dashboard/knowledge">
              <Button variant="secondary" size="sm">
                Train your AI
              </Button>
            </Link>
            <Link href="/dashboard/marketing">
              <Button variant="secondary" size="sm">
                Generate marketing
              </Button>
            </Link>
            <Link href="/dashboard/reports">
              <Button variant="secondary" size="sm">
                <CalendarClock className="h-3.5 w-3.5" /> Create report
              </Button>
            </Link>
            <Link href="/dashboard/analytics">
              <Button variant="secondary" size="sm">
                <Users className="h-3.5 w-3.5" /> Advanced analytics
              </Button>
            </Link>
          </div>
        </Card>

        <div className="space-y-5">
          <ManagerCard variant="compact" />
          <Card>
            <CardHeader title="Notifications" description={`${data.notifications.unread} unread`} />
            {data.notifications.items.length === 0 ? (
              <p className="muted text-sm">No notifications yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.notifications.items.slice(0, 5).map((notification) => (
                  <li key={notification.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className={notification.readAt ? 'truncate' : 'truncate font-semibold'}>{notification.title}</p>
                      {notification.level === 'CRITICAL' ? <Badge tone="danger">Urgent</Badge> : null}
                    </div>
                    <p className="muted mt-0.5 text-xs">{notification.body}</p>
                    <p className="muted mt-1 text-[11px]">{relativeTime(notification.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dashboard/reports" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
              Schedule a daily, weekly or monthly report <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { countUsers, listAllBusinesses, listPlatformAuditLogs } from '@/lib/db/repositories/accounts';
import {
  listContactMessages,
  platformBusinessUsage,
  platformMetrics,
  platformSupportTickets,
  platformUsageTotals,
  subscriptionStats,
} from '@/lib/db/repositories/platform';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Badge, Card, CardHeader, Stat, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const METRIC_LABELS: Record<string, string> = {
  AI_MESSAGES: 'AI messages',
  DOCUMENTS: 'Documents generated',
  CUSTOMERS: 'Customers created',
  STORAGE_BYTES: 'Storage used',
  SUPPORT_MESSAGES: 'Support messages',
  WHATSAPP_MESSAGES: 'WhatsApp messages',
};

export default async function AdminOverviewPage() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const metrics = platformMetrics(since);
  const businesses = listAllBusinesses(200);
  const usage = platformBusinessUsage(50);
  const tickets = platformSupportTickets(50);
  const contactMessages = listContactMessages(30);
  const audits = listPlatformAuditLogs(50);
  const usageTotals = platformUsageTotals(since);
  const subscriptions = subscriptionStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <p className="muted mt-1 text-sm">
          Aggregate SaaS performance for the last 30 days. Tenant customer data, conversations and documents are never
          exposed here — only counts, plans and platform-level activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Businesses" value={formatNumber(metrics.businesses)} hint={`${metrics.newBusinesses} new in 30 days`} />
        <Stat label="Users" value={formatNumber(countUsers())} hint={`${metrics.newUsers} new in 30 days`} />
        <Stat label="MRR" value={formatMoney(metrics.mrrCents)} hint="Active + trialing subscriptions" tone="positive" />
        <Stat label="Revenue processed" value={formatMoney(metrics.revenueCents)} hint={`${formatNumber(metrics.orders)} orders`} />
        <Stat label="Customers on platform" value={formatNumber(metrics.customers)} />
        <Stat label="AI runs (30d)" value={formatNumber(metrics.aiRunsPeriod)} hint={`${formatNumber(metrics.tokens)} tokens all time`} />
        <Stat label="Open tickets" value={formatNumber(metrics.openTickets)} hint={`${formatNumber(metrics.tickets)} total`} tone={metrics.openTickets > 0 ? 'warning' : 'positive'} />
        <Stat label="Conversations" value={formatNumber(metrics.conversations)} hint="Across all tenants" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Businesses</h2>
              <p className="muted text-xs">{businesses.length} workspaces · newest first</p>
            </div>
            <Badge tone="info">Tenant isolation enforced</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b">
                  {['Business', 'Type', 'Owner', 'Plan', 'Status', 'Created'].map((column) => (
                    <th key={column} className="table-head px-4 py-2">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr key={business.id} className="table-row border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{business.name}</td>
                    <td className="px-4 py-3">{business.type}</td>
                    <td className="px-4 py-3">
                      <p>{business.owner_name}</p>
                      <p className="muted text-xs">{business.owner_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="brand">{business.plan_code ?? 'FREE'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={business.subscription_status ?? 'TRIALING'} />
                    </td>
                    <td className="muted px-4 py-3 text-xs">{formatDate(business.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Subscriptions" description="Plan distribution across all workspaces." />
            <ul className="space-y-2 text-sm">
              {subscriptions.map((row) => (
                <li key={`${row.plan_code}-${row.status}`} className="flex items-center justify-between gap-2">
                  <span>
                    <Badge tone="brand">{row.plan_code}</Badge> <span className="muted text-xs">{row.status}</span>
                  </span>
                  <span className="font-medium">{row.c}</span>
                </li>
              ))}
              {subscriptions.length === 0 ? <li className="muted">No subscriptions yet.</li> : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Usage (30 days)" description="Metered tenant activity." />
            <ul className="space-y-2 text-sm">
              {usageTotals.map((row) => (
                <li key={row.metric} className="flex items-center justify-between gap-2">
                  <span>{METRIC_LABELS[row.metric] ?? row.metric}</span>
                  <span className="font-medium">
                    {row.metric === 'STORAGE_BYTES'
                      ? `${(row.total / 1024 / 1024).toFixed(2)} MB`
                      : formatNumber(row.total)}
                  </span>
                </li>
              ))}
              {usageTotals.length === 0 ? <li className="muted">No usage recorded yet.</li> : null}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Support tickets (all tenants)</h2>
            <p className="muted text-xs">AI escalations and manually raised requests.</p>
          </div>
          {tickets.length === 0 ? (
            <p className="muted p-5 text-sm">No support tickets yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {tickets.slice(0, 12).map((ticket) => (
                <li key={ticket.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{ticket.subject}</p>
                    <StatusBadge status={ticket.status} />
                    {ticket.escalated_from_ai ? <Badge tone="danger">AI escalation</Badge> : null}
                  </div>
                  <p className="muted mt-1 text-xs">
                    {ticket.business_name ? `${ticket.business_name} · ` : ''}
                    {ticket.contact_name ?? 'unknown contact'} · {formatDate(ticket.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Demo & contact requests</h2>
            <p className="muted text-xs">Submitted from the marketing site.</p>
          </div>
          {contactMessages.length === 0 ? (
            <p className="muted p-5 text-sm">No requests yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {contactMessages.slice(0, 12).map((message) => (
                <li key={message.id} className="px-5 py-3">
                  <p className="font-medium">
                    {message.name} {message.company ? `· ${message.company}` : ''}
                  </p>
                  <p className="muted mt-1 text-xs">
                    {message.email} · {message.topic} · {formatDate(message.created_at)}
                  </p>
                  <p className="muted mt-1 text-sm">{message.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Highest usage workspaces</h2>
            <p className="muted text-xs">AI runs, customers and storage per tenant.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b">
                  {['Business', 'Plan', 'Users', 'Customers', 'AI runs', 'Storage'].map((column) => (
                    <th key={column} className="table-head px-4 py-2">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usage.slice(0, 10).map((row) => (
                  <tr key={row.id} className="table-row border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3">{row.plan_code ?? 'FREE'}</td>
                    <td className="px-4 py-3">{row.users}</td>
                    <td className="px-4 py-3">{row.customers}</td>
                    <td className="px-4 py-3">{row.ai_runs}</td>
                    <td className="px-4 py-3">{(row.storage_bytes / 1024 / 1024).toFixed(2)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">System activity</h2>
            <p className="muted text-xs">Privileged actions across the platform.</p>
          </div>
          <ul className="divide-y text-sm">
            {audits.slice(0, 12).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium">{entry.action}</p>
                  <p className="muted text-xs">
                    {entry.actor_email ?? 'system'}
                    {entry.business_id ? ` · ${entry.business_id.slice(-6)}` : ''}
                  </p>
                </div>
                <span className="muted text-xs">{formatDate(entry.created_at)}</span>
              </li>
            ))}
            {audits.length === 0 ? <li className="muted px-5 py-4">No audit entries yet.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}

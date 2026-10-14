import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { buildFactPack } from '@/lib/ai/facts';
import { analyticsSeries, calculatedStats, recommendations } from '@/lib/ai/analytics';
import { aiUsage } from '@/lib/db/repositories/knowledge';
import { LineChart, DonutChart } from '@/components/charts';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge, Card, CardHeader, Stat } from '@/components/ui';
import { formatMoney, formatNumber, formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const ctx = requireTenant(await getSessionContext());
  const facts = buildFactPack(ctx.business.id);
  const series = analyticsSeries(facts);
  const stats = calculatedStats(facts);
  const ai = aiUsage(ctx.business.id, new Date(Date.now() - 30 * 86400000).toISOString());
  const currency = ctx.business.currency;

  return (
    <div>
      <PageHeader
        title="AI analytics"
        description="Revenue trends, customer growth, product performance, retention and lead conversion — calculated from your stored data, with AI recommendations clearly separated."
        meta={
          <>
            <Badge tone="success">Calculated statistics</Badge>
            <Badge tone="brand">AI recommendations labelled</Badge>
            <Badge tone="info">Generated {facts.generatedAt.slice(11, 16)} UTC</Badge>
          </>
        }
        action={
          <Link href="/dashboard/reports" className="text-sm font-semibold text-brand-600 hover:underline">
            Generate a report →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.slice(0, 4).map((stat) => (
          <Stat
            key={stat.id}
            label={stat.label}
            value={stat.value}
            change={stat.changePct ?? undefined}
            hint={stat.hint}
            tone={stat.tone === 'positive' ? 'positive' : stat.tone === 'warning' ? 'warning' : undefined}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Revenue trend (14 days)"
            description="Daily revenue calculated from stored orders."
            action={<Badge tone="success">Calculated</Badge>}
          />
          <LineChart
            data={series.daily.map((row) => ({ label: row.label, value: row.revenueCents }))}
            currency={currency}
            ariaLabel="Daily revenue for the last 14 days"
          />
          <div className="muted mt-3 grid gap-2 text-xs sm:grid-cols-4">
            <p>Week: {formatMoney(facts.revenue.weekCents, currency)}</p>
            <p>Month: {formatMoney(facts.revenue.monthCents, currency)}</p>
            <p>Week change: {formatPercent(facts.revenue.weekChangePct)}</p>
            <p>Month change: {formatPercent(facts.revenue.monthChangePct)}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Customer mix" description="Status distribution of your customer base." />
          <DonutChart
            data={series.customerMix.map((row) => ({ label: row.status, value: row.count }))}
            ariaLabel="Customers by status"
          />
          <div className="muted mt-3 space-y-1 text-xs">
            <p>Total customers: {formatNumber(facts.customers.total)}</p>
            <p>New this week: {formatNumber(facts.customers.newThisWeek)}</p>
            <p>New this month: {formatNumber(facts.customers.newThisMonth)}</p>
            <p>Need follow-up: {formatNumber(facts.customers.followUp.length)}</p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Product performance" description="Best sellers and slow movers from real sales." />
          <ul className="divide-y text-sm">
            {series.topItems.slice(0, 5).map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate">{item.name}</span>
                <span className="muted text-xs">
                  {item.units} sold · {formatMoney(item.revenueCents, currency)}
                </span>
              </li>
            ))}
            {series.topItems.length === 0 ? <li className="muted py-2 text-sm">No sales recorded yet.</li> : null}
          </ul>
          {facts.inventory.slowMoving.length ? (
            <p className="muted mt-3 text-xs">
              Slow movers: {facts.inventory.slowMoving.slice(0, 3).map((item) => item.name).join(', ')}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Lead conversion" description="Pipeline value and win rate." />
          <ul className="divide-y text-sm">
            {facts.leads.byStage.map((stage) => (
              <li key={stage.stage} className="flex items-center justify-between gap-2 py-2">
                <span>{stage.stage}</span>
                <span className="muted text-xs">
                  {stage.count} · {formatMoney(stage.valueCents, currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="muted mt-3 space-y-1 text-xs">
            <p>Win rate: {formatPercent(facts.leads.conversionRatePct)}</p>
            <p>Open leads: {facts.leads.open}</p>
            <p>Won / lost: {facts.leads.won} / {facts.leads.lost}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Operations" description="Appointments, tasks and support load." />
          <div className="muted space-y-1 text-sm">
            <p>Appointments last 7 days: {facts.appointments.last7Days}</p>
            <p>Completed: {facts.appointments.completedLast7Days}</p>
            <p>Cancelled / no-show: {facts.appointments.cancelledLast7Days}</p>
            <p>Upcoming (next 7 days): {facts.appointments.next7Days}</p>
            <p>Open conversations: {facts.support.openConversations}</p>
            <p>Open tickets: {facts.support.openTickets}</p>
            <p>
              Tasks: {facts.tasks.byStatus.map((row) => `${row.status} ${row.c}`).join(', ') || 'none'} ·{' '}
              {facts.tasks.overdue} overdue
            </p>
            <p>
              Knowledge: {facts.knowledge.sources} sources, {facts.knowledge.chunks} chunks, {facts.knowledge.faqs} FAQs
            </p>
            <p>
              AI runs (30 days): {formatNumber(ai.runs)} · {formatNumber(ai.tokens)} tokens · avg{' '}
              {Math.round(ai.avg_latency)} ms
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="AI recommendations"
            description="Suggestions generated from the statistics above — never presented as confirmed data."
            action={<Badge tone="brand">AI recommendation</Badge>}
          />
          <ul className="space-y-3">
            {recommendations(facts).slice(0, 6).map((insight) => (
              <li key={insight.id} className="rounded-xl border p-3">
                <p className="text-sm font-semibold">{insight.title}</p>
                <p className="muted mt-1 text-sm">{insight.detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Customer issues reported"
            description="Recurring topics derived from support tickets and escalations."
          />
          {facts.support.frequentTopics.length === 0 ? (
            <p className="muted text-sm">
              No recurring issues detected yet. Escalated AI conversations and support tickets feed this list.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {facts.support.frequentTopics.map((topic) => (
                <li key={topic.topic} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">{topic.topic}</span>
                  <span className="muted text-xs">{topic.count} mentions</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted mt-4 text-xs">
            Every figure on this page is computed from stored business records. AI text is always labelled as a
            recommendation and never mixed into the statistics.
          </p>
        </Card>
      </div>
    </div>
  );
}

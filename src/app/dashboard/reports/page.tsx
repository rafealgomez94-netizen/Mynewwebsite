import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { buildFactPack } from '@/lib/ai/facts';
import { analyticsSeries, calculatedStats, recommendations } from '@/lib/ai/analytics';
import { buildReportMetrics } from '@/lib/services/reports';
import { listReports } from '@/lib/db/repositories/ops';
import { formatMoney, formatNumber } from '@/lib/utils';
import { ReportsWorkspace } from '@/components/dashboard/reports-workspace';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Reports & analytics' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const ctx = requireTenant(await getSessionContext());
  const facts = buildFactPack(ctx.business.id);
  const currency = ctx.business.currency;

  const metricsByPeriod = {
    DAILY: buildReportMetrics(ctx.business.id, 'DAILY'),
    WEEKLY: buildReportMetrics(ctx.business.id, 'WEEKLY'),
    MONTHLY: buildReportMetrics(ctx.business.id, 'MONTHLY'),
  };

  const summarise = (metrics: (typeof metricsByPeriod)['WEEKLY']) => [
    { label: 'Revenue', value: formatMoney(metrics.revenueCents, currency) },
    { label: 'Orders', value: String(metrics.orders) },
    { label: 'Average order', value: formatMoney(metrics.averageOrderCents, currency) },
    { label: 'New customers', value: String(metrics.newCustomers) },
    { label: 'Appointments', value: `${metrics.appointments.total} (${metrics.appointments.completed} completed)` },
    { label: 'Low stock', value: String(metrics.lowStock.length) },
    { label: 'Open tickets', value: String(metrics.support.openTickets) },
    { label: 'Revenue change', value: `${metrics.revenueChangePct.toFixed(1)}%` },
  ];

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        description="Revenue trends, customer growth, lead conversion, retention and operational problems — all calculated from stored data, with AI recommendations kept clearly separate."
        meta={
          <>
            <Badge tone="success">Statistics: calculated</Badge>
            <Badge tone="brand">Recommendations: AI</Badge>
          </>
        }
      />
      <ReportsWorkspace
        series={analyticsSeries(facts)}
        stats={calculatedStats(facts)}
        metricsByPeriod={{
          DAILY: summarise(metricsByPeriod.DAILY),
          WEEKLY: summarise(metricsByPeriod.WEEKLY),
          MONTHLY: summarise(metricsByPeriod.MONTHLY),
        }}
        recommendations={recommendations(facts).map((insight) => ({
          id: insight.id,
          severity: insight.severity,
          title: insight.title,
          detail: insight.detail,
        }))}
        initialReports={listReports(ctx.business.id, 30).map((report) => ({
          id: report.id,
          period: report.period,
          title: report.title,
          summary: report.summary,
          summary_source: report.summary_source,
          created_at: report.created_at,
          metrics_json: report.metrics_json,
        }))}
        currency={currency}
        businessName={ctx.business.name}
      />
      <p className="muted mt-4 text-xs">
        Lifetime revenue in view: {formatMoney(facts.revenue.monthCents, currency)} this month ·{' '}
        {formatNumber(facts.customers.total)} customers on file
      </p>
    </div>
  );
}

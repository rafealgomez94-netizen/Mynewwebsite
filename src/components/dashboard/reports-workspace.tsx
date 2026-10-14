'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileBarChart, Printer, RefreshCw, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Field, Select, StatusBadge, Tabs, apiRequest, useToast } from '@/components/ui';
import { LineChart, DonutChart } from '@/components/charts';
import { formatDate, formatMoney } from '@/lib/utils';
import { REPORT_PERIODS } from '@/lib/domain';

type Series = {
  daily: { label: string; revenueCents: number; orders: number }[];
  channels: { channel: string; revenueCents: number; orders: number }[];
  topItems: { name: string; units: number; revenueCents: number }[];
  pipeline: { stage: string; count: number; valueCents: number }[];
  customerMix: { status: string; count: number }[];
  stockRisk: { name: string; quantity: number; minStock: number }[];
  slowMovers: { name: string; unitsSold: number }[];
};

type Stat = { label: string; value: string; changePct?: number | null; tone?: string; detail?: string };

type ReportRow = {
  id: string;
  period: string;
  title: string;
  summary: string | null;
  summary_source: string | null;
  created_at: string;
  metrics_json: string | null;
};

export function ReportsWorkspace({
  series,
  stats,
  metricsByPeriod,
  recommendations,
  initialReports,
  currency,
  businessName,
}: {
  series: Series;
  stats: Stat[];
  metricsByPeriod: Record<string, { label: string; value: string }[]>;
  recommendations: { id: string; severity: string; title: string; detail: string }[];
  initialReports: ReportRow[];
  currency: string;
  businessName: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState('analytics');
  const [period, setPeriod] = useState('WEEKLY');
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ReportRow | null>(null);

  const refresh = async () => {
    const result = await apiRequest<{ reports: ReportRow[] }>('/api/reports', { method: 'GET' });
    if (result.ok) setReports(result.data.reports ?? []);
    router.refresh();
  };

  const generate = async () => {
    setBusy(true);
    const result = await apiRequest<{ report: ReportRow }>('/api/reports', {
      body: { period, withAiSummary: true },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Report generated', 'success');
    await refresh();
    setOpen(result.data.report);
    setTab('saved');
  };

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'analytics', label: 'Live analytics' },
          { id: 'saved', label: 'Saved reports', count: reports.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'analytics' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.slice(0, 8).map((stat) => (
              <Card key={stat.label}>
                <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold">{stat.value}</p>
                {stat.changePct !== undefined && stat.changePct !== null ? (
                  <p className={`mt-1 text-xs ${stat.changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {stat.changePct >= 0 ? '▲' : '▼'} {Math.abs(stat.changePct).toFixed(1)}% vs previous period
                  </p>
                ) : stat.detail ? (
                  <p className="muted mt-1 text-xs">{stat.detail}</p>
                ) : null}
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title={`Revenue trend — ${businessName}`}
              description="Calculated directly from your stored orders. Nothing here is estimated by AI."
              action={<Badge tone="success">Calculated</Badge>}
            />
            <LineChart
              data={series.daily.map((row) => ({ label: row.label, value: row.revenueCents }))}
              currency={currency}
              ariaLabel="Revenue over the last 30 days"
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Customer mix by status" description="Where your customer base sits today." />
              <DonutChart
                data={series.customerMix.map((row) => ({ label: row.status, value: row.count }))}
                ariaLabel="Customers by status"
              />
            </Card>
            <Card>
              <CardHeader title="Sales by channel" description="Revenue captured per sales channel." />
              {series.channels.length === 0 ? (
                <p className="muted text-sm">No orders recorded yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {series.channels.map((channel) => (
                    <li key={channel.channel} className="flex items-center justify-between py-2">
                      <span>{channel.channel.replace('_', ' ').toLowerCase()}</span>
                      <span className="muted text-xs">
                        {channel.orders} orders · {formatMoney(channel.revenueCents, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Best sellers" description="By revenue in the selected window." />
              {series.topItems.length === 0 ? (
                <p className="muted text-sm">No sales yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {series.topItems.slice(0, 6).map((item) => (
                    <li key={item.name} className="flex items-center justify-between py-2">
                      <span className="truncate">{item.name}</span>
                      <span className="muted text-xs">
                        {item.units} sold · {formatMoney(item.revenueCents, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Lead pipeline" description="Open and closed pipeline value." />
              <ul className="divide-y text-sm">
                {series.pipeline.map((stage) => (
                  <li key={stage.stage} className="flex items-center justify-between py-2">
                    <StatusBadge status={stage.stage} />
                    <span className="muted text-xs">
                      {stage.count} · {formatMoney(stage.valueCents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Stock & slow movers" description="Operational risks detected from inventory data." />
              {series.stockRisk.length === 0 ? (
                <p className="muted text-sm">Stock levels healthy.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {series.stockRisk.slice(0, 5).map((item) => (
                    <li key={item.name} className="flex items-center justify-between py-2">
                      <span className="truncate">{item.name}</span>
                      <span className="muted text-xs">
                        {item.quantity} left (min {item.minStock})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {series.slowMovers.length ? (
                <p className="muted mt-3 text-xs">
                  Not moving: {series.slowMovers.slice(0, 3).map((item) => item.name).join(', ')}
                </p>
              ) : null}
            </Card>
          </div>

          <Card>
            <CardHeader
              title="AI recommendations"
              description="Clearly separated from the calculated statistics above — these are suggestions, not confirmed facts."
              action={<Badge tone="brand">AI recommendation</Badge>}
            />
            <ul className="space-y-3">
              {recommendations.map((insight) => (
                <li key={insight.id} className="rounded-xl border p-3">
                  <p className="text-sm font-semibold">{insight.title}</p>
                  <p className="muted mt-1 text-sm">{insight.detail}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Generate a saved report" description="Daily, weekly or monthly — with an AI-written executive summary on top of the calculated numbers." />
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Report period" className="w-52">
                <Select value={period} onChange={(event) => setPeriod(event.target.value)}>
                  {REPORT_PERIODS.map((value) => (
                    <option key={value} value={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button onClick={generate} loading={busy}>
                <Sparkles className="h-4 w-4" /> Generate report
              </Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(metricsByPeriod[period] ?? []).map((metric) => (
                <div key={metric.label} className="rounded-xl border p-3">
                  <p className="muted text-xs">{metric.label}</p>
                  <p className="text-sm font-semibold">{metric.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {tab === 'saved' ? (
        <div className="space-y-3">
          <Alert tone="info" title="Source labelling">
            Every saved report records whether its summary came from the AI or was calculated from data, so you always
            know what you are reading.
          </Alert>
          {reports.length === 0 ? (
            <Card>
              <p className="muted text-sm">No saved reports yet.</p>
            </Card>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b">
                      {['Report', 'Period', 'Summary source', 'Generated', ''].map((column) => (
                        <th key={column} className="table-head px-4 py-2">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.id} className="table-row border-b last:border-b-0">
                        <td className="px-4 py-3 font-medium">{report.title}</td>
                        <td className="px-4 py-3">
                          <Badge tone="neutral">{report.period}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={report.summary_source === 'AI' ? 'brand' : 'success'}>
                            {report.summary_source === 'AI' ? 'AI summary' : 'Calculated'}
                          </Badge>
                        </td>
                        <td className="muted px-4 py-3 text-xs">{formatDate(report.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setOpen(report)} aria-label="Open report">
                              <FileBarChart className="h-3.5 w-3.5" />
                            </Button>
                            <a href={`/api/reports/pdf?id=${report.id}`} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="ghost" aria-label="Download PDF">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {open ? (
            <Card>
              <CardHeader
                title={open.title}
                description={`Generated ${formatDate(open.created_at)} · ${open.period.toLowerCase()} report`}
                action={
                  <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                    Close
                  </Button>
                }
              />
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border p-4 text-xs leading-relaxed">
                {open.summary ?? 'No summary stored.'}
              </pre>
              <div className="mt-3 flex gap-2">
                <a href={`/api/reports/pdf?id=${open.id}`} target="_blank" rel="noopener noreferrer">
                  <Button>
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                </a>
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button variant="ghost" onClick={refresh}>
                  <RefreshCw className="h-4 w-4" /> Refresh list
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

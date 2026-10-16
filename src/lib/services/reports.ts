import { buildFactPack } from '@/lib/ai/facts';
import { calculatedStats, periodRange, reportTitle } from '@/lib/ai/analytics';
import { createReport } from '@/lib/db/repositories/ops';
import { topSellingItems, revenueSummary, listOrders } from '@/lib/db/repositories/catalog';
import { listAppointments, taskCounts } from '@/lib/db/repositories/ops';
import { listTickets, conversationCounts } from '@/lib/db/repositories/comms';
import { countCustomers, customerStatusCounts, leadStageSummary } from '@/lib/db/repositories/crm';
import { lowStockProducts } from '@/lib/db/repositories/catalog';
import { recommendations } from '@/lib/ai/analytics';
import { formatMoney, formatNumber } from '@/lib/utils';
import type { ReportPeriod } from '@/lib/domain';
import { findBusinessById } from '@/lib/db/repositories/accounts';
import { callLlm, aiConfigured, AI_SYSTEM_GUARDRAIL, type ChatMessage } from '@/lib/ai/provider';
import { renderFactPack } from '@/lib/ai/facts';

export type ReportMetrics = {
  period: ReportPeriod;
  /** ISO code of the workspace currency — every money figure below is printed in it. */
  currency: string;
  periodStart: string;
  periodEnd: string;
  revenueCents: number;
  revenueChangePct: number;
  orders: number;
  averageOrderCents: number;
  newCustomers: number;
  totalCustomers: number;
  customerStatusMix: { status: string; count: number }[];
  appointments: { total: number; completed: number; cancelled: number; upcoming: number };
  leads: { stage: string; count: number; valueCents: number }[];
  topItems: { name: string; units: number; revenueCents: number }[];
  lowStock: { name: string; quantity: number; minStock: number }[];
  tasks: { status: string; count: number }[];
  support: { openConversations: number; openTickets: number };
  calculated: { label: string; value: string }[];
  recommendations: string[];
};

export function buildReportMetrics(businessId: string, period: ReportPeriod): ReportMetrics {
  const { startIso, endIso, start, end } = periodRange(period);
  const currency = findBusinessById(businessId)?.currency ?? 'USD';
  const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime())).toISOString();

  const current = revenueSummary(businessId, startIso, endIso);
  const previous = revenueSummary(businessId, previousStart, startIso);
  const facts = buildFactPack(businessId);
  const newCustomers = countCustomers(businessId, startIso);
  const appointments = listAppointments(businessId, { fromIso: startIso, toIso: endIso, limit: 500 });

  return {
    period,
    currency,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    revenueCents: current.revenue,
    revenueChangePct: previous.revenue ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : current.revenue > 0 ? 100 : 0,
    orders: current.orders,
    averageOrderCents: Math.round(current.avg),
    newCustomers,
    totalCustomers: countCustomers(businessId),
    customerStatusMix: customerStatusCounts(businessId).map((row) => ({ status: row.status, count: row.c })),
    appointments: {
      total: appointments.length,
      completed: appointments.filter((appointment) => appointment.status === 'COMPLETED').length,
      cancelled: appointments.filter((appointment) => ['CANCELLED', 'NO_SHOW'].includes(appointment.status)).length,
      upcoming: appointments.filter((appointment) => new Date(appointment.start_at).getTime() > Date.now()).length,
    },
    leads: leadStageSummary(businessId).map((row) => ({ stage: row.stage, count: row.c, valueCents: row.value })),
    topItems: topSellingItems(businessId, startIso, 8).map((item) => ({
      name: item.name,
      units: item.units,
      revenueCents: item.revenue,
    })),
    lowStock: lowStockProducts(businessId, 8).map((product) => ({
      name: product.name,
      quantity: product.quantity,
      minStock: product.minStock,
    })),
    tasks: taskCounts(businessId).map((row) => ({ status: row.status, count: row.c })),
    support: {
      openConversations: conversationCounts(businessId)
        .filter((row) => ['OPEN', 'PENDING', 'ESCALATED'].includes(row.status))
        .reduce((sum, row) => sum + row.c, 0),
      openTickets: listTickets(businessId, { status: 'OPEN' }).length,
    },
    calculated: calculatedStats(facts).map((stat) => ({ label: stat.label, value: stat.value })),
    recommendations: recommendations(facts).map((insight) => `${insight.title} — ${insight.detail}`),
  };
}

export function metricsToText(metrics: ReportMetrics, businessName: string): string {
  const lines = [
    `${businessName} — ${metrics.period} report`,
    `Period: ${metrics.periodStart.slice(0, 10)} → ${metrics.periodEnd.slice(0, 10)}`,
    '',
    'CALCULATED FROM STORED DATA',
    `Revenue: ${formatMoney(metrics.revenueCents, metrics.currency)} (${metrics.revenueChangePct >= 0 ? '+' : ''}${metrics.revenueChangePct.toFixed(1)}% vs previous period)`,
    `Orders: ${metrics.orders} · Average order ${formatMoney(metrics.averageOrderCents, metrics.currency)}`,
    `New customers: ${metrics.newCustomers} (total ${metrics.totalCustomers})`,
    `Appointments: ${metrics.appointments.total} total, ${metrics.appointments.completed} completed, ${metrics.appointments.cancelled} cancelled/no-show, ${metrics.appointments.upcoming} upcoming`,
    `Open conversations: ${metrics.support.openConversations} · Open tickets: ${metrics.support.openTickets}`,
    '',
    'TOP ITEMS',
    ...(metrics.topItems.length
      ? metrics.topItems.map((item) => `- ${item.name}: ${item.units} units, ${formatMoney(item.revenueCents, metrics.currency)}`)
      : ['- No sales recorded in this period']),
    '',
    'PIPELINE',
    ...(metrics.leads.length ? metrics.leads.map((lead) => `- ${lead.stage}: ${lead.count} (${formatMoney(lead.valueCents, metrics.currency)})`) : ['- No leads recorded']),
    '',
    'LOW STOCK',
    ...(metrics.lowStock.length ? metrics.lowStock.map((product) => `- ${product.name}: ${product.quantity} left (min ${product.minStock})`) : ['- No low stock items']),
  ];
  return lines.join('\n');
}

export async function createReportForPeriod(input: {
  businessId: string;
  userId?: string | null;
  period: ReportPeriod;
  withAiSummary: boolean;
}): Promise<{ reportId: string; metrics: ReportMetrics; summary: string | null; summarySource: 'AI' | 'CALCULATED' }> {
  const business = findBusinessById(input.businessId);
  if (!business) throw new Error('Business not found');
  const metrics = buildReportMetrics(input.businessId, input.period);
  let summary: string | null = null;
  let summarySource: 'AI' | 'CALCULATED' = 'CALCULATED';

  if (input.withAiSummary && aiConfigured()) {
    try {
      const facts = buildFactPack(input.businessId);
      const messages: ChatMessage[] = [
        { role: 'system', content: AI_SYSTEM_GUARDRAIL },
        {
          role: 'system',
          content: 'Write a management summary (max 160 words) with a short performance read and 3 prioritised actions. Label factual claims with [Verified data] and advice with [AI recommendation].',
        },
        {
          role: 'user',
          content: `${renderFactPack(facts)}\n\nPATTERN: ${input.period}`,
        },
      ];
      const result = await callLlm(messages, { temperature: 0.35 });
      if (result.text) {
        summary = result.text;
        summarySource = 'AI';
      }
    } catch (error) {
      console.warn('[reports] AI summary unavailable:', error instanceof Error ? error.message : error);
    }
  }

  if (!summary) {
    const stats = metrics.calculated.slice(0, 4).map((stat) => `${stat.label}: ${stat.value}`).join(' · ');
    summary = `Calculated summary: ${stats}. AI recommendations: ${metrics.recommendations
      .slice(0, 3)
      .map((item) => item.split(' — ')[0])
      .join('; ')}.`;
  }

  const reportId = createReport({
    businessId: input.businessId,
    period: input.period,
    periodStart: metrics.periodStart,
    periodEnd: metrics.periodEnd,
    title: reportTitle(input.period, business.name, new Date(metrics.periodEnd)),
    metrics,
    aiSummary: summary,
    createdById: input.userId ?? null,
  });

  return { reportId, metrics, summary, summarySource };
}

export async function recentOrdersForReport(businessId: string, period: ReportPeriod) {
  const { startIso, endIso } = periodRange(period);
  return listOrders(businessId, { sinceIso: startIso, untilIso: endIso, limit: 30 });
}

export function dashboardHeadline(metrics: ReportMetrics): string {
  return `${formatNumber(metrics.orders)} orders · ${formatMoney(metrics.revenueCents, metrics.currency)} revenue · ${metrics.newCustomers} new customers`;
}

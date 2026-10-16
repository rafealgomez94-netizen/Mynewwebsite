/**
 * Deterministic analytics engine.
 *
 * Produces two clearly separated streams:
 *  1. CALCULATED statistics (straight from stored rows)
 *  2. AI recommendations (rule-based suggestions, explicitly labelled)
 * This module works with or without an LLM key — the platform never depends on
 * a third-party model to show the owner what is happening in their business.
 */
import { formatMoney, formatNumber, percentChange } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import type { BusinessFactPack } from '@/lib/ai/facts';

export type InsightSeverity = 'positive' | 'info' | 'warning' | 'critical';

export type Insight = {
  id: string;
  kind: 'CALCULATED' | 'AI_RECOMMENDATION';
  severity: InsightSeverity;
  title: string;
  detail: string;
  action?: { label: string; href?: string; taskTitle?: string };
};

export type CalculatedStat = {
  id: string;
  label: string;
  value: string;
  changePct?: number;
  hint?: string;
  tone?: InsightSeverity;
};

export function calculatedStats(facts: BusinessFactPack): CalculatedStat[] {
  const stats: CalculatedStat[] = [
    {
      id: 'revenue_week',
      label: 'Revenue · last 7 days',
      value: formatMoney(facts.revenue.weekCents, facts.currency),
      changePct: facts.revenue.weekChangePct,
      hint: `${formatNumber(facts.revenue.weekOrders)} orders`,
    },
    {
      id: 'revenue_month',
      label: 'Revenue · last 30 days',
      value: formatMoney(facts.revenue.monthCents, facts.currency),
      changePct: facts.revenue.monthChangePct,
      hint: `Average order ${formatMoney(facts.revenue.monthAverageCents, facts.currency)}`,
    },
    {
      id: 'customers_new',
      label: 'New customers · 7 days',
      value: formatNumber(facts.customers.newThisWeek),
      hint: `${formatNumber(facts.customers.total)} customers in total`,
    },
    {
      id: 'appointments_next',
      label: 'Upcoming appointments · 7 days',
      value: formatNumber(facts.appointments.next7Days),
      hint: `${formatNumber(facts.appointments.last7Days)} in the previous week`,
    },
    {
      id: 'lead_conversion',
      label: 'Lead win rate',
      value: `${facts.leads.conversionRatePct.toFixed(1)}%`,
      hint: `${formatNumber(facts.leads.open)} leads still open`,
    },
    {
      id: 'inventory_risk',
      label: 'Products at/below minimum',
      value: formatNumber(facts.inventory.lowStockCount),
      hint: `Stock value ${formatMoney(facts.inventory.trackableValueCents, facts.currency)} at cost`,
      tone: facts.inventory.lowStockCount > 0 ? 'warning' : 'positive',
    },
    {
      id: 'support_load',
      label: 'Open customer conversations',
      value: formatNumber(facts.support.openConversations),
      hint: `${formatNumber(facts.support.openTickets)} support tickets open`,
      tone: facts.support.openTickets > 0 ? 'warning' : 'positive',
    },
    {
      id: 'tasks_overdue',
      label: 'Overdue tasks',
      value: formatNumber(facts.tasks.overdue),
      tone: facts.tasks.overdue > 0 ? 'critical' : 'positive',
    },
  ];
  return stats;
}

/** Rule-based recommendations. Explicitly NOT presented as stored data. */
export function recommendations(facts: BusinessFactPack): Insight[] {
  const insights: Insight[] = [];
  const revenueChange = facts.revenue.weekChangePct;

  if (Math.abs(revenueChange) >= 1) {
    insights.push({
      id: 'rec_revenue_trend',
      kind: 'AI_RECOMMENDATION',
      severity: revenueChange >= 0 ? 'positive' : 'warning',
      title:
        revenueChange >= 0
          ? `Revenue is up ${revenueChange.toFixed(1)}% week over week`
          : `Revenue is down ${Math.abs(revenueChange).toFixed(1)}% week over week`,
      detail:
        revenueChange >= 0
          ? `Keep the momentum: the last 7 days produced ${formatMoney(facts.revenue.weekCents, facts.currency)} across ${facts.revenue.weekOrders} orders. Consider a follow-up campaign to customers who have not ordered in 30+ days.`
          : `Last 7 days produced ${formatMoney(facts.revenue.weekCents, facts.currency)} versus ${formatMoney(facts.revenue.weekCents / (1 + revenueChange / 100 || 1), facts.currency)} the week before. A re-engagement offer to returning customers usually recovers 10–20% of a dip.`,
      action: { label: 'Create a marketing campaign', href: '/dashboard/marketing' },
    });
  }

  const topService = facts.sales.popularServices[0];
  if (topService && topService.bookings > 0) {
    insights.push({
      id: 'rec_top_service',
      kind: 'AI_RECOMMENDATION',
      severity: 'info',
      title: `Your most popular service is ${topService.name}`,
      detail: `${topService.bookings} bookings recorded at ${formatMoney(topService.priceCents, facts.currency)}. Consider a bundle with a complementary service to raise average order value.`,
      action: { label: 'Package this service', href: '/dashboard/services' },
    });
  }

  if (facts.inventory.lowStock.length) {
    const first = facts.inventory.lowStock[0];
    insights.push({
      id: 'rec_low_stock',
      kind: 'AI_RECOMMENDATION',
      severity: 'warning',
      title: `${facts.inventory.lowStock.length} product(s) need replenishment`,
      detail: `${first.name} has ${first.quantity} left against a minimum of ${first.minStock}${
        first.supplier ? ` (supplier: ${first.supplier})` : ''
      }. Place a purchase order before it affects sales.`,
      action: { label: 'Open inventory', href: '/dashboard/inventory' },
    });
  }

  if (facts.sales.topItems.length) {
    const best = facts.sales.topItems[0];
    insights.push({
      id: 'rec_best_seller',
      kind: 'AI_RECOMMENDATION',
      severity: 'info',
      title: `${best.name} is your best seller`,
      detail: `${best.units} units / ${formatMoney(best.revenueCents, facts.currency)} in the last 30 days. Feature it in this week's social post and pair it with slower-moving stock.`,
      action: { label: 'Generate a social post', href: '/dashboard/marketing' },
    });
  }

  if (facts.customers.followUp.length) {
    insights.push({
      id: 'rec_follow_up',
      kind: 'AI_RECOMMENDATION',
      severity: 'info',
      title: `${facts.customers.followUp.length} customer(s) need follow-up`,
      detail: `These customers have not interacted in over 30 days — starting with ${facts.customers.followUp[0].name}. A short WhatsApp or SMS message with a limited-time offer typically re-activates 1 in 5.`,
      action: { label: 'Open CRM', href: '/dashboard/customers' },
    });
  }

  if (facts.leads.open > 0) {
    insights.push({
      id: 'rec_pipeline',
      kind: 'AI_RECOMMENDATION',
      severity: 'info',
      title: `${facts.leads.open} open lead(s) in the pipeline`,
      detail: `Current win rate is ${facts.leads.conversionRatePct.toFixed(1)}%. Focus on leads sitting in Proposal and Negotiation — they convert fastest with a same-day follow-up.`,
      action: { label: 'Review pipeline', href: '/dashboard/sales' },
    });
  }

  if (facts.support.frequentTopics.length) {
    const topic = facts.support.frequentTopics[0];
    insights.push({
      id: 'rec_support_topics',
      kind: 'AI_RECOMMENDATION',
      severity: 'info',
      title: `Customers frequently ask about “${topic.topic}”`,
      detail: `${topic.count} related request(s) in the last 90 days. Add a clear FAQ and the AI support assistant will answer it automatically next time.`,
      action: { label: 'Update the knowledge base', href: '/dashboard/knowledge' },
    });
  }

  if (!facts.knowledge.sources) {
    insights.push({
      id: 'rec_knowledge_empty',
      kind: 'AI_RECOMMENDATION',
      severity: 'warning',
      title: 'Your AI knowledge base is empty',
      detail:
        'Upload your menu, price list, service catalogue or policies so the assistant can answer customer questions with your own information instead of escalating to a human.',
      action: { label: 'Upload documents', href: '/dashboard/knowledge' },
    });
  }

  if (facts.tasks.overdue > 0) {
    insights.push({
      id: 'rec_tasks_overdue',
      kind: 'AI_RECOMMENDATION',
      severity: 'critical',
      title: `${facts.tasks.overdue} task(s) are overdue`,
      detail: 'Overdue tasks usually hide customer promises. Clear them or reschedule with a realistic deadline today.',
      action: { label: 'Open tasks', href: '/dashboard/tasks' },
    });
  }

  if (facts.appointments.cancelledLast7Days > 0) {
    insights.push({
      id: 'rec_no_shows',
      kind: 'AI_RECOMMENDATION',
      severity: 'warning',
      title: `${facts.appointments.cancelledLast7Days} appointment(s) cancelled or missed`,
      detail:
        'Enable 24-hour appointment reminders and ask for confirmation — businesses that do typically reduce no-shows by a third.',
      action: { label: 'Configure reminders', href: '/dashboard/appointments' },
    });
  }

  return insights;
}

export function calculatedOnlyInsights(facts: BusinessFactPack): Insight[] {
  return calculatedStats(facts)
    .filter((stat) => stat.changePct !== undefined)
    .map((stat) => ({
      id: `stat_${stat.id}`,
      kind: 'CALCULATED' as const,
      severity: (stat.tone ?? (stat.changePct! >= 0 ? 'positive' : 'warning')) as InsightSeverity,
      title: `${stat.label}: ${stat.value}`,
      detail: `Change versus the previous period: ${percentChange(stat.changePct!, 0).toFixed(1)}% (calculated from stored orders).`,
    }));
}

/** Analytics screen dataset — all values calculated from stored rows. */
export function analyticsSeries(facts: BusinessFactPack) {
  const daily = facts.revenue.daily.map((row) => ({
    day: row.day,
    label: formatDate(row.day),
    revenueCents: row.revenue,
    orders: row.orders,
  }));
  return {
    daily,
    channels: facts.sales.channels.map((channel) => ({
      channel: channel.channel,
      revenueCents: channel.revenueCents,
      orders: channel.orders,
    })),
    topItems: facts.sales.topItems,
    pipeline: facts.leads.byStage,
    customerMix: facts.customers.byStatus.map((row) => ({ status: row.status, count: row.c })),
    stockRisk: facts.inventory.lowStock,
    slowMovers: facts.inventory.slowMoving,
  };
}

export function periodRange(period: 'DAILY' | 'WEEKLY' | 'MONTHLY', reference = new Date()) {
  const end = new Date(reference);
  const start = new Date(reference);
  if (period === 'DAILY') {
    start.setUTCDate(start.getUTCDate() - 1);
  } else if (period === 'WEEKLY') {
    start.setUTCDate(start.getUTCDate() - 7);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  return { startIso: start.toISOString(), endIso: end.toISOString(), start, end };
}

export function reportTitle(period: 'DAILY' | 'WEEKLY' | 'MONTHLY', businessName: string, end: Date) {
  return `${businessName} — ${period.charAt(0)}${period.slice(1).toLowerCase()} report (${formatDate(end)})`;
}

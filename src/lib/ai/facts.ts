/**
 * Verified business fact pack.
 *
 * Everything in this module is calculated directly from the tenant's stored rows
 * — nothing here is generated. The fact pack is the only business data the AI
 * layer is allowed to treat as confirmed, and it doubles as the deterministic
 * analytics engine used when no LLM key is configured.
 */
import {
  all,
} from '@/lib/db';
import { listCustomers, customerStatusCounts, countCustomers, customersNeedingFollowUp } from '@/lib/db/repositories/crm';
import {
  appointmentSummary,
  listAppointments,
  overdueTaskCount,
  taskCounts,
} from '@/lib/db/repositories/ops';
import {
  fastMovingProducts,
  inventoryValue,
  lowStockProducts,
  popularServices,
  revenueByDay,
  revenueSummary,
  salesByChannel,
  slowMovingProducts,
  topSellingItems,
} from '@/lib/db/repositories/catalog';
import { conversationCounts, frequentIssueTopics, openConversationCount, countTickets } from '@/lib/db/repositories/comms';
import { leadStageSummary, listLeads } from '@/lib/db/repositories/crm';
import { knowledgeStats } from '@/lib/db/repositories/knowledge';
import { findBusinessById } from '@/lib/db/repositories/accounts';
import { LEAD_STAGE_LABELS, type LeadStage } from '@/lib/domain';
import { formatMoney, formatNumber, percentChange } from '@/lib/utils';

export type BusinessFactPack = ReturnType<typeof buildFactPack>;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export function buildFactPack(businessId: string) {
  const now = new Date().toISOString();
  const week = revenueSummary(businessId, isoDaysAgo(7), now);
  const prevWeek = revenueSummary(businessId, isoDaysAgo(14), isoDaysAgo(7));
  const month = revenueSummary(businessId, isoDaysAgo(30), now);
  const prevMonth = revenueSummary(businessId, isoDaysAgo(60), isoDaysAgo(30));

  const appointmentsWeek = appointmentSummary(businessId, isoDaysAgo(7), now);
  const appointmentsNext7 = appointmentSummary(businessId, now, isoDaysAhead(7));

  const lowStock = lowStockProducts(businessId, 8);
  const fastMoving = fastMovingProducts(businessId, 6);
  const slowMoving = slowMovingProducts(businessId, 5);
  const stock = inventoryValue(businessId);
  const services = popularServices(businessId, 6);
  const topItems = topSellingItems(businessId, isoDaysAgo(30), 6);
  const channels = salesByChannel(businessId, isoDaysAgo(30));
  const leadStages = leadStageSummary(businessId);
  const leads = listLeads(businessId, { limit: 100 });
  const followUps = customersNeedingFollowUp(businessId, 30, 10);
  const newCustomersWeek = countCustomers(businessId, isoDaysAgo(7));
  const newCustomersMonth = countCustomers(businessId, isoDaysAgo(30));
  const statusCounts = customerStatusCounts(businessId);
  const conversationsByStatus = conversationCounts(businessId);
  const issues = frequentIssueTopics(businessId, 6);
  const tasks = taskCounts(businessId);
  const overdueTasks = overdueTaskCount(businessId);
  const knowledge = knowledgeStats(businessId);
  const recentAppointments = listAppointments(businessId, {
    fromIso: now,
    toIso: isoDaysAhead(14),
    limit: 25,
  });

  const totalCustomers = statusCounts.reduce((sum, row) => sum + row.c, 0);
  const wonLeads = leadStages.find((row) => row.stage === 'WON')?.c ?? 0;
  const lostLeads = leadStages.find((row) => row.stage === 'LOST')?.c ?? 0;
  const openLeads = leadStages
    .filter((row) => !['WON', 'LOST'].includes(row.stage))
    .reduce((sum, row) => sum + row.c, 0);
  const conversionRate = wonLeads + lostLeads > 0 ? (wonLeads / (wonLeads + lostLeads)) * 100 : 0;

  // The tenant's own currency travels with the facts: every formatter below prints in it,
  // and it is what the AI is told when it answers money questions.
  const businessRow = findBusinessById(businessId);

  return {
    generatedAt: now,
    currency: businessRow?.currency ?? 'USD',
    windowDays: { current: 7, previous: 7, month: 30 },
    revenue: {
      weekCents: week.revenue,
      weekOrders: week.orders,
      weekAverageCents: Math.round(week.avg),
      weekChangePct: percentChange(week.revenue, prevWeek.revenue),
      monthCents: month.revenue,
      monthOrders: month.orders,
      monthAverageCents: Math.round(month.avg),
      monthChangePct: percentChange(month.revenue, prevMonth.revenue),
      daily: revenueByDay(businessId, isoDaysAgo(14), now),
    },
    customers: {
      total: totalCustomers,
      newThisWeek: newCustomersWeek,
      newThisMonth: newCustomersMonth,
      byStatus: statusCounts,
      followUp: followUps.map((customer) => ({
        id: customer.id,
        name: customer.name,
        status: customer.status,
        lastInteractionAt: customer.lastInteractionAt,
        phone: customer.phone,
        email: customer.email,
        totalSpendCents: customer.totalSpendCents,
      })),
    },
    appointments: {
      last7Days: appointmentsWeek.total,
      completedLast7Days: appointmentsWeek.completed,
      cancelledLast7Days: appointmentsWeek.cancelled,
      revenueLast7DaysCents: appointmentsWeek.revenue,
      next7Days: appointmentsNext7.total,
      upcoming: recentAppointments.slice(0, 8).map((appointment) => ({
        id: appointment.id,
        title: appointment.title,
        startAt: appointment.start_at,
        status: appointment.status,
        staff: appointment.staff_name,
        customer: appointment.customer_name,
      })),
      busyStaff: all<{ name: string; c: number }>(
        `SELECT s.name, count(*) AS c FROM appointments a JOIN staff s ON s.id = a.staff_id
         WHERE a.business_id = ? AND a.start_at >= ? AND a.status NOT IN ('CANCELLED','NO_SHOW')
         GROUP BY s.name ORDER BY c DESC LIMIT 3`,
        [businessId, isoDaysAgo(30)],
      ),
    },
    sales: {
      topItems: topItems.map((item) => ({
        name: item.name,
        type: item.item_type,
        units: item.units,
        revenueCents: item.revenue,
        unitPriceCents: item.unit_price,
      })),
      channels: channels.map((channel) => ({
        channel: channel.channel ?? 'UNKNOWN',
        revenueCents: channel.revenue,
        orders: channel.orders,
      })),
      popularServices: services.map((service) => ({
        name: service.name,
        bookings: service.times_booked,
        priceCents: service.price_cents,
      })),
    },
    leads: {
      total: leads.length,
      open: openLeads,
      won: wonLeads,
      lost: lostLeads,
      conversionRatePct: conversionRate,
      byStage: leadStages.map((row) => ({
        stage: LEAD_STAGE_LABELS[row.stage as LeadStage] ?? row.stage,
        count: row.c,
        valueCents: row.value,
      })),
      staleFollowUps: leads
        .filter((lead) => !['WON', 'LOST'].includes(lead.stage))
        .sort((a, b2) => (a.lastContactedAt ?? a.createdAt).localeCompare(b2.lastContactedAt ?? b2.createdAt))
        .slice(0, 6)
        .map((lead) => ({
          id: lead.id,
          name: lead.name,
          stage: LEAD_STAGE_LABELS[lead.stage] ?? lead.stage,
          lastContactedAt: lead.lastContactedAt,
          nextFollowUpAt: lead.nextFollowUpAt,
          valueCents: lead.valueCents,
        })),
    },
    inventory: {
      trackableValueCents: stock.cost,
      retailValueCents: stock.retail,
      units: stock.units,
      lowStockCount: stock.low,
      lowStock: lowStock.map((product) => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        minStock: product.minStock,
        stockStatus: product.stockStatus,
        supplier: product.supplier,
      })),
      fastMoving: fastMoving.map((product) => ({
        id: product.id,
        name: product.name,
        unitsSold: product.unitsSold,
        quantity: product.quantity,
      })),
      slowMoving: slowMoving.map((product) => ({
        id: product.id,
        name: product.name,
        unitsSold: product.unitsSold,
        quantity: product.quantity,
      })),
    },
    support: {
      openConversations: openConversationCount(businessId),
      byStatus: conversationsByStatus,
      openTickets: countTickets(businessId, 'OPEN'),
      totalTickets: countTickets(businessId),
      frequentTopics: issues.map((issue) => ({ topic: issue.topic, count: issue.c })),
    },
    tasks: { byStatus: tasks, overdue: overdueTasks },
    knowledge: {
      sources: knowledge.sources,
      chunks: knowledge.chunks,
      faqs: knowledge.faqs,
      documentBytes: knowledge.bytes,
    },
    customers_raw: listCustomers(businessId, { limit: 5 }).rows.map((customer) => ({
      name: customer.name,
      status: customer.status,
      totalSpendCents: customer.totalSpendCents,
    })),
  };
}

/** Human-readable rendering of the fact pack used inside prompts and answers. */
export function renderFactPack(facts: BusinessFactPack): string {
  const lines: string[] = [];
  lines.push(`VERIFIED BUSINESS DATA (calculated ${facts.generatedAt.slice(0, 16).replace('T', ' ')} UTC)`);
  lines.push(
    `Revenue: last 7 days ${formatMoney(facts.revenue.weekCents, facts.currency)} (${facts.revenue.weekOrders} orders) — ${percentChange(
      facts.revenue.weekCents,
      facts.revenue.weekCents / (1 + facts.revenue.weekChangePct / 100) || 0,
    ).toFixed(1)}% reported week-over-week.`,
  );
  lines.push(
    `Revenue: last 30 days ${formatMoney(facts.revenue.monthCents, facts.currency)} across ${facts.revenue.monthOrders} orders, average order ${formatMoney(facts.revenue.monthAverageCents, facts.currency)}.`,
  );
  lines.push(
    `Customers: ${facts.customers.total} total, ${facts.customers.newThisWeek} new this week, ${facts.customers.newThisMonth} new this month.`,
  );
  if (facts.customers.byStatus.length) {
    lines.push(`Customer status mix: ${facts.customers.byStatus.map((row) => `${row.status} ${row.c}`).join(', ')}.`);
  }
  lines.push(
    `Appointments: ${facts.appointments.last7Days} in the last 7 days (${facts.appointments.completedLast7Days} completed, ${facts.appointments.cancelledLast7Days} cancelled/no-show); ${facts.appointments.next7Days} scheduled in the next 7 days.`,
  );
  if (facts.sales.popularServices.length) {
    lines.push(
      `Most booked services: ${facts.sales.popularServices
        .map((service) => `${service.name} (${service.bookings} bookings, priced ${formatMoney(service.priceCents, facts.currency)})`)
        .join('; ')}.`,
    );
  }
  if (facts.sales.topItems.length) {
    lines.push(
      `Best sellers (30 days): ${facts.sales.topItems
        .map((item) => `${item.name} — ${item.units} units / ${formatMoney(item.revenueCents, facts.currency)}`)
        .join('; ')}.`,
    );
  }
  if (facts.inventory.lowStock.length) {
    lines.push(
      `Low stock: ${facts.inventory.lowStock
        .map((product) => `${product.name} (${product.quantity} left, minimum ${product.minStock})`)
        .join('; ')}.`,
    );
  }
  lines.push(
    `Inventory value at cost ${formatMoney(facts.inventory.trackableValueCents, facts.currency)}; ${facts.inventory.lowStockCount} products at or below their minimum level.`,
  );
  lines.push(
    `Leads: ${facts.leads.open} open, ${facts.leads.won} won, ${facts.leads.lost} lost; win rate ${facts.leads.conversionRatePct.toFixed(1)}%.`,
  );
  if (facts.leads.byStage.length) {
    lines.push(`Pipeline: ${facts.leads.byStage.map((row) => `${row.stage} ${row.count}`).join(', ')}.`);
  }
  lines.push(
    `Support: ${facts.support.openConversations} open conversations, ${facts.support.openTickets} open tickets.`,
  );
  if (facts.support.frequentTopics.length) {
    lines.push(
      `Recurring customer issues: ${facts.support.frequentTopics
        .map((topic) => `${topic.topic} (${topic.count})`)
        .join('; ')}.`,
    );
  }
  const taskLine = facts.tasks.byStatus.map((row) => `${row.status} ${row.c}`).join(', ') || 'none yet';
  lines.push(`Tasks: ${taskLine}; ${facts.tasks.overdue} overdue.`);
  lines.push(
    `Knowledge base: ${facts.knowledge.sources} uploaded sources, ${facts.knowledge.chunks} indexed chunks, ${facts.knowledge.faqs} FAQs.`,
  );
  return lines.join('\n');
}

export function businessSnapshotForPrompt(business: {
  name: string;
  type: string;
  description: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: unknown;
  currency: string;
}): string {
  return [
    `Business name: ${business.name}`,
    `Industry: ${business.type}`,
    business.description ? `Description: ${business.description}` : null,
    business.city || business.country ? `Location: ${[business.city, business.country].filter(Boolean).join(', ')}` : null,
    business.phone ? `Phone: ${business.phone}` : null,
    business.email ? `Email: ${business.email}` : null,
    business.website ? `Website: ${business.website}` : null,
    `Currency: ${business.currency}`,
    `Opening hours: ${JSON.stringify(business.hours)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function factSummaryLine(facts: BusinessFactPack): string {
  return `${formatNumber(facts.customers.total)} customers · ${formatMoney(facts.revenue.monthCents, facts.currency)} revenue (30d) · ${facts.appointments.next7Days} upcoming appointments`;
}

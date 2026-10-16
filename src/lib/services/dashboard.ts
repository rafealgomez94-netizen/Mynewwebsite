import { buildFactPack } from '@/lib/ai/facts';
import { calculatedStats, recommendations } from '@/lib/ai/analytics';
import { listOrders, inventoryValue } from '@/lib/db/repositories/catalog';
import { listConversations, countTickets } from '@/lib/db/repositories/comms';
import { listAppointments, listNotifications, listTasks, unreadNotificationCount } from '@/lib/db/repositories/ops';
import { listCustomers, listLeads } from '@/lib/db/repositories/crm';
import { recentAiRuns } from '@/lib/db/repositories/knowledge';
import { aiAllowanceUsed, planForBusiness, usageCount, type Plan } from '@/lib/db/repositories/platform';
import { conversationCounts } from '@/lib/db/repositories/comms';
import { LEAD_STAGE_LABELS, type LeadStage } from '@/lib/domain';
import { formatDate, formatMoney } from '@/lib/utils';

export type DashboardData = Awaited<ReturnType<typeof buildDashboard>>;

export async function buildDashboard(businessId: string, userId: string) {
  const facts = buildFactPack(businessId);
  const now = new Date();
  const orders = listOrders(businessId, { limit: 8 });
  const appointments = listAppointments(businessId, {
    fromIso: now.toISOString(),
    toIso: new Date(now.getTime() + 7 * 86400000).toISOString(),
    limit: 8,
  });
  const tasks = listTasks(businessId, { limit: 8 });
  const customers = listCustomers(businessId, { limit: 6, sort: 'recent' });
  const leads = listLeads(businessId, { limit: 60 });
  const conversations = listConversations(businessId, { limit: 6 });
  const notifications = listNotifications(businessId, userId, 12);
  const unread = unreadNotificationCount(businessId, userId);
  const aiRuns = recentAiRuns(businessId, 6);
  const stock = inventoryValue(businessId);
  const { plan, subscription } = planForBusiness(businessId);

  const leadByStage = Object.entries(
    leads.reduce<Record<string, number>>((accumulator, lead) => {
      accumulator[lead.stage] = (accumulator[lead.stage] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).map(([stage, count]) => ({ stage, label: LEAD_STAGE_LABELS[stage as LeadStage] ?? stage, count }));

  const pipelineValueCents = leads
    .filter((lead) => !['WON', 'LOST'].includes(lead.stage))
    .reduce((sum, lead) => sum + lead.valueCents, 0);

  const conversationTotals = conversationCounts(businessId);

  return {
    facts,
    stats: calculatedStats(facts),
    recommendations: recommendations(facts),
    charts: {
      revenue: facts.revenue.daily.map((row) => ({
        label: formatDate(row.day),
        day: row.day,
        value: row.revenue,
        orders: row.orders,
      })),
      pipeline: leadByStage,
      customerMix: facts.customers.byStatus.map((row) => ({ label: row.status, value: row.c })),
      topItems: facts.sales.topItems.map((item) => ({ label: item.name, value: item.revenueCents, units: item.units })),
    },
    recent: {
      orders: orders.map((order) => ({
        id: order.id,
        number: order.order_number,
        customer: order.customer_name,
        totalCents: order.total_cents,
        status: order.status,
        placedAt: order.placed_at,
      })),
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        title: appointment.title,
        startAt: appointment.start_at,
        customer: appointment.customer_name,
        staff: appointment.staff_name,
        status: appointment.status,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueAt: task.due_at,
        assignee: task.assignee_name,
      })),
      customers: customers.rows.map((customer) => ({
        id: customer.id,
        name: customer.name,
        status: customer.status,
        totalSpendCents: customer.totalSpendCents,
        lastInteractionAt: customer.lastInteractionAt,
      })),
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        channel: conversation.channel,
        status: conversation.status,
        contact: conversation.contact_name ?? conversation.customer_name,
        preview: conversation.preview,
        lastMessageAt: conversation.last_message_at,
        needsHuman: conversation.needs_human === 1,
        messageCount: conversation.message_count,
      })),
      aiRuns: aiRuns.map((run) => ({
        id: run.id,
        surface: run.surface,
        prompt: run.prompt,
        grounded: run.grounded === 1,
        provider: run.provider,
        createdAt: run.created_at,
      })),
    },
    notifications: {
      unread,
      items: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        level: notification.level,
        href: notification.href,
        readAt: notification.read_at,
        createdAt: notification.created_at,
      })),
    },
    business: {
      revenueMonthCents: facts.revenue.monthCents,
      pipelineValueCents,
      openConversations: facts.support.openConversations,
      openTickets: countTickets(businessId, 'OPEN'),
      conversationTotals,
      inventoryValueCents: stock.cost,
      lowStockCount: facts.inventory.lowStockCount,
    },
    subscription: {
      plan: plan as Plan,
      status: subscription?.status ?? 'ACTIVE',
      billingCycle: subscription?.billing_cycle ?? 'MONTHLY',
      currentPeriodEnd: subscription?.current_period_end ?? null,
      trialEndsAt: subscription?.trial_ends_at ?? null,
      usage: {
        aiMessages: aiAllowanceUsed(businessId),
        documents: usageCount(businessId, 'DOCUMENTS'),
        supportMessages: usageCount(businessId, 'SUPPORT_MESSAGES'),
      },
    },
  };
}

export function usagePercent(used: number, limit: number): number {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function formatCurrencyShort(cents: number, currency = 'USD'): string {
  return formatMoney(cents, currency);
}

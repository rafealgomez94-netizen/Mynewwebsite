import { handleError, ok } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { requirePlatformAdmin } from '@/lib/auth/rbac';
import {
  contactMessagesSince,
  platformBusinessUsage,
  platformMetrics,
  platformSupportTickets,
  platformUsageTotals,
  subscriptionStats,
} from '@/lib/db/repositories/platform';
import { listAllBusinesses, listPlatformAuditLogs, countUsers } from '@/lib/db/repositories/accounts';
import { listContactMessages } from '@/lib/db/repositories/platform';
import { formatMoney } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SaaS operator dashboard. Returns aggregate platform analytics only — business
 * payloads (customers, orders, conversations) stay inside each tenant.
 */
export async function GET(request: Request) {
  try {
    requirePlatformAdmin(await getSessionContext());
    const since = new URL(request.url).searchParams.get('since') ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const metrics = platformMetrics(since);
    const businesses = listAllBusinesses(200);
    const usage = platformBusinessUsage(50);
    const tickets = platformSupportTickets(50);
    const contactMessages = listContactMessages(30);
    const audits = listPlatformAuditLogs(50);
    const usageTotals = platformUsageTotals(since);

    return ok({
      metrics: {
        ...metrics,
        revenueFormatted: formatMoney(metrics.revenueCents),
        mrrFormatted: formatMoney(metrics.mrrCents),
        users: countUsers(),
      },
      businesses: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        type: business.type,
        ownerEmail: business.owner_email,
        ownerName: business.owner_name,
        planCode: business.plan_code ?? 'FREE',
        subscriptionStatus: business.subscription_status ?? 'TRIALING',
        memberCount: business.member_count,
        customerCount: business.customer_count,
        createdAt: business.created_at,
      })),
      usage,
      usageTotals,
      subscriptions: subscriptionStats(),
      tickets,
      contactMessages,
      audits,
      leadsInbox: contactMessagesSince(since),
    });
  } catch (error) {
    return handleError(error);
  }
}

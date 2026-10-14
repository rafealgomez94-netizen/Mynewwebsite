import { handleError, ok } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { buildFactPack } from '@/lib/ai/facts';
import { analyticsSeries, calculatedStats, recommendations } from '@/lib/ai/analytics';
import { aiUsage } from '@/lib/db/repositories/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'analytics:read');
    const facts = buildFactPack(ctx.business.id);
    const usage = aiUsage(ctx.business.id, new Date(Date.now() - 30 * 86400000).toISOString());

    return ok({
      generatedAt: facts.generatedAt,
      stats: calculatedStats(facts),
      series: analyticsSeries(facts),
      recommendations: recommendations(facts),
      ai: {
        runs: usage.runs,
        tokens: usage.tokens,
        averageLatencyMs: Math.round(usage.avg_latency),
      },
      comparison: {
        revenueWeekCents: facts.revenue.weekCents,
        revenueWeekChangePct: facts.revenue.weekChangePct,
        revenueMonthCents: facts.revenue.monthCents,
        revenueMonthChangePct: facts.revenue.monthChangePct,
        newCustomersWeek: facts.customers.newThisWeek,
        newCustomersMonth: facts.customers.newThisMonth,
        leadWinRatePct: facts.leads.conversionRatePct,
        appointmentCompletionRatePct:
          facts.appointments.last7Days > 0
            ? (facts.appointments.completedLast7Days / facts.appointments.last7Days) * 100
            : 0,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

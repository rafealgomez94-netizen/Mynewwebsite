import { handleError, ok, parseBody } from '@/lib/api/http';
import { reportGenerateSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { findReport, listReports } from '@/lib/db/repositories/ops';
import { createReportForPeriod } from '@/lib/services/reports';
import { calculatedStats, recommendations as buildRecommendations } from '@/lib/ai/analytics';
import { buildFactPack } from '@/lib/ai/facts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'reports:read');
    const reportId = new URL(request.url).searchParams.get('id');
    if (reportId) {
      const report = findReport(ctx.business.id, reportId);
      return ok({ report });
    }
    const facts = buildFactPack(ctx.business.id);
    return ok({
      reports: listReports(ctx.business.id, 30),
      liveStats: calculatedStats(facts),
      recommendations: buildRecommendations(facts).map((insight) => ({
        id: insight.id,
        severity: insight.severity,
        title: insight.title,
        detail: insight.detail,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'reports:read');
    const input = await parseBody(request, reportGenerateSchema);
    const result = await createReportForPeriod({
      businessId: ctx.business.id,
      userId: ctx.userId,
      period: input.period,
      withAiSummary: input.withAiSummary,
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

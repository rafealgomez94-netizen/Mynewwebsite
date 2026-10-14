import { handleError, ok } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { buildDashboard } from '@/lib/services/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    const dashboard = await buildDashboard(ctx.business.id, ctx.userId);
    return ok(dashboard);
  } catch (error) {
    return handleError(error);
  }
}

import { handleError, ok } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { runTaskDeadlineAlerts } from '@/lib/services/deadlines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Announces the deadlines that have arrived for the signed-in workspace.
 *
 * The dashboard button and the scheduled job call the same service, and
 * `tasks.deadline_alerted_at` makes it idempotent, so pressing the button twice
 * does not tell the team twice.
 */
export async function POST() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'tasks:write');
    const result = await runTaskDeadlineAlerts({ businessId: ctx.business.id });
    return ok({
      due: result.due,
      alerted: result.alerted,
      overdue: result.overdue,
      alerts: result.alerts,
    });
  } catch (error) {
    return handleError(error);
  }
}

/** How many deadlines are due right now — used by the dashboard before alerting. */
export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'tasks:read');
    const preview = await runTaskDeadlineAlerts({ businessId: ctx.business.id, dryRun: true });
    return ok({ due: preview.due, overdue: preview.overdue });
  } catch (error) {
    return handleError(error);
  }
}

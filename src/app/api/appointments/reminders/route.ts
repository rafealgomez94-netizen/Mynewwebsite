import { handleError, ok } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { runAppointmentReminders } from '@/lib/services/reminders';
import { notify } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends the appointment reminders that are due for the signed-in workspace.
 *
 * The dashboard button and any scheduler call the same service, so a reminder that
 * was already sent (stamped with `reminder_sent_at`) is never sent twice.
 */
export async function POST() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'appointments:write');

    const result = await runAppointmentReminders({ businessId: ctx.business.id });
    if (result.sent > 0) {
      await notify({
        businessId: ctx.business.id,
        type: 'APPOINTMENT_REMINDERS_SENT',
        title: `${result.sent} appointment reminder${result.sent === 1 ? '' : 's'} sent`,
        body: `Reminders went to ${result.sent} customer${result.sent === 1 ? '' : 's'} with upcoming appointments.`,
        href: '/dashboard/appointments',
      });
    }
    return ok({
      due: result.due,
      sent: result.sent,
      skipped: result.skipped,
      deliveries: result.deliveries,
    });
  } catch (error) {
    return handleError(error);
  }
}

/** How many reminders are due right now — used by the dashboard before sending. */
export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'appointments:read');
    const preview = await runAppointmentReminders({ businessId: ctx.business.id, dryRun: true });
    return ok({ due: preview.due });
  } catch (error) {
    return handleError(error);
  }
}

import { all } from '@/lib/db';
import { appointmentsNeedingReminder, markReminderSent } from '@/lib/db/repositories/ops';
import { commsFor, type BusinessRow } from '@/lib/db/repositories/accounts';
import { sendAppointmentReminderEmail } from '@/lib/mailer';
import { audit } from '@/lib/services/notify';

/**
 * Appointment reminders.
 *
 * The business chooses whether reminders go out and how many hours before the
 * appointment (onboarding field "customer communication preferences", stored on
 * `businesses.comms_json`). This service is the only sender: it selects the
 * appointments that fall inside that lead window, emails the customer, and stamps
 * `appointments.reminder_sent_at` so a second run — from the dashboard button, a
 * scheduler hitting the cron route, or both — never double-sends.
 *
 * It is safe to call as often as you like; an empty run costs one indexed query.
 */
export type ReminderRunResult = {
  ranAt: string;
  businessesChecked: number;
  due: number;
  sent: number;
  skipped: number;
  deliveries: {
    appointmentId: string;
    businessId: string;
    customer: string;
    email: string;
    startsAt: string;
    transport: string;
  }[];
};

export async function runAppointmentReminders(
  options: { businessId?: string; now?: Date; limit?: number; dryRun?: boolean } = {},
): Promise<ReminderRunResult> {
  const now = options.now ?? new Date();
  const businesses = all<BusinessRow>(
    options.businessId
      ? 'SELECT * FROM businesses WHERE id = ?'
      : 'SELECT * FROM businesses ORDER BY created_at ASC',
    options.businessId ? [options.businessId] : [],
  );

  const result: ReminderRunResult = {
    ranAt: now.toISOString(),
    businessesChecked: businesses.length,
    due: 0,
    sent: 0,
    skipped: 0,
    deliveries: [],
  };

  for (const business of businesses) {
    const comms = commsFor(business);
    if (!comms.sendAppointmentReminders) continue;

    // Anything starting between now and the configured number of hours ahead.
    const leadHours = Math.min(Math.max(comms.reminderLeadHours || 24, 1), 168);
    const fromIso = now.toISOString();
    const toIso = new Date(now.getTime() + leadHours * 3600 * 1000).toISOString();
    const due = appointmentsNeedingReminder(business.id, { fromIso, toIso, limit: options.limit ?? 200 });
    result.due += due.length;
    // A dry run reports what would go out (dashboard preview, tests) without sending.
    if (options.dryRun) continue;

    for (const appointment of due) {
      const email = (appointment.customer_email ?? '').trim();
      if (!email) {
        result.skipped += 1;
        continue;
      }
      const when = new Date(appointment.start_at).toUTCString();
      const service = appointment.service_name ?? appointment.title;
      let transport = 'failed';
      try {
        const delivery = await sendAppointmentReminderEmail({
          to: email,
          customerName: appointment.customer_name ?? 'there',
          businessName: business.name,
          when,
          service,
        });
        transport = delivery.transport;
        // Sent (or logged in development when SMTP is unconfigured — the message is
        // visible in the server console). Stamp it so we never send it twice.
        markReminderSent(business.id, appointment.id);
        result.sent += 1;
      } catch (error) {
        result.skipped += 1;
        audit({
          businessId: business.id,
          action: 'appointment.reminder_failed',
          entityType: 'appointment',
          entityId: appointment.id,
          meta: { email, error: error instanceof Error ? error.message : String(error) },
        });
        continue;
      }

      result.deliveries.push({
        appointmentId: appointment.id,
        businessId: business.id,
        customer: appointment.customer_name ?? email,
        email,
        startsAt: appointment.start_at,
        transport,
      });
      audit({
        businessId: business.id,
        action: 'appointment.reminder_sent',
        entityType: 'appointment',
        entityId: appointment.id,
        meta: { email, startsAt: appointment.start_at, transport, leadHours },
      });
    }
  }

  return result;
}

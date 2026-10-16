import { NextResponse } from 'next/server';
import { cronUnauthorised } from '@/lib/services/cron-auth';
import { runTaskDeadlineAlerts } from '@/lib/services/deadlines';
import { runAppointmentReminders } from '@/lib/services/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Everything the platform owes at this moment, for every workspace:
 * appointment reminders and task deadline alerts.
 *
 * `GET /api/cron/run?secret=$CRON_SECRET`, or `Authorization: Bearer $CRON_SECRET`.
 * Both jobs stamp what they send (`appointments.reminder_sent_at`,
 * `tasks.deadline_alerted_at`), so running this every few minutes is safe and a
 * run with nothing to do is two indexed queries.
 */
async function handler(request: Request) {
  const denied = cronUnauthorised(request);
  if (denied) return denied;
  const [reminders, deadlines] = await Promise.all([
    runAppointmentReminders(),
    runTaskDeadlineAlerts(),
  ]);
  return NextResponse.json({
    ok: true,
    data: { ranAt: new Date().toISOString(), reminders, deadlines },
  });
}

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}

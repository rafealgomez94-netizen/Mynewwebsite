import { NextResponse } from 'next/server';
import { cronUnauthorised } from '@/lib/services/cron-auth';
import { runAppointmentReminders } from '@/lib/services/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduler entry point for appointment reminders.
 *
 * Point a cron job (Vercel Cron, systemd timer, GitHub Actions, any uptime monitor)
 * at `GET /api/cron/reminders?secret=$CRON_SECRET` or send the secret in an
 * `Authorization: Bearer $CRON_SECRET` header.
 *
 * Reminders are idempotent: whichever caller gets there first stamps
 * `appointments.reminder_sent_at`, so a second run reports `sent: 0`. Use
 * `/api/cron/run` instead when you want reminders *and* task deadline alerts.
 */
async function handler(request: Request) {
  const denied = cronUnauthorised(request);
  if (denied) return denied;
  const result = await runAppointmentReminders();
  return NextResponse.json({ ok: true, data: result });
}

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}

import { NextResponse } from 'next/server';
import { runAppointmentReminders } from '@/lib/services/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduler entry point for appointment reminders.
 *
 * Point a cron job (Vercel Cron, systemd timer, GitHub Actions, any uptime monitor)
 * at `GET /api/cron/reminders?secret=$CRON_SECRET` or send the secret in an
 * `Authorization: Bearer $CRON_SECRET` header. Without `CRON_SECRET` configured the
 * route answers `503` instead of running platform-wide work for anyone who asks.
 *
 * Reminders are idempotent: whichever caller gets there first stamps
 * `appointments.reminder_sent_at`, so a second run reports `sent: 0`.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const query = new URL(request.url).searchParams.get('secret') ?? '';
  return bearer === secret || query === secret;
}

async function run(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: 'Cron is not configured. Set CRON_SECRET to enable the reminder scheduler.',
          code: 'cron_not_configured',
        },
      },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json(
      { ok: false, error: { message: 'Invalid or missing cron secret.', code: 'unauthorized' } },
      { status: 401 },
    );
  }
  const result = await runAppointmentReminders();
  return NextResponse.json({ ok: true, data: result });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

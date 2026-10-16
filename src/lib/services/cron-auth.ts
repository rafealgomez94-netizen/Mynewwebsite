import { NextResponse } from 'next/server';

/**
 * Shared guard for the scheduler endpoints (`/api/cron/*`).
 *
 * A scheduler identifies itself with `CRON_SECRET`, either as a query parameter
 * (`?secret=…`, what a hosted cron service can call with no headers) or as
 * `Authorization: Bearer …`. Without `CRON_SECRET` configured the endpoints answer
 * `503` rather than running platform-wide work for anyone who finds the URL.
 */
export function cronUnauthorised(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: 'Cron is not configured. Set CRON_SECRET to enable the scheduled jobs.',
          code: 'cron_not_configured',
        },
      },
      { status: 503 },
    );
  }
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const query = new URL(request.url).searchParams.get('secret') ?? '';
  if (bearer === secret || query === secret) return null;
  return NextResponse.json(
    { ok: false, error: { message: 'Invalid or missing cron secret.', code: 'unauthorized' } },
    { status: 401 },
  );
}

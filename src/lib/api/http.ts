import { NextResponse } from 'next/server';
import { ZodError, type TypeOf, type ZodTypeAny } from 'zod';
import { HttpError } from '@/lib/auth/rbac';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, message: string, code = 'error', details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, code, details } }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    return fail(error.status, error.message, error.code, error.details);
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return fail(422, first?.message ?? 'Please check the information you entered.', 'validation_error', {
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  if (process.env.NODE_ENV !== 'production') {
    console.error('[api]', error);
  }
  const isDbError = /SQLITE|constraint|UNIQUE/i.test(message);
  return fail(
    isDbError ? 409 : 500,
    isDbError ? 'That record already exists or conflicts with existing data.' : 'Something went wrong. Please try again.',
    isDbError ? 'conflict' : 'server_error',
    process.env.NODE_ENV === 'production' ? undefined : message,
  );
}

export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<TypeOf<S>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.', 'bad_request');
  }
  return schema.parse(payload) as TypeOf<S>;
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): TypeOf<S> {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return schema.parse(params) as TypeOf<S>;
}

// ---------------------------------------------------------------------------
// Rate limiting (per instance, sliding window). Protects auth + public endpoints
// against brute-force and abuse.
// ---------------------------------------------------------------------------
type Bucket = { hits: number[]; blockedUntil?: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  if (bucket.blockedUntil && bucket.blockedUntil > now) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }
  bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
  if (bucket.hits.length >= limit) {
    bucket.blockedUntil = now + windowMs;
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if ((value.blockedUntil ?? 0) < now && value.hits.length === 0) buckets.delete(bucketKey);
    }
  }
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function assertRateLimit(request: Request, scope: string, limit: number, windowMs: number): void {
  const result = rateLimit(`${scope}:${clientIp(request)}`, limit, windowMs);
  if (!result.allowed) {
    throw new HttpError(
      429,
      `Too many requests. Please try again in ${result.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }
}

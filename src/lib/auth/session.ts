import { cookies, headers } from 'next/headers';
import {
  createAuthToken,
  createSession,
  expireAuthTokens,
  findAuthToken,
  findBusinessesByUser,
  findMembership,
  findSessionByTokenHash,
  findUserById,
  consumeAuthToken,
  revokeAllUserSessions,
  revokeSession,
  setSessionBusiness,
  touchSession,
} from '@/lib/db/repositories/accounts';
import { createOpaqueToken, hashToken } from '@/lib/auth/password';
import type { BusinessRole } from '@/lib/domain';

export const SESSION_COOKIE = 'wd_session';
const SESSION_TTL_DAYS = 30;
const TOKEN_TTL_MINUTES = { EMAIL_VERIFY: 60 * 24, PASSWORD_RESET: 60, INVITE: 60 * 24 * 7 } as const;

export type SessionContext = {
  sessionId: string;
  user: ReturnType<typeof import('@/lib/db/repositories/accounts').toUser>;
  businessId: string | null;
  role: BusinessRole | null;
};

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function requestMeta() {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return {
    ip: forwarded ? forwarded.split(',')[0].trim() : headerList.get('x-real-ip') ?? 'unknown',
    userAgent: headerList.get('user-agent') ?? 'unknown',
  };
}

/** Creates a session row and sets the signed-out-of-band cookie on the response. */
export async function startSession(userId: string, businessId?: string | null): Promise<string> {
  const token = createOpaqueToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  const meta = await requestMeta();
  const sessionId = createSession({
    userId,
    tokenHash,
    businessId: businessId ?? null,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, `${sessionId}.${token}`, cookieOptions(SESSION_TTL_DAYS * 86400));
  return sessionId;
}

export async function switchBusiness(sessionId: string, businessId: string): Promise<void> {
  setSessionBusiness(sessionId, businessId);
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    const [sessionId] = raw.split('.');
    if (sessionId) revokeSession(sessionId);
  }
  store.delete(SESSION_COOKIE);
}

export async function endAllSessions(userId: string): Promise<void> {
  revokeAllUserSessions(userId);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Resolves the current session from the cookie. Returns null when unauthenticated. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [sessionId, token] = raw.split('.');
  if (!sessionId || !token) return null;

  const session = findSessionByTokenHash(hashToken(token));
  if (!session || session.id !== sessionId) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const userRow = findUserById(session.user_id);
  if (!userRow || userRow.status !== 'ACTIVE') return null;

  const memberships = findBusinessesByUser(userRow.id);
  let businessId = session.business_id;
  if (!businessId || !memberships.some((business) => business.id === businessId)) {
    businessId = memberships[0]?.id ?? null;
    if (businessId) setSessionBusiness(session.id, businessId);
  }

  touchSession(session.id);
  const membership = businessId ? findMembership(businessId, userRow.id) : undefined;
  const { toUser } = await import('@/lib/db/repositories/accounts');

  return {
    sessionId: session.id,
    user: toUser(userRow),
    businessId,
    role: (membership?.role as BusinessRole | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// One-time tokens: email verification + password reset
// ---------------------------------------------------------------------------
export async function issueAuthToken(
  user: { id: string; email: string },
  type: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE',
): Promise<string> {
  expireAuthTokens(user.id, type);
  const token = createOpaqueToken(32);
  const ttlMinutes = TOKEN_TTL_MINUTES[type];
  createAuthToken({
    userId: user.id,
    type,
    tokenHash: hashToken(token, `${type}:${user.id}`),
    email: user.email,
    expiresAt: new Date(Date.now() + ttlMinutes * 60000).toISOString(),
  });
  return token;
}

/**
 * Resolve a one-time token without consuming it, so a page can greet the invitee
 * before they submit the form. Consuming happens in `consumeAuthTokenFor`.
 */
export async function peekAuthToken(
  token: string,
  type: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE',
): Promise<{ ok: boolean; userId?: string; email?: string; reason?: string }> {
  const { all } = await import('@/lib/db');
  const rows = all<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM auth_tokens WHERE type = ? AND used_at IS NULL`,
    [type],
  );
  for (const row of rows) {
    const record = findAuthToken(hashToken(token, `${type}:${row.user_id}`), type);
    if (!record) continue;
    if (record.used_at) return { ok: false, reason: 'This link has already been used.' };
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return { ok: false, reason: 'This link has expired. Ask for a new invitation.' };
    }
    return { ok: true, userId: record.user_id, email: record.email };
  }
  return { ok: false, reason: 'This link is not valid.' };
}

export async function consumeAuthTokenFor(
  token: string,
  type: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE',
  userId?: string,
): Promise<{ ok: boolean; userId?: string; email?: string; reason?: string }> {
  const candidates: string[] = [];
  if (userId) {
    candidates.push(hashToken(token, `${type}:${userId}`));
  } else {
    // Password resets are verified by re-deriving the hash once the token row is
    // located; we therefore scan by type for a matching hash.
    const { all } = await import('@/lib/db');
    const rows = all<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM auth_tokens WHERE type = ? AND used_at IS NULL`,
      [type],
    );
    for (const row of rows) candidates.push(hashToken(token, `${type}:${row.user_id}`));
  }

  for (const hash of candidates) {
    const record = findAuthToken(hash, type);
    if (!record) continue;
    if (record.used_at) return { ok: false, reason: 'This link has already been used.' };
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return { ok: false, reason: 'This link has expired. Request a new one.' };
    }
    consumeAuthToken(record.id);
    return { ok: true, userId: record.user_id, email: record.email };
  }
  return { ok: false, reason: 'This link is not valid.' };
}

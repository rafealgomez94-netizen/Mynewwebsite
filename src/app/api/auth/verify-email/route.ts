import { assertRateLimit, fail, handleError, ok } from '@/lib/api/http';
import { z } from 'zod';
import { consumeAuthTokenFor, getSessionContext, issueAuthToken } from '@/lib/auth/session';
import { findUserByEmail, updateUser } from '@/lib/db/repositories/accounts';
import { sendVerificationEmail } from '@/lib/mailer';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({ token: z.string().min(10).optional() });

export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'verify-email', 20, 15 * 60 * 1000);
    const { token } = inputSchema.parse(await request.json().catch(() => ({})));
    if (!token) return fail(400, 'A verification token is required.', 'missing_token');

    const result = await consumeAuthTokenFor(token, 'EMAIL_VERIFY');
    if (!result.ok || !result.userId) {
      return fail(400, result.reason ?? 'This verification link is not valid.', 'invalid_token');
    }
    updateUser(result.userId, { emailVerifiedAt: new Date().toISOString() });
    audit({
      actorUserId: result.userId,
      actorEmail: result.email ?? null,
      action: 'user.email_verified',
      entityType: 'user',
      entityId: result.userId,
    });
    return ok({ verified: true, email: result.email });
  } catch (error) {
    return handleError(error);
  }
}

/** Re-sends the verification email for the signed-in account. */
export async function PUT(request: Request) {
  try {
    assertRateLimit(request, 'resend-verification', 5, 15 * 60 * 1000);
    const session = await getSessionContext();
    if (!session) return fail(401, 'You need to sign in first.', 'unauthenticated');
    if (session.user.emailVerifiedAt) return ok({ alreadyVerified: true });

    const user = findUserByEmail(session.user.email);
    if (!user) return fail(404, 'Account not found.', 'not_found');

    const token = await issueAuthToken({ id: user.id, email: user.email }, 'EMAIL_VERIFY');
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify-email?token=${token}`;
    const mail = await sendVerificationEmail(user.email, user.name, verifyUrl);
    return ok({
      sent: true,
      emailSent: mail.delivered,
      devUrl: process.env.NODE_ENV === 'production' ? undefined : verifyUrl,
    });
  } catch (error) {
    return handleError(error);
  }
}

import { NextResponse } from 'next/server';
import { assertRateLimit, fail, handleError, ok, parseBody } from '@/lib/api/http';
import { signupSchema } from '@/lib/validation';
import { createUser, findUserByEmail } from '@/lib/db/repositories/accounts';
import { hashPassword } from '@/lib/auth/password';
import { issueAuthToken, requestMeta, startSession } from '@/lib/auth/session';
import { sendVerificationEmail } from '@/lib/mailer';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'signup', 10, 10 * 60 * 1000);
    const input = await parseBody(request, signupSchema);

    if (findUserByEmail(input.email)) {
      return fail(409, 'An account with this email already exists. Try signing in instead.', 'email_in_use');
    }

    const passwordHash = await hashPassword(input.password);
    const user = createUser({
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone || null,
      marketingOptIn: input.marketingOptIn ?? false,
    });

    const token = await issueAuthToken({ id: user.id, email: user.email }, 'EMAIL_VERIFY');
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify-email?token=${token}`;
    const mail = await sendVerificationEmail(user.email, user.name, verifyUrl);

    await startSession(user.id);
    const meta = await requestMeta();
    audit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.signup',
      entityType: 'user',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(
      {
        user: { id: user.id, email: user.email, name: user.name },
        verification: {
          emailSent: mail.delivered,
          transport: mail.transport,
          // In development the verification link is surfaced so the flow can be
          // completed without an SMTP provider. Never exposed in production.
          devUrl: process.env.NODE_ENV === 'production' ? undefined : verifyUrl,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return handleError(error);
  }
}

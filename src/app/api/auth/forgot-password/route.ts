import { assertRateLimit, handleError, ok, parseBody } from '@/lib/api/http';
import { forgotPasswordSchema } from '@/lib/validation';
import { findUserByEmail } from '@/lib/db/repositories/accounts';
import { issueAuthToken } from '@/lib/auth/session';
import { sendPasswordResetEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'forgot-password', 6, 15 * 60 * 1000);
    const input = await parseBody(request, forgotPasswordSchema);
    const user = findUserByEmail(input.email);

    // Always report success so the endpoint cannot be used to enumerate accounts.
    if (!user) return ok({ requested: true });

    const token = await issueAuthToken({ id: user.id, email: user.email }, 'PASSWORD_RESET');
    const origin = new URL(request.url).origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;
    const mail = await sendPasswordResetEmail(user.email, user.name, resetUrl);

    return ok({
      requested: true,
      emailSent: mail.delivered,
      devUrl: process.env.NODE_ENV === 'production' ? undefined : resetUrl,
    });
  } catch (error) {
    return handleError(error);
  }
}

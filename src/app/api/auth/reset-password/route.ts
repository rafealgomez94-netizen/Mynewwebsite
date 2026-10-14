import { assertRateLimit, fail, handleError, ok, parseBody } from '@/lib/api/http';
import { resetPasswordSchema } from '@/lib/validation';
import { consumeAuthTokenFor, endAllSessions } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { findUserById, updateUser } from '@/lib/db/repositories/accounts';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'reset-password', 10, 15 * 60 * 1000);
    const input = await parseBody(request, resetPasswordSchema);
    const result = await consumeAuthTokenFor(input.token, 'PASSWORD_RESET');
    if (!result.ok || !result.userId) {
      return fail(400, result.reason ?? 'This reset link is not valid.', 'invalid_token');
    }
    const user = findUserById(result.userId);
    if (!user) return fail(404, 'Account not found.', 'not_found');

    updateUser(user.id, { passwordHash: await hashPassword(input.password) });
    // Password change invalidates every existing session.
    await endAllSessions(user.id);
    audit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user.id,
    });
    return ok({ reset: true });
  } catch (error) {
    return handleError(error);
  }
}

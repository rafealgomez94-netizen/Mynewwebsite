import { assertRateLimit, fail, handleError, ok, parseBody } from '@/lib/api/http';
import { loginSchema } from '@/lib/validation';
import { findBusinessesByUser, findUserByEmail, markUserLogin } from '@/lib/db/repositories/accounts';
import { verifyPassword } from '@/lib/auth/password';
import { requestMeta, startSession } from '@/lib/auth/session';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'login', 12, 5 * 60 * 1000);
    const input = await parseBody(request, loginSchema);
    const user = findUserByEmail(input.email);

    // Same message for unknown email and wrong password: never leak which accounts exist.
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      return fail(401, 'Email or password is incorrect.', 'invalid_credentials');
    }
    if (user.status !== 'ACTIVE') {
      return fail(403, 'This account has been suspended. Contact support for help.', 'account_suspended');
    }

    const businesses = findBusinessesByUser(user.id);
    await startSession(user.id, businesses[0]?.id ?? null);
    markUserLogin(user.id);
    const meta = await requestMeta();
    audit({
      businessId: businesses[0]?.id ?? null,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({
      user: { id: user.id, email: user.email, name: user.name },
      next: businesses.length ? '/dashboard' : user.platform_role === 'PLATFORM_ADMIN' ? '/admin' : '/onboarding',
      emailVerified: Boolean(user.email_verified_at),
    });
  } catch (error) {
    return handleError(error);
  }
}

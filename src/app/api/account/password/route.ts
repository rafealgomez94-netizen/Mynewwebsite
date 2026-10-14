import { fail, handleError, ok, parseBody } from '@/lib/api/http';
import { changePasswordSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { requireUser } from '@/lib/auth/rbac';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { findUserById, updateUser } from '@/lib/db/repositories/accounts';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireUser(await getSessionContext());
    const input = await parseBody(request, changePasswordSchema);
    const user = findUserById(session.user.id);
    if (!user) return fail(404, 'Account not found.', 'not_found');
    if (!(await verifyPassword(input.currentPassword, user.password_hash))) {
      return fail(400, 'Your current password is incorrect.', 'invalid_password');
    }
    updateUser(user.id, { passwordHash: await hashPassword(input.newPassword) });
    audit({
      businessId: session.businessId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: user.id,
    });
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

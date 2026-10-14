import { z } from 'zod';
import { fail, handleError, ok, parseBody } from '@/lib/api/http';
import { getSessionContext, switchBusiness } from '@/lib/auth/session';
import { requireUser } from '@/lib/auth/rbac';
import { findMembership } from '@/lib/db/repositories/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = requireUser(await getSessionContext());
    const { businessId } = await parseBody(request, z.object({ businessId: z.string().min(3).max(64) }));

    // Switching is only possible into a workspace the user is an active member of.
    const membership = findMembership(businessId, session.user.id);
    if (!membership || membership.status !== 'ACTIVE') {
      return fail(403, 'You do not have access to this workspace.', 'forbidden');
    }
    await switchBusiness(session.sessionId, businessId);
    return ok({ businessId });
  } catch (error) {
    return handleError(error);
  }
}

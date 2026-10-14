import { handleError, ok } from '@/lib/api/http';
import { endSession, getSessionContext } from '@/lib/auth/session';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getSessionContext();
    if (session) {
      audit({
        businessId: session.businessId,
        actorUserId: session.user.id,
        actorEmail: session.user.email,
        action: 'user.logout',
        entityType: 'user',
        entityId: session.user.id,
      });
    }
    await endSession();
    return ok({ signedOut: true });
  } catch (error) {
    return handleError(error);
  }
}

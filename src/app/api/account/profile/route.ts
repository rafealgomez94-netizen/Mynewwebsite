import { handleError, ok, parseBody } from '@/lib/api/http';
import { profileSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { requireUser } from '@/lib/auth/rbac';
import { updateUser } from '@/lib/db/repositories/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = requireUser(await getSessionContext());
    return ok({ user: session.user });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requireUser(await getSessionContext());
    const input = await parseBody(request, profileSchema);
    updateUser(session.user.id, {
      name: input.name,
      phone: input.phone || null,
      jobTitle: input.jobTitle || null,
      timezone: input.timezone || 'UTC',
      theme: input.theme,
      avatarUrl: input.avatarUrl || null,
    });
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

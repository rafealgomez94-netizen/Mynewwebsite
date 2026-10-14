import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from '@/lib/db/repositories/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    return ok({
      unread: unreadNotificationCount(ctx.business.id, ctx.userId),
      items: listNotifications(ctx.business.id, ctx.userId, 30),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    const input = await parseBody(request, z.object({ id: z.string().optional(), all: z.boolean().optional() }));
    if (input.all) {
      markAllNotificationsRead(ctx.business.id, ctx.userId);
    } else if (input.id) {
      markNotificationRead(ctx.business.id, ctx.userId, input.id);
    }
    return ok({ unread: unreadNotificationCount(ctx.business.id, ctx.userId) });
  } catch (error) {
    return handleError(error);
  }
}

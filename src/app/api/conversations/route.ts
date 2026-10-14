import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { conversationCreateSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import {
  addMessage,
  conversationCounts,
  createConversation,
  listConversations,
  listMessages,
  updateConversation,
} from '@/lib/db/repositories/comms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:read');
    const url = new URL(request.url);
    const conversations = listConversations(ctx.business.id, {
      status: url.searchParams.get('status') ?? undefined,
      channel: url.searchParams.get('channel') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    });
    return ok({ conversations, counts: conversationCounts(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:write');
    const input = await parseBody(request, conversationCreateSchema);
    const conversationId = createConversation(ctx.business.id, {
      customerId: input.customerId || null,
      channel: input.channel,
      subject: input.subject || null,
      contactName: input.contactName || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
      isAiHandled: true,
    });
    if (input.firstMessage) {
      addMessage(ctx.business.id, {
        conversationId,
        sender: 'STAFF',
        body: input.firstMessage,
        senderUserId: ctx.userId,
      });
    }
    return ok({ conversationId, messages: listMessages(ctx.business.id, conversationId) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:write');
    const input = await parseBody(
      request,
      z.object({
        id: z.string().min(3),
        status: z.enum(['OPEN', 'PENDING', 'ESCALATED', 'CLOSED']).optional(),
        assignedToId: z.string().optional(),
        markRead: z.boolean().optional(),
      }),
    );
    updateConversation(ctx.business.id, input.id, {
      status: input.status,
      assignedToId: input.assignedToId || null,
      unreadForBusiness: input.markRead ? 0 : undefined,
      needsHuman: input.status === 'ESCALATED' ? true : input.status ? false : undefined,
    });
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

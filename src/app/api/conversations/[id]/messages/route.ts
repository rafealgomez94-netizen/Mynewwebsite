import { z } from 'zod';
import { handleError, ok } from '@/lib/api/http';
import { conversationMessageSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import { addMessage, findConversation, listMessages, updateConversation } from '@/lib/db/repositories/comms';
import { answerCustomerQuestion } from '@/lib/ai/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:read');
    const conversation = findConversation(ctx.business.id, id);
    if (!conversation) throw new HttpError(404, 'Conversation not found.', 'not_found');
    return ok({ conversation, messages: listMessages(ctx.business.id, id) });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Staff reply. `mode: 'ai_draft'` asks the AI to draft a grounded answer first
 * (returned to the agent for review, never sent automatically), `mode: 'reply'`
 * stores the text as a staff message. The body is read exactly once — a Request
 * stream cannot be consumed twice.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:write');
    const conversation = findConversation(ctx.business.id, id);
    if (!conversation) throw new HttpError(404, 'Conversation not found.', 'not_found');

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON.', 'bad_request');
    }
    const mode = z.enum(['reply', 'ai_draft']).parse(body.mode ?? 'reply');

    if (mode === 'ai_draft') {
      const { question } = z.object({ question: z.string().min(3).max(2000) }).parse(body);
      const draft = await answerCustomerQuestion({
        businessId: ctx.business.id,
        question,
        history: listMessages(ctx.business.id, id, 12).map((message) => ({
          sender: message.sender,
          body: message.body,
        })),
        contact: {
          name: conversation.contact_name,
          email: conversation.contact_email,
          phone: conversation.contact_phone,
        },
      });
      return ok({ draft });
    }

    const input = conversationMessageSchema.parse(body);
    addMessage(ctx.business.id, {
      conversationId: id,
      sender: 'STAFF',
      body: input.body,
      senderUserId: ctx.userId,
    });
    updateConversation(ctx.business.id, id, { unreadForBusiness: 0, status: 'PENDING' });
    return ok({ messages: listMessages(ctx.business.id, id) });
  } catch (error) {
    return handleError(error);
  }
}

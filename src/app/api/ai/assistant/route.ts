import { handleError, ok, parseBody } from '@/lib/api/http';
import { assistantSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import { askAssistant, ASSISTANT_EXAMPLES, assistantProviderName } from '@/lib/ai/assistant';
import { aiAllowanceUsed, incrementUsage, planForBusiness } from '@/lib/db/repositories/platform';
import { listMessages, addMessage } from '@/lib/db/repositories/comms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'ai:use');
    const { plan } = planForBusiness(ctx.business.id);
    return ok({
      provider: assistantProviderName(),
      examples: ASSISTANT_EXAMPLES,
      usage: {
        used: aiAllowanceUsed(ctx.business.id),
        limit: plan.limits.aiMessages,
        plan: plan.name,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'ai:use');
    const input = await parseBody(request, assistantSchema);

    // AI usage limits are enforced per billing period.
    const { plan } = planForBusiness(ctx.business.id);
    const used = aiAllowanceUsed(ctx.business.id);
    if (used >= plan.limits.aiMessages) {
      throw new HttpError(
        402,
        `You have used all ${plan.limits.aiMessages} AI messages included in the ${plan.name} plan this month. Upgrade to continue.`,
        'plan_limit',
      );
    }

    const answer = await askAssistant({
      businessId: ctx.business.id,
      userId: ctx.userId,
      question: input.message,
      surface: input.surface === 'SUPPORT' ? 'ASSISTANT' : input.surface,
    });

    incrementUsage(ctx.business.id, 'AI_MESSAGES', 1, { surface: input.surface });

    if (input.conversationId) {
      addMessage(ctx.business.id, {
        conversationId: input.conversationId,
        sender: 'AI',
        body: answer.answer,
        grounded: answer.grounded,
      });
    }

    return ok({ ...answer, usage: { used: used + 1, limit: plan.limits.aiMessages } });
  } catch (error) {
    return handleError(error);
  }
}

/** Lightweight transcript reader for the assistant history panel. */
export async function PUT(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'ai:use');
    const body = (await request.json()) as { conversationId?: string };
    if (!body.conversationId) return ok({ messages: [] });
    return ok({
      messages: listMessages(ctx.business.id, body.conversationId, 50).map((message) => ({
        sender: message.sender,
        body: message.body,
        createdAt: message.created_at,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

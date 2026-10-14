import { handleError, ok, parseBody } from '@/lib/api/http';
import { supportSettingsSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { getSupportSettings, updateSupportSettings } from '@/lib/db/repositories/comms';
import { businessKnowledgePrompt, supportProviderName } from '@/lib/ai/support';
import { knowledgeStats } from '@/lib/db/repositories/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:read');
    const settings = getSupportSettings(ctx.business.id);
    return ok({
      settings,
      knowledge: knowledgeStats(ctx.business.id),
      provider: supportProviderName(),
      widgetUrl: `/support/${ctx.business.slug}`,
      knowledgePreview: businessKnowledgePrompt(ctx.business.id).slice(0, 1200),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:write');
    const input = await parseBody(request, supportSettingsSchema.partial());
    getSupportSettings(ctx.business.id);
    updateSupportSettings(ctx.business.id, {
      greeting: input.greeting || undefined,
      tone: input.tone || undefined,
      escalationMessage: input.escalationMessage || undefined,
      handoffEmail: input.handoffEmail || undefined,
      autoReplyEnabled: input.autoReplyEnabled,
      widgetEnabled: input.widgetEnabled,
    });
    return ok({ settings: getSupportSettings(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { leadActivitySchema, leadSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import {
  addLeadActivity,
  deleteLead,
  findCustomer,
  findLead,
  listLeadActivities,
  updateLead,
} from '@/lib/db/repositories/crm';
import { scoreLead } from '@/lib/ai/generators';
import { generateSalesMessage } from '@/lib/ai/generators';
import { parseMoneyToCents } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function loadLead(paramsPromise: Params['params']) {
  const { id } = await paramsPromise;
  const ctx = requireTenant(await getSessionContext());
  const lead = findLead(ctx.business.id, id);
  if (!lead) throw new HttpError(404, 'Lead not found in this workspace.', 'not_found');
  return { ctx, lead };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { ctx, lead } = await loadLead(params);
    assertPermission(ctx, 'leads:read');
    return ok({ lead, activities: listLeadActivities(ctx.business.id, lead.id, 50) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { ctx, lead } = await loadLead(params);
    assertPermission(ctx, 'leads:write');
    const input = await parseBody(request, leadSchema.partial());

    const updated = updateLead(ctx.business.id, lead.id, {
      name: input.name,
      phone: input.phone ?? undefined,
      email: input.email ?? undefined,
      source: input.source ?? undefined,
      stage: input.stage,
      valueCents: input.value !== undefined ? parseMoneyToCents(input.value) : undefined,
      notes: input.notes ?? undefined,
      nextFollowUpAt: input.nextFollowUpAt ?? undefined,
      lastContactedAt: input.stage ? new Date().toISOString() : undefined,
    });

    if (input.stage && input.stage !== lead.stage) {
      addLeadActivity(ctx.business.id, lead.id, {
        type: 'STAGE_CHANGE',
        content: `Stage moved from ${lead.stage.replace('_', ' ')} to ${input.stage.replace('_', ' ')}`,
        createdById: ctx.userId,
      });
    }

    const customer = updated?.customerId ? findCustomer(ctx.business.id, updated.customerId) : undefined;
    if (updated) {
      const scored = scoreLead({
        valueCents: updated.valueCents,
        stage: updated.stage,
        lastContactedAt: updated.lastContactedAt,
        createdAt: updated.createdAt,
        source: updated.source,
        customer,
      });
      updateLead(ctx.business.id, updated.id, { score: scored.score, scoreReason: scored.reasons.join(' · ') });
    }

    return ok({ lead: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { ctx, lead } = await loadLead(params);
    assertPermission(ctx, 'leads:write');
    const body = await request.json().catch(() => ({}));
    const action = z.enum(['activity', 'message', 'score']).parse(body.action ?? 'activity');

    if (action === 'message') {
      const input = z
        .object({
          channel: z.enum(['WHATSAPP', 'EMAIL', 'SMS', 'PHONE']).default('WHATSAPP'),
          intent: z.enum(['FOLLOW_UP', 'QUOTE', 'RECOMMENDATION', 'REACTIVATION']).default('FOLLOW_UP'),
        })
        .parse(body);
      const generated = await generateSalesMessage({
        businessId: ctx.business.id,
        userId: ctx.userId,
        leadId: lead.id,
        customerId: lead.customerId,
        channel: input.channel,
        intent: input.intent,
      });
      addLeadActivity(ctx.business.id, lead.id, {
        type: 'AI',
        content: `Generated ${input.intent.replace('_', ' ').toLowerCase()} message for ${input.channel}:\n${generated.message}`,
        createdById: ctx.userId,
      });
      return ok({ message: generated.message, provider: generated.provider });
    }

    if (action === 'score') {
      const customer = lead.customerId ? findCustomer(ctx.business.id, lead.customerId) : undefined;
      const scored = scoreLead({
        valueCents: lead.valueCents,
        stage: lead.stage,
        lastContactedAt: lead.lastContactedAt,
        createdAt: lead.createdAt,
        source: lead.source,
        customer,
      });
      updateLead(ctx.business.id, lead.id, { score: scored.score, scoreReason: scored.reasons.join(' · ') });
      return ok({ score: scored.score, reasons: scored.reasons });
    }

    const input = await parseBody(request, leadActivitySchema);
    addLeadActivity(ctx.business.id, lead.id, { type: input.type, content: input.content, createdById: ctx.userId });
    if (input.type !== 'NOTE') {
      updateLead(ctx.business.id, lead.id, { lastContactedAt: new Date().toISOString() });
    }
    return ok({ activities: listLeadActivities(ctx.business.id, lead.id, 50) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { ctx, lead } = await loadLead(params);
    assertPermission(ctx, 'leads:write');
    deleteLead(ctx.business.id, lead.id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

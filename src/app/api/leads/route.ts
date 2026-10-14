import { handleError, ok, parseBody } from '@/lib/api/http';
import { leadSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { createCustomer, findCustomer } from '@/lib/db/repositories/crm';
import { addLeadActivity, createLead, leadStageSummary, listLeads } from '@/lib/db/repositories/crm';
import { scoreLead } from '@/lib/ai/generators';
import { parseMoneyToCents } from '@/lib/utils';
import { notify } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'leads:read');
    const url = new URL(request.url);
    const leads = listLeads(ctx.business.id, {
      stage: url.searchParams.get('stage') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 200),
    });
    const summary = leadStageSummary(ctx.business.id);
    const openValue = summary
      .filter((row) => !['WON', 'LOST'].includes(row.stage))
      .reduce((sum, row) => sum + row.value, 0);
    return ok({ leads, summary, openValueCents: openValue });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'leads:write');
    const input = await parseBody(request, leadSchema);

    let customerId = input.customerId || null;
    if (!customerId && (input.email || input.phone)) {
      // Capture the enquiry in the CRM immediately so nothing is lost.
      const customer = createCustomer(ctx.business.id, {
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        status: 'LEAD',
        source: input.source || 'Lead form',
        tags: ['lead'],
        notes: input.notes || null,
      });
      customerId = customer.id;
    }

    const lead = createLead(ctx.business.id, {
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      source: input.source || null,
      stage: input.stage,
      valueCents: parseMoneyToCents(input.value),
      notes: input.notes || null,
      customerId,
      ownerUserId: ctx.userId,
      nextFollowUpAt: input.nextFollowUpAt || null,
    });

    const customer = customerId ? findCustomer(ctx.business.id, customerId) : undefined;
    const scored = scoreLead({
      valueCents: lead.valueCents,
      stage: lead.stage,
      lastContactedAt: lead.lastContactedAt,
      createdAt: lead.createdAt,
      source: lead.source,
      customer,
    });
    const { updateLead } = await import('@/lib/db/repositories/crm');
    updateLead(ctx.business.id, lead.id, { score: scored.score, scoreReason: scored.reasons.join(' · ') });
    addLeadActivity(ctx.business.id, lead.id, {
      type: 'NOTE',
      content: `Lead captured. AI score ${scored.score}/100 — ${scored.reasons.join(' · ')}`,
      createdById: ctx.userId,
    });

    await notify({
      businessId: ctx.business.id,
      type: 'NEW_LEAD',
      title: `New lead: ${lead.name}`,
      body: `Stage ${lead.stage.replace('_', ' ').toLowerCase()} · score ${scored.score}/100`,
      href: '/dashboard/sales',
      entityType: 'lead',
      entityId: lead.id,
    });

    return ok({ lead: { ...lead, score: scored.score, scoreReason: scored.reasons.join(' · ') } }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

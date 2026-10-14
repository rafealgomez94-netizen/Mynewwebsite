import { handleError, ok, parseBody } from '@/lib/api/http';
import { documentGenerateSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import { createDocument, documentCounts, listDocuments, listDocuments as list } from '@/lib/db/repositories/content';
import { generateDocument } from '@/lib/ai/generators';
import { incrementUsage, planForBusiness, usageCount } from '@/lib/db/repositories/platform';
import { findCustomer } from '@/lib/db/repositories/crm';
import { formatDate } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'documents:read');
    const url = new URL(request.url);
    return ok({
      documents: list(ctx.business.id, {
        type: url.searchParams.get('type') ?? undefined,
        search: url.searchParams.get('search') ?? undefined,
      }),
      counts: documentCounts(ctx.business.id),
    });
  } catch (error) {
    return handleError(error);
  }
}

/** Generates a document with AI assistance, then stores it as a draft. */
export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'documents:write');
    const input = await parseBody(request, documentGenerateSchema);

    const { plan } = planForBusiness(ctx.business.id);
    if (usageCount(ctx.business.id, 'DOCUMENTS') >= plan.limits.documents) {
      throw new HttpError(
        402,
        `Your ${plan.name} plan includes ${plan.limits.documents} generated documents per month.`,
        'plan_limit',
      );
    }

    const generated = await generateDocument({
      businessId: ctx.business.id,
      userId: ctx.userId,
      type: input.type,
      title: input.title || undefined,
      customerId: input.customerId || null,
      instructions: input.instructions || '',
      items: input.items,
      currency: input.currency,
      dueDate: input.dueDate || null,
    });

    const document = createDocument(ctx.business.id, {
      type: input.type,
      title: generated.document.title,
      customerId: input.customerId || null,
      status: 'DRAFT',
      content: {
        sections: generated.document.sections,
        lines: generated.document.lines,
        subtotalCents: generated.document.subtotalCents,
        taxCents: generated.document.taxCents,
        totalCents: generated.document.totalCents,
        customer: input.customerId ? findCustomer(ctx.business.id, input.customerId)?.name ?? null : null,
      },
      contentText: generated.document.contentText,
      totalCents: generated.document.totalCents,
      currency: input.currency,
      source: 'AI',
      dueAt: input.dueDate || null,
      createdById: ctx.userId,
    });

    incrementUsage(ctx.business.id, 'DOCUMENTS', 1, { type: input.type });

    return ok({ document: { ...document, number: document.number }, provider: generated.provider }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'documents:write');
    const { updateDocument } = await import('@/lib/db/repositories/content');
    const body = (await request.json()) as { id?: string; status?: string; title?: string };
    if (!body.id) throw new HttpError(422, 'A document id is required.', 'validation_error');
    updateDocument(ctx.business.id, body.id, { status: body.status, title: body.title });
    void formatDate;
    return ok({ updated: true, documents: listDocuments(ctx.business.id, {}) });
  } catch (error) {
    return handleError(error);
  }
}

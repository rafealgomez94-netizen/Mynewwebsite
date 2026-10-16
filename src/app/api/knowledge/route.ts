import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { faqSchema, knowledgeTextSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import {
  buildKnowledgeSnapshot,
  createFaq,
  createSource,
  deleteFaq,
  deleteSource,
  findSource,
  knowledgeStats,
  listFaqs,
  listSources,
  reindexSources,
  updateFaq,
} from '@/lib/db/repositories/knowledge';
import { incrementUsage, planForBusiness } from '@/lib/db/repositories/platform';
import { deleteObject } from '@/lib/storage';
import { HttpError } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'knowledge:read');
    const { plan } = planForBusiness(ctx.business.id);
    return ok({
      sources: listSources(ctx.business.id),
      faqs: listFaqs(ctx.business.id),
      stats: knowledgeStats(ctx.business.id),
      preview: buildKnowledgeSnapshot(ctx.business.id, 2500),
      limits: { storageMb: plan.limits.storageMb, documents: plan.limits.documents },
    });
  } catch (error) {
    return handleError(error);
  }
}

/** Adds plain-text knowledge (paste flow) or a FAQ entry. */
export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'knowledge:write');
    const body = await request.json();
    const kind = z.enum(['text', 'faq', 'reindex']).parse(body.kind ?? 'text');

    if (kind === 'reindex') {
      // Rebuilds the retrieval index for this workspace only — used after the
      // chunking strategy changes or when a source was indexed by an older build.
      const result = reindexSources(ctx.business.id);
      return ok({ reindexed: result, stats: knowledgeStats(ctx.business.id) });
    }

    if (kind === 'faq') {
      const input = faqSchema.parse(body.data ?? body);
      const id = createFaq(ctx.business.id, {
        question: input.question,
        answer: input.answer,
        category: input.category || null,
        published: input.published,
      });
      incrementUsage(ctx.business.id, 'DOCUMENTS', 1, { kind: 'FAQ' });
      return ok({ id, faqs: listFaqs(ctx.business.id), stats: knowledgeStats(ctx.business.id) }, { status: 201 });
    }

    const input = knowledgeTextSchema.parse(body.data ?? body);
    const { plan } = planForBusiness(ctx.business.id);
    const stats = knowledgeStats(ctx.business.id);
    if (stats.bytes + input.body.length > plan.limits.storageMb * 1024 * 1024) {
      throw new HttpError(402, `Your ${plan.name} plan includes ${plan.limits.storageMb} MB of knowledge storage.`, 'plan_limit');
    }
    const source = createSource(ctx.business.id, {
      title: input.title,
      kind: input.kind,
      rawText: input.body,
      sizeBytes: Buffer.byteLength(input.body, 'utf8'),
      fileType: 'text/plain',
      createdById: ctx.userId,
    });
    incrementUsage(ctx.business.id, 'DOCUMENTS', 1, { kind: 'TEXT' });
    return ok({ source, stats: knowledgeStats(ctx.business.id) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'knowledge:write');
    const input = await parseBody(
      request,
      z.object({ id: z.string().min(3) }).and(faqSchema.partial()),
    );
    updateFaq(ctx.business.id, input.id, {
      question: input.question,
      answer: input.answer,
      category: input.category ?? undefined,
      published: input.published,
    });
    return ok({ faqs: listFaqs(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'knowledge:write');
    const input = await parseBody(request, z.object({ id: z.string().min(3), type: z.enum(['source', 'faq']) }));
    if (input.type === 'faq') {
      deleteFaq(ctx.business.id, input.id);
    } else {
      // Read the row first: the uploaded file it points at has to go with it, or every
      // deleted menu/price list keeps occupying storage forever.
      const source = findSource(ctx.business.id, input.id);
      deleteSource(ctx.business.id, input.id);
      if (source?.storage_key) await deleteObject(source.storage_key);
    }
    return ok({ deleted: true, stats: knowledgeStats(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { buildKnowledgeSnapshot, knowledgeStats, listFaqs, listSources } from '@/lib/db/repositories/knowledge';
import { planForBusiness } from '@/lib/db/repositories/platform';
import { KnowledgeWorkspace } from '@/components/dashboard/knowledge-workspace';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Knowledge base' };
export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const ctx = requireTenant(await getSessionContext());
  const { plan } = planForBusiness(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="Everything the AI is allowed to answer from: uploaded documents, pasted knowledge and published FAQs. Retrieval is scoped to your business only."
        meta={
          <>
            <Badge tone="brand">{plan.name} plan</Badge>
            <Badge tone="info">{(plan.limits.storageMb).toLocaleString()} MB storage included</Badge>
          </>
        }
      />
      <KnowledgeWorkspace
        initialSources={listSources(ctx.business.id, 100).map((source) => ({
          id: source.id,
          title: source.title,
          kind: source.kind,
          file_type: source.file_type,
          size_bytes: source.size_bytes,
          chunk_count: source.chunk_count,
          status: source.status,
          created_at: source.created_at,
        }))}
        initialFaqs={listFaqs(ctx.business.id).map((faq) => ({
          id: faq.id,
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
          published: faq.published,
          asked_count: faq.asked_count,
        }))}
        stats={knowledgeStats(ctx.business.id)}
        preview={buildKnowledgeSnapshot(ctx.business.id, 3000)}
        limits={{ storageMb: plan.limits.storageMb, documents: plan.limits.documents }}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { listDocuments } from '@/lib/db/repositories/content';
import { listCustomers } from '@/lib/db/repositories/crm';
import { planForBusiness, usageCount } from '@/lib/db/repositories/platform';
import { DocumentsWorkspace } from '@/components/dashboard/documents-workspace';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const ctx = requireTenant(await getSessionContext());
  const { plan } = planForBusiness(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="Document generator"
        description="Invoices, quotations, receipts, proposals, reports, customer messages, marketing plans and SOPs — drafted by AI, exported as PDF."
        meta={<Badge tone="info">PDF export included</Badge>}
      />
      <DocumentsWorkspace
        initial={listDocuments(ctx.business.id, { limit: 100 }).map((document) => ({
          id: document.id,
          type: document.type,
          number: document.number,
          title: document.title,
          status: document.status,
          customer_name: document.customer_name ?? null,
          total_cents: document.total_cents,
          currency: document.currency,
          issued_at: document.issued_at,
          content: document.content_text,

        }))}
        customers={listCustomers(ctx.business.id, { limit: 300, sort: 'name' }).rows.map((customer) => ({
          id: customer.id,
          name: customer.name,
        }))}
        businessName={ctx.business.name}
        currency={ctx.business.currency}
        usage={{ used: usageCount(ctx.business.id, 'DOCUMENTS'), limit: plan.limits.documents }}
      />
    </div>
  );
}

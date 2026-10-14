import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { allCustomerTags, countCustomers, customerStatusCounts, listCustomers } from '@/lib/db/repositories/crm';
import { CustomersView } from '@/components/dashboard/customers-view';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const ctx = requireTenant(await getSessionContext());
  const result = listCustomers(ctx.business.id, { limit: 100, sort: 'recent' });
  const statuses = customerStatusCounts(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Every customer, lead and VIP in one CRM with full history: purchases, appointments, conversations and notes."
        meta={
          <>
            <Badge tone="info">{countCustomers(ctx.business.id)} customers</Badge>
            {statuses.map((row) => (
              <Badge key={row.status} tone="neutral">
                {row.status.toLowerCase()} {row.c}
              </Badge>
            ))}
          </>
        }
      />
      <CustomersView
        initial={result.rows}
        total={result.total}
        tags={allCustomerTags(ctx.business.id)}
        currency={ctx.business.currency}
      />
    </div>
  );
}

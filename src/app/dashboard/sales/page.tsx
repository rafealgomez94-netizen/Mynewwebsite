import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { leadStageSummary, listLeads } from '@/lib/db/repositories/crm';
import { SalesBoard } from '@/components/dashboard/sales-board';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Sales pipeline' };
export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const ctx = requireTenant(await getSessionContext());
  const leads = listLeads(ctx.business.id, { limit: 200 });
  const summary = leadStageSummary(ctx.business.id);
  const openValue = summary
    .filter((row) => !['WON', 'LOST'].includes(row.stage))
    .reduce((sum, row) => sum + row.value, 0);
  const won = summary.find((row) => row.stage === 'WON')?.c ?? 0;
  const lost = summary.find((row) => row.stage === 'LOST')?.c ?? 0;
  const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Sales pipeline"
        description="New Lead → Contacted → Qualified → Proposal → Negotiation → Won / Lost. AI qualifies, scores and drafts follow-ups."
        meta={
          <>
            <Badge tone="info">Open pipeline {formatMoney(openValue, ctx.business.currency)}</Badge>
            <Badge tone="success">Win rate {winRate.toFixed(1)}%</Badge>
            <Badge tone="neutral">{leads.length} leads</Badge>
          </>
        }
      />
      <SalesBoard initial={leads} currency={ctx.business.currency} />
    </div>
  );
}

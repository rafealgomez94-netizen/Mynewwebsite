import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { listCampaigns, listPosts, marketingCounts } from '@/lib/db/repositories/content';
import { aiAllowanceUsed, planForBusiness } from '@/lib/db/repositories/platform';
import { MarketingWorkspace } from '@/components/dashboard/marketing-workspace';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Marketing' };
export const dynamic = 'force-dynamic';

export default async function MarketingPage() {
  const ctx = requireTenant(await getSessionContext());
  const { plan } = planForBusiness(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="AI marketing workspace"
        description="Generate social posts, adverts, email and SMS campaigns and a content calendar — then edit, approve and publish on your terms."
        meta={<Badge tone="warning">Nothing publishes without your approval</Badge>}
      />
      <MarketingWorkspace
        initialPosts={listPosts(ctx.business.id, { limit: 100 })}
        initialCampaigns={listCampaigns(ctx.business.id, 20).map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          audience: campaign.audience,
          channels: campaign.channels,
          status: campaign.status,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          post_count: campaign.post_count ?? 0,
          approved_count: campaign.approved_count ?? 0,
        }))}
        counts={marketingCounts(ctx.business.id)}
        usage={{ used: aiAllowanceUsed(ctx.business.id), limit: plan.limits.aiMessages }}
      />
    </div>
  );
}

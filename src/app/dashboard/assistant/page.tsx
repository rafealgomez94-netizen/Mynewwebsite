import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { ASSISTANT_EXAMPLES, assistantProviderName } from '@/lib/ai/assistant';
import { aiAllowanceUsed, planForBusiness } from '@/lib/db/repositories/platform';
import { AssistantChat } from '@/components/dashboard/assistant-chat';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'AI assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const ctx = requireTenant(await getSessionContext());
  const { plan } = planForBusiness(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="AI business assistant"
        description="Ask questions in plain language. The assistant answers from your verified business data, your uploaded documents and — clearly labelled — its own recommendations."
        meta={
          <>
            <Badge tone="brand">{assistantProviderName()}</Badge>
            <Badge tone="info">{plan.name} plan</Badge>
          </>
        }
      />
      <AssistantChat
        businessName={ctx.business.name}
        examples={ASSISTANT_EXAMPLES}
        initialUsage={{ used: aiAllowanceUsed(ctx.business.id), limit: plan.limits.aiMessages }}
        provider={assistantProviderName()}
      />
    </div>
  );
}

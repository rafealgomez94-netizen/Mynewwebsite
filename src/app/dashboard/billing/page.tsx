import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { countCustomers } from '@/lib/db/repositories/crm';
import { countMembers } from '@/lib/db/repositories/accounts';
import { listPlans, planForBusiness, usageSnapshot } from '@/lib/db/repositories/platform';
import { BillingWorkspace } from '@/components/dashboard/billing-workspace';
import { PageHeader } from '@/components/dashboard/shared';

export const metadata: Metadata = { title: 'Billing & plan' };
export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const ctx = requireTenant(await getSessionContext());
  const { plan, subscription, entitlement, subscribedPlanCode } = planForBusiness(ctx.business.id);
  const provider = process.env.PAYMENT_PROVIDER || 'manual';

  /**
   * Usage rows for the meter list. AI messages from the staff assistant and from the public support
   * widget draw on the same `aiMessages` allowance in the API, so they are shown as one meter —
   * two bars each reading "60 / 100" would hide the moment the workspace actually runs out.
   */
  const snapshot = usageSnapshot(ctx.business.id);
  const limitFor: Record<string, number> = {
    CUSTOMERS: plan.limits.customers,
    DOCUMENTS: plan.limits.documents,
    AI_MESSAGES: plan.limits.aiMessages,
    STORAGE_BYTES: plan.limits.storageMb * 1024 * 1024,
    SUPPORT_MESSAGES: plan.limits.aiMessages,
    WHATSAPP_MESSAGES: plan.limits.whatsappMessages,
  };
  const aiMessages = snapshot
    .filter((row) => row.metric === 'AI_MESSAGES' || row.metric === 'SUPPORT_MESSAGES')
    .reduce((total, row) => total + row.count, 0);
  const usageRows = snapshot
    .filter((row) => row.metric !== 'SUPPORT_MESSAGES')
    .map((row) => ({
      metric: row.metric,
      quantity: row.metric === 'AI_MESSAGES' ? aiMessages : row.count,
      limit: limitFor[row.metric] ?? plan.limits.customers,
    }));

  return (
    <div>
      <PageHeader
        title="Billing & plan"
        description="Compare plans, see exactly how much of your allowance you have used, and change plan at any time. Limits are enforced server-side."
      />
      <BillingWorkspace
        plans={listPlans().map((entry) => ({
          code: entry.code,
          name: entry.name,
          description: entry.tagline,
          priceMonthlyCents: entry.priceMonthCents,
          priceYearlyCents: entry.priceYearCents,
          limits: entry.limits,
          features: entry.features,
        }))}
        currentPlan={plan.code}
        subscribedPlanCode={subscribedPlanCode}
        entitlement={{ entitled: entitlement.entitled, reason: entitlement.reason, accessUntil: entitlement.accessUntil }}
        subscription={
          subscription
            ? {
                plan_code: subscription.plan_code,
                billing_cycle: subscription.billing_cycle,
                status: subscription.status,
                provider: subscription.provider,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                trial_ends_at: subscription.trial_ends_at,
              }
            : null
        }
        usage={usageRows}
        counts={{ customers: countCustomers(ctx.business.id), users: countMembers(ctx.business.id) }}
        payments={{
          provider,
          configured: provider === 'stripe' ? Boolean(process.env.STRIPE_SECRET_KEY) : true,
        }}
        currency={ctx.business.currency}
      />
    </div>
  );
}

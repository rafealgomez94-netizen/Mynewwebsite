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
  const { plan, subscription } = planForBusiness(ctx.business.id);
  const provider = process.env.PAYMENT_PROVIDER || 'manual';

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
        usage={usageSnapshot(ctx.business.id).map((row) => ({
          metric: row.metric,
          quantity: row.count,
          limit:
            row.metric === 'CUSTOMERS'
              ? plan.limits.customers
              : row.metric === 'DOCUMENTS'
                ? plan.limits.documents
                : row.metric === 'AI_MESSAGES'
                  ? plan.limits.aiMessages
                  : row.metric === 'STORAGE_BYTES'
                    ? plan.limits.storageMb * 1024 * 1024
                    : row.metric === 'SUPPORT_MESSAGES'
                      ? plan.limits.aiMessages
                      : row.metric === 'WHATSAPP_MESSAGES'
                        ? plan.limits.whatsappMessages
                        : plan.limits.customers,
        }))}
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

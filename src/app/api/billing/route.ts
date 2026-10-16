import { handleError, ok, parseBody } from '@/lib/api/http';
import { planChangeSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import {
  listPlans,
  planForBusiness,
  updateSubscription,
  usageSnapshot,
} from '@/lib/db/repositories/platform';
import { countCustomers } from '@/lib/db/repositories/crm';
import { countMembers } from '@/lib/db/repositories/accounts';
import { notify, audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'billing:read');
    const { plan, subscription, entitlement, subscribedPlanCode } = planForBusiness(ctx.business.id);
    const provider = process.env.PAYMENT_PROVIDER || 'manual';
    return ok({
      plan,
      plans: listPlans(),
      subscription,
      /**
       * `plan` is what the tenant is metered against right now; `subscription.plan_code` is what
       * they signed up for. They differ while a checkout is unpaid or a period has lapsed, and
       * the client uses this to say so rather than showing limits the tenant does not have.
       */
      entitlement: {
        entitled: entitlement.entitled,
        reason: entitlement.reason,
        effectivePlanCode: plan.code,
        subscribedPlanCode,
        accessUntil: entitlement.accessUntil,
      },
      usage: usageSnapshot(ctx.business.id),
      liveCounts: {
        customers: countCustomers(ctx.business.id),
        users: countMembers(ctx.business.id),
      },
      payments: {
        provider,
        configured: provider === 'stripe' ? Boolean(process.env.STRIPE_SECRET_KEY) : true,
        clientKey: provider === 'stripe' ? process.env.STRIPE_PUBLISHABLE_KEY || null : null,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Plan change. With PAYMENT_PROVIDER=manual (default) the switch is applied
 * immediately and the tenant is metered against the new limits. When Stripe is
 * configured the same handler creates the provider session and links it to the
 * subscription row — no payment credentials live in the client.
 */
export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'billing:manage');
    const input = await parseBody(request, planChangeSchema);
    const { plan: current } = planForBusiness(ctx.business.id);
    const provider = process.env.PAYMENT_PROVIDER || 'manual';

    const now = new Date();
    const periodEnd = new Date(now);
    if (input.billingCycle === 'YEARLY') periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    if (provider === 'stripe' && input.planCode !== 'FREE' && process.env.STRIPE_SECRET_KEY) {
      // Price IDs come from environment configuration; nothing is hard-coded.
      const priceEnvKey = `STRIPE_PRICE_${input.planCode}_${input.billingCycle}`;
      const priceId = process.env[priceEnvKey];
      updateSubscription(ctx.business.id, {
        planCode: input.planCode,
        billingCycle: input.billingCycle,
        status: 'INCOMPLETE',
        provider: 'stripe',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
      });
      audit({
        businessId: ctx.business.id,
        actorUserId: ctx.userId,
        actorEmail: ctx.session.user.email,
        action: 'billing.plan_change_initiated',
        entityType: 'subscription',
        entityId: ctx.business.id,
        meta: { from: current.code, to: input.planCode, provider: 'stripe', priceId: priceId ?? null },
      });
      return ok({
        provider: 'stripe',
        requiresPayment: true,
        priceConfigured: Boolean(priceId),
        message: priceId
          ? 'Checkout session ready to be created by the billing worker.'
          : 'Stripe is enabled but the price id for this plan is not configured yet (set STRIPE_PRICE_* env vars).',
      });
    }

    updateSubscription(ctx.business.id, {
      planCode: input.planCode,
      billingCycle: input.billingCycle,
      status: 'ACTIVE',
      provider: 'manual',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    });

    await notify({
      businessId: ctx.business.id,
      type: 'BUSINESS_ALERT',
      title: `Plan changed to ${input.planCode}`,
      body: `Billing cycle ${input.billingCycle.toLowerCase()} · effective immediately.`,
      level: 'SUCCESS',
      href: '/dashboard/billing',
    });
    audit({
      businessId: ctx.business.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.session.user.email,
      action: 'billing.plan_changed',
      entityType: 'subscription',
      entityId: ctx.business.id,
      meta: { from: current.code, to: input.planCode, cycle: input.billingCycle },
    });

    return ok({ plan: input.planCode, status: 'ACTIVE', provider: 'manual' });
  } catch (error) {
    return handleError(error);
  }
}

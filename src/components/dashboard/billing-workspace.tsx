'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CreditCard, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Progress, Select, StatusBadge, apiRequest, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/utils';

type Plan = {
  code: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  limits: { customers: number; users: number; aiMessages: number; documents: number; storageMb: number };
  features: string[];
};

type Subscription = {
  plan_code: string;
  billing_cycle: string;
  status: string;
  provider: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
} | null;

const METRIC_LABELS: Record<string, string> = {
  CUSTOMERS: 'Customers',
  USERS: 'Team members',
  AI_MESSAGES: 'AI messages',
  DOCUMENTS: 'Documents',
  SUPPORT_MESSAGES: 'Support messages',
  STORAGE_BYTES: 'Storage',
  WHATSAPP_MESSAGES: 'WhatsApp messages',
};

export function BillingWorkspace({
  plans,
  currentPlan,
  subscription,
  usage,
  counts,
  payments,
  currency,
  children,
}: {
  plans: Plan[];
  currentPlan: string;
  subscription: Subscription;
  usage: { metric: string; quantity: number; limit: number }[];
  counts: { customers: number; users: number };
  payments: { provider: string; configured: boolean };
  currency: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>(
    subscription?.billing_cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
  );
  const [busy, setBusy] = useState<string | null>(null);

  const change = async (planCode: string) => {
    setBusy(planCode);
    const result = await apiRequest<{ requiresPayment?: boolean }>('/api/billing', {
      body: { planCode, billingCycle: cycle },
    });
    setBusy(null);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(
      result.data.requiresPayment
        ? 'Plan selected — complete payment through the provider to activate'
        : `You are now on the ${planCode} plan`,
      'success',
    );
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Current subscription"
          description="Plan limits are enforced by the API — no surprises, no silent overages."
          action={
            <div className="flex items-center gap-2">
              <StatusBadge status={subscription?.status ?? 'ACTIVE'} />
              <Badge tone="brand">{payments.provider === 'stripe' ? 'Stripe' : 'Manual billing'}</Badge>
            </div>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Plan</p>
            <p className="text-sm font-semibold">{plans.find((plan) => plan.code === currentPlan)?.name ?? currentPlan}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Billing cycle</p>
            <p className="text-sm font-semibold">{subscription?.billing_cycle ?? 'MONTHLY'}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-xs">Renews / ends</p>
            <p className="text-sm font-semibold">
              {subscription?.current_period_end ? formatDate(subscription.current_period_end) : '—'}
            </p>
          </div>
        </div>
        {!payments.configured ? (
          <Alert tone="warning" title="Payment provider not configured">
            Add STRIPE_SECRET_KEY and STRIPE_PRICE_&lt;PLAN&gt;_&lt;CYCLE&gt; environment variables to take payments
            online. Until then plan changes are applied immediately and recorded in the audit log.
          </Alert>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Usage this period"
          description="Metered from real activity. When you reach a limit the API returns a clear upgrade prompt instead of failing silently."
          action={
            <Select value={cycle} onChange={(event) => setCycle(event.target.value as 'MONTHLY' | 'YEARLY')} className="w-auto text-xs">
              <option value="MONTHLY">Price per month</option>
              <option value="YEARLY">Price per year (2 months free)</option>
            </Select>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {usage.map((row) => (
            <div key={row.metric}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>{METRIC_LABELS[row.metric] ?? row.metric}</span>
                <span className="muted">
                  {row.metric === 'STORAGE_BYTES'
                    ? `${(row.quantity / 1024 / 1024).toFixed(2)} / ${(row.limit / 1024 / 1024).toFixed(0)} MB`
                    : `${row.quantity} / ${row.limit}`}
                </span>
              </div>
              <Progress
                value={row.limit > 0 ? Math.min(100, (row.quantity / row.limit) * 100) : 0}
                tone={row.limit > 0 && row.quantity / row.limit > 0.85 ? 'warning' : 'brand'}
              />
            </div>
          ))}
        </div>
        <p className="muted mt-3 text-xs">
          Live counts: {counts.customers} customers on file · {counts.users} team members in this workspace.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const current = plan.code === currentPlan;
          const price = cycle === 'YEARLY' ? plan.priceYearlyCents : plan.priceMonthlyCents;
          return (
            <Card key={plan.code} className={current ? 'ring-2 ring-brand-500' : ''}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                {current ? <Badge tone="brand">Current</Badge> : null}
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {price === 0 ? 'Free' : formatMoney(price, currency)}
                {price !== 0 ? <span className="muted text-xs font-normal">/{cycle === 'YEARLY' ? 'year' : 'month'}</span> : null}
              </p>
              <p className="muted mt-1 text-xs">{plan.description}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {plan.features.slice(0, 6).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="muted mt-3 space-y-0.5 text-xs">
                <p>{plan.limits.customers.toLocaleString()} customers</p>
                <p>{plan.limits.users} team members</p>
                <p>{plan.limits.aiMessages.toLocaleString()} AI messages / month</p>
                <p>{plan.limits.documents.toLocaleString()} documents</p>
                <p>{(plan.limits.storageMb / 1024).toFixed(1)} GB storage</p>
              </div>
              <Button
                className="mt-4 w-full"
                variant={current ? 'secondary' : 'primary'}
                disabled={current}
                loading={busy === plan.code}
                onClick={() => change(plan.code)}
              >
                {current ? 'Current plan' : (
                  <>
                    <Sparkles className="h-4 w-4" /> Switch to {plan.name}
                  </>
                )}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Billing history & payment method"
          description="Payment credentials are never stored in this application — the provider handles them directly."
          action={<CreditCard className="h-4 w-4 text-brand-600" />}
        />
        <ul className="muted space-y-1 text-sm">
          <li>Provider: {payments.provider}</li>
          <li>Customer and subscription IDs are linked on the subscription record, not in the browser.</li>
          <li>Every plan change is written to the audit log with the acting user and timestamp.</li>
        </ul>
        {children}
      </Card>
    </div>
  );
}

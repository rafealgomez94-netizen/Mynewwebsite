import { all, get, json, nowIso, run, scalar, toJson } from '@/lib/db';
import { newId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export type PlanLimits = {
  customers: number;
  users: number;
  aiMessages: number;
  documents: number;
  whatsappMessages: number;
  storageMb: number;
  appointments: number;
  products: number;
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  priceMonthCents: number;
  priceYearCents: number;
  currency: string;
  limits: PlanLimits;
  features: string[];
  sortOrder: number;
};

export const PLAN_CATALOGUE: (Omit<Plan, 'id'> & { id: string })[] = [
  {
    id: 'plan_free',
    code: 'FREE',
    name: 'Free',
    tagline: 'Get organised and try the AI assistant.',
    priceMonthCents: 0,
    priceYearCents: 0,
    currency: 'USD',
    limits: {
      customers: 100,
      users: 2,
      aiMessages: 100,
      documents: 10,
      whatsappMessages: 200,
      storageMb: 50,
      appointments: 100,
      products: 50,
    },
    features: [
      '1 business workspace',
      'Up to 100 customers',
      'AI business assistant (100 messages / month)',
      'Appointments, tasks and notifications',
      'AI customer support widget',
      'Basic reports',
    ],
    sortOrder: 1,
  },
  {
    id: 'plan_starter',
    code: 'STARTER',
    name: 'Starter',
    tagline: 'For solo founders and small teams going digital.',
    priceMonthCents: 2900,
    priceYearCents: 29000,
    currency: 'USD',
    limits: {
      customers: 2000,
      users: 5,
      aiMessages: 2000,
      documents: 200,
      whatsappMessages: 3000,
      storageMb: 2000,
      appointments: 5000,
      products: 1000,
    },
    features: [
      'Everything in Free',
      'Sales pipeline and lead scoring',
      'Inventory with low-stock alerts',
      'Document generator with PDF export',
      'Marketing assistant',
      'Weekly + monthly reports',
    ],
    sortOrder: 2,
  },
  {
    id: 'plan_professional',
    code: 'PROFESSIONAL',
    name: 'Professional',
    tagline: 'Automate operations across a growing team.',
    priceMonthCents: 7900,
    priceYearCents: 79000,
    currency: 'USD',
    limits: {
      customers: 20000,
      users: 25,
      aiMessages: 12000,
      documents: 2000,
      whatsappMessages: 15000,
      storageMb: 10000,
      appointments: 50000,
      products: 10000,
    },
    features: [
      'Everything in Starter',
      'AI analytics with recommendations',
      'Multi-staff scheduling and availability',
      'Knowledge base with document training',
      'Automated daily / weekly / monthly reports',
      'Role-based access control and audit logs',
    ],
    sortOrder: 3,
  },
  {
    id: 'plan_business',
    code: 'BUSINESS',
    name: 'Business',
    tagline: 'Multi-location operations with priority support.',
    priceMonthCents: 19900,
    priceYearCents: 199000,
    currency: 'USD',
    limits: {
      customers: 200000,
      users: 200,
      aiMessages: 60000,
      documents: 20000,
      whatsappMessages: 100000,
      storageMb: 100000,
      appointments: 500000,
      products: 100000,
    },
    features: [
      'Everything in Professional',
      'Multi-location workspaces',
      'Integrations (WhatsApp, payments, calendar)',
      'Advanced analytics and forecasting',
      'Priority support and onboarding',
      'Custom AI tone and escalation rules',
    ],
    sortOrder: 4,
  },
];

export function ensurePlans(): void {
  const existing = scalar<number>(`SELECT count(*) AS c FROM plans`, [], 0);
  if (existing >= PLAN_CATALOGUE.length) return;
  const now = nowIso();
  for (const plan of PLAN_CATALOGUE) {
    run(
      `INSERT INTO plans (id, code, name, tagline, price_month_cents, price_year_cents, currency, limits_json,
                          features_json, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name = excluded.name, tagline = excluded.tagline,
         price_month_cents = excluded.price_month_cents, price_year_cents = excluded.price_year_cents,
         limits_json = excluded.limits_json, features_json = excluded.features_json, updated_at = excluded.updated_at`,
      [
        plan.id,
        plan.code,
        plan.name,
        plan.tagline,
        plan.priceMonthCents,
        plan.priceYearCents,
        plan.currency,
        toJson(plan.limits),
        toJson(plan.features),
        plan.sortOrder,
        now,
        now,
      ],
    );
  }
}

export function listPlans(): Plan[] {
  ensurePlans();
  return all<{
    id: string;
    code: string;
    name: string;
    tagline: string | null;
    price_month_cents: number;
    price_year_cents: number;
    currency: string;
    limits_json: string;
    features_json: string;
    sort_order: number;
  }>(`SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC`).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    tagline: row.tagline,
    priceMonthCents: row.price_month_cents,
    priceYearCents: row.price_year_cents,
    currency: row.currency,
    limits: json<PlanLimits>(row.limits_json, {
      customers: 100,
      users: 2,
      aiMessages: 100,
      documents: 10,
      whatsappMessages: 200,
      storageMb: 50,
      appointments: 100,
      products: 50,
    }),
    features: json<string[]>(row.features_json, []),
    sortOrder: row.sort_order,
  }));
}

/**
 * Currency a workspace starts in when the client does not choose one. The platform is built for
 * Liberia and West Africa, so Liberian dollars are the default; set DEFAULT_CURRENCY to change it
 * for another market (for example GHS or NGN) without touching code.
 */
export const DEFAULT_CURRENCY = (process.env.DEFAULT_CURRENCY || 'LRD').toUpperCase();

export function findPlan(code: string): Plan | undefined {
  return listPlans().find((plan) => plan.code === code);
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
export type SubscriptionRow = {
  id: string;
  business_id: string;
  plan_code: string;
  status: string;
  provider: string;
  billing_cycle: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  trial_ends_at: string | null;
  seats: number;
  created_at: string;
  updated_at: string;
};

export function createSubscription(businessId: string, planCode = 'FREE', provider = 'manual'): SubscriptionRow {
  ensurePlans();
  const id = newId('sub');
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const trialEnd = new Date(now);
  trialEnd.setUTCDate(trialEnd.getUTCDate() + 14);
  run(
    `INSERT INTO subscriptions (id, business_id, plan_code, status, provider, billing_cycle, current_period_start,
                                current_period_end, trial_ends_at, created_at, updated_at)
     VALUES (?, ?, ?, 'TRIALING', ?, 'MONTHLY', ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      planCode,
      provider,
      now.toISOString(),
      periodEnd.toISOString(),
      trialEnd.toISOString(),
      now.toISOString(),
      now.toISOString(),
    ],
  );
  return getSubscription(businessId)!;
}

export function getSubscription(businessId: string): SubscriptionRow | undefined {
  return get<SubscriptionRow>(`SELECT * FROM subscriptions WHERE business_id = ?`, [businessId]);
}

export function updateSubscription(businessId: string, patch: Record<string, unknown>): void {
  const map: Record<string, string> = {
    planCode: 'plan_code',
    status: 'status',
    provider: 'provider',
    providerCustomerId: 'provider_customer_id',
    providerSubscriptionId: 'provider_subscription_id',
    billingCycle: 'billing_cycle',
    currentPeriodStart: 'current_period_start',
    currentPeriodEnd: 'current_period_end',
    cancelAtPeriodEnd: 'cancel_at_period_end',
    seats: 'seats',
  };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in patch && patch[key] !== undefined) {
      const value = patch[key];
      sets.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : ((value as string | number | null) ?? null));
    }
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId);
  run(`UPDATE subscriptions SET ${sets.join(', ')} WHERE business_id = ?`, params);
}

/**
 * A subscription only unlocks the plan it names while it is actually in force.
 *
 * Stripe checkout writes the row with status INCOMPLETE *before* the customer pays, and a
 * subscription that lapsed or was cancelled keeps its plan_code forever. Reading plan_code
 * alone therefore handed paid limits to people who never paid, so entitlement is decided from
 * the status plus the paid period instead:
 *
 *   ACTIVE            — in force until current_period_end
 *   TRIALING          — in force until the later of current_period_end / trial_ends_at
 *   PAST_DUE          — a real paid relationship with a failed renewal: keep access while the
 *                       period they paid for is still open, then fall back to FREE
 *   CANCELED          — keeps the plan until current_period_end (cancel_at_period_end semantics)
 *   anything else     — INCOMPLETE, UNPAID, EXPIRED, unknown: FREE
 */
const STATUSES_THAT_KEEP_THE_PLAN = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED']);

export type Entitlement = {
  /** Whether the plan named by the subscription is currently in force. */
  entitled: boolean;
  /** Machine-readable why, surfaced in billing responses and logs. */
  reason: string;
  /** The plan the tenant is actually metered against. */
  planCode: string;
  /** When access to a paid plan ends, if a period is known. */
  accessUntil: string | null;
};

export function subscriptionEntitlement(
  subscription: SubscriptionRow | undefined,
  now = new Date(),
): Entitlement {
  if (!subscription) {
    return { entitled: false, reason: 'no_subscription', planCode: 'FREE', accessUntil: null };
  }
  const code = subscription.plan_code;
  if (code === 'FREE') {
    return { entitled: false, reason: 'free_plan', planCode: 'FREE', accessUntil: null };
  }
  if (!STATUSES_THAT_KEEP_THE_PLAN.has(subscription.status)) {
    return {
      entitled: false,
      reason: `status:${subscription.status}`,
      planCode: 'FREE',
      accessUntil: null,
    };
  }

  const candidates: string[] = [];
  if (subscription.current_period_end) candidates.push(subscription.current_period_end);
  if (subscription.status === 'TRIALING' && subscription.trial_ends_at) {
    candidates.push(subscription.trial_ends_at);
  }
  const accessUntil = candidates.sort().at(-1) ?? null;
  if (!accessUntil) {
    // No period recorded (a provider-managed row mid-webhook): trust an ACTIVE status.
    const entitled = subscription.status === 'ACTIVE';
    return {
      entitled,
      reason: entitled ? 'active_without_period' : 'missing_period',
      planCode: entitled ? code : 'FREE',
      accessUntil: null,
    };
  }
  if (new Date(accessUntil).getTime() <= now.getTime()) {
    return { entitled: false, reason: 'period_ended', planCode: 'FREE', accessUntil };
  }
  const reason =
    subscription.status === 'PAST_DUE'
      ? 'past_due_within_period'
      : subscription.status === 'CANCELED'
        ? 'canceled_but_period_open'
        : subscription.status.toLowerCase();
  return { entitled: true, reason, planCode: code, accessUntil };
}

/**
 * The plan a tenant is metered against, plus what it is paying for. When a subscription is not
 * in force `plan` is FREE while `subscribedPlanCode` still shows what the row claims, so callers
 * can explain the difference instead of silently showing paid limits the tenant does not have.
 */
export function planForBusiness(businessId: string): {
  plan: Plan;
  subscription?: SubscriptionRow;
  entitlement: Entitlement;
  subscribedPlanCode: string | null;
} {
  const subscription = getSubscription(businessId);
  const entitlement = subscriptionEntitlement(subscription);
  const plan = findPlan(entitlement.planCode) ?? findPlan('FREE')!;
  return {
    plan,
    subscription,
    entitlement,
    subscribedPlanCode: subscription?.plan_code ?? null,
  };
}

export function subscriptionStats() {
  return all<{ plan_code: string; status: string; c: number }>(
    `SELECT plan_code, status, count(*) AS c FROM subscriptions GROUP BY plan_code, status`,
  );
}

// ---------------------------------------------------------------------------
// Usage metering
// ---------------------------------------------------------------------------
export type UsageMetric =
  | 'AI_MESSAGES'
  | 'DOCUMENTS'
  | 'CUSTOMERS'
  | 'USERS'
  | 'STORAGE_BYTES'
  | 'SUPPORT_MESSAGES'
  | 'WHATSAPP_MESSAGES';

export function currentPeriodKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function incrementUsage(businessId: string, metric: UsageMetric, quantity = 1, meta?: unknown): number {
  const period = currentPeriodKey();
  const now = nowIso();
  run(
    `INSERT INTO usage_counters (id, business_id, metric, period_key, count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(business_id, metric, period_key) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
    [newId('usg'), businessId, metric, period, quantity, now],
  );
  run(
    `INSERT INTO usage_events (id, business_id, metric, quantity, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [newId('use'), businessId, metric, quantity, meta ? toJson(meta) : null, now],
  );
  return usageCount(businessId, metric);
}

export function usageCount(businessId: string, metric: UsageMetric, period = currentPeriodKey()): number {
  return (
    get<{ count: number }>(
      `SELECT count FROM usage_counters WHERE business_id = ? AND metric = ? AND period_key = ?`,
      [businessId, metric, period],
    )?.count ?? 0
  );
}

export function usageSnapshot(businessId: string, period = currentPeriodKey()) {
  return all<{ metric: string; count: number }>(
    `SELECT metric, count FROM usage_counters WHERE business_id = ? AND period_key = ? ORDER BY metric`,
    [businessId, period],
  );
}

export function usageSeries(businessId: string, metric: UsageMetric, days = 30) {
  return all<{ day: string; total: number }>(
    `SELECT substr(created_at, 1, 10) AS day, coalesce(sum(quantity), 0) AS total FROM usage_events
     WHERE business_id = ? AND metric = ? AND created_at >= ? GROUP BY day ORDER BY day ASC`,
    [businessId, metric, new Date(Date.now() - days * 86400000).toISOString()],
  );
}

export function platformUsageTotals(sinceIso: string) {
  return all<{ metric: string; total: number }>(
    `SELECT metric, coalesce(sum(quantity), 0) AS total FROM usage_events WHERE created_at >= ? GROUP BY metric`,
    [sinceIso],
  );
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------
export function listIntegrations(businessId: string) {
  return all<{ id: string; provider: string; status: string; config_json: string | null; updated_at: string }>(
    `SELECT id, provider, status, config_json, updated_at FROM integrations WHERE business_id = ? ORDER BY provider`,
    [businessId],
  );
}

export function upsertIntegration(businessId: string, provider: string, status: string, config?: unknown): void {
  const now = nowIso();
  run(
    `INSERT INTO integrations (id, business_id, provider, status, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(business_id, provider) DO UPDATE SET status = excluded.status, config_json = excluded.config_json,
       updated_at = excluded.updated_at`,
    [newId('int'), businessId, provider, status, config ? toJson(config) : null, now, now],
  );
}

// ---------------------------------------------------------------------------
// Platform (SaaS operator) metrics — aggregate only, never tenant payloads
// ---------------------------------------------------------------------------
export function platformMetrics(sinceIso: string) {
  const businesses = scalar<number>(`SELECT count(*) AS c FROM businesses`, [], 0);
  const users = scalar<number>(`SELECT count(*) AS c FROM users`, [], 0);
  const customers = scalar<number>(`SELECT count(*) AS c FROM customers`, [], 0);
  const orders = scalar<number>(`SELECT count(*) AS c FROM orders`, [], 0);
  const revenue = scalar<number>(
    `SELECT coalesce(sum(total_cents), 0) AS c FROM orders WHERE status != 'CANCELLED'`,
    [],
    0,
  );
  const aiRuns = scalar<number>(`SELECT count(*) AS c FROM ai_runs`, [], 0);
  const aiRunsPeriod = scalar<number>(`SELECT count(*) AS c FROM ai_runs WHERE created_at >= ?`, [sinceIso], 0);
  const tokens = scalar<number>(
    `SELECT coalesce(sum(tokens_in + tokens_out), 0) AS c FROM ai_runs`,
    [],
    0,
  );
  const tickets = scalar<number>(`SELECT count(*) AS c FROM support_tickets`, [], 0);
  const openTickets = scalar<number>(
    `SELECT count(*) AS c FROM support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS')`,
    [],
    0,
  );
  const conversations = scalar<number>(`SELECT count(*) AS c FROM conversations`, [], 0);
  const newBusinesses = scalar<number>(`SELECT count(*) AS c FROM businesses WHERE created_at >= ?`, [sinceIso], 0);
  const newUsers = scalar<number>(`SELECT count(*) AS c FROM users WHERE created_at >= ?`, [sinceIso], 0);
  const mrr = get<{ mrr: number }>(
    `SELECT coalesce(sum(pl.price_month_cents), 0) AS mrr
     FROM subscriptions s JOIN plans pl ON pl.code = s.plan_code
     WHERE s.status IN ('ACTIVE', 'TRIALING')`,
  )?.mrr ?? 0;
  return {
    businesses,
    users,
    customers,
    orders,
    revenueCents: revenue,
    mrrCents: mrr,
    aiRuns,
    aiRunsPeriod,
    tokens,
    tickets,
    openTickets,
    conversations,
    newBusinesses,
    newUsers,
  };
}

export function platformBusinessUsage(limit = 50) {
  return all<{
    id: string;
    name: string;
    type: string;
    created_at: string;
    plan_code: string | null;
    subscription_status: string | null;
    users: number;
    customers: number;
    ai_runs: number;
    storage_bytes: number;
  }>(
    `SELECT b.id, b.name, b.type, b.created_at, s.plan_code, s.status AS subscription_status,
       (SELECT count(*) FROM business_members m WHERE m.business_id = b.id) AS users,
       (SELECT count(*) FROM customers c WHERE c.business_id = b.id) AS customers,
       (SELECT count(*) FROM ai_runs a WHERE a.business_id = b.id) AS ai_runs,
       (SELECT coalesce(sum(size_bytes), 0) FROM knowledge_sources k WHERE k.business_id = b.id) AS storage_bytes
     FROM businesses b LEFT JOIN subscriptions s ON s.business_id = b.id
     ORDER BY b.created_at DESC LIMIT ?`,
    [limit],
  );
}

export function platformSupportTickets(limit = 100) {
  return all<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    escalated_from_ai: number;
    business_id: string;
    business_name: string | null;
    description: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    created_at: string;
  }>(
    `SELECT t.id, t.subject, t.status, t.priority, t.escalated_from_ai, t.business_id, b.name AS business_name,
            t.description, t.contact_name, t.contact_email, t.contact_phone, t.created_at
     FROM support_tickets t LEFT JOIN businesses b ON b.id = t.business_id
     ORDER BY CASE t.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, t.created_at DESC LIMIT ?`,
    [limit],
  );
}

// ---------------------------------------------------------------------------
// Public contact / demo requests
// ---------------------------------------------------------------------------
export function createContactMessage(input: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  topic?: string | null;
  message: string;
  source?: string | null;
}) {
  const id = newId('ctm');
  run(
    `INSERT INTO contact_messages (id, name, email, phone, company, topic, message, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.email,
      input.phone ?? null,
      input.company ?? null,
      input.topic ?? 'demo',
      input.message,
      input.source ?? 'website',
      nowIso(),
    ],
  );
  return id;
}

export function listContactMessages(limit = 100) {
  return all<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    topic: string | null;
    message: string;
    status: string;
    created_at: string;
  }>(`SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export function contactMessagesSince(sinceIso: string): number {
  return scalar<number>(`SELECT count(*) AS c FROM contact_messages WHERE created_at >= ?`, [sinceIso], 0);
}

export function seedDemoUsage(businessId: string, metric: string, quantity: number, createdAt: string) {
  run(
    `INSERT INTO usage_events (id, business_id, metric, quantity, created_at) VALUES (?, ?, ?, ?, ?)`,
    [newId('use'), businessId, metric, quantity, createdAt],
  );
  const period = createdAt.slice(0, 7);
  run(
    `INSERT INTO usage_counters (id, business_id, metric, period_key, count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(business_id, metric, period_key) DO UPDATE SET count = count + excluded.count`,
    [newId('usg'), businessId, metric, period, quantity, nowIso()],
  );
}

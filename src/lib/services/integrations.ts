/**
 * Integration registry.
 *
 * What this is: the honest state of the three integrations the platform actually has — WhatsApp
 * handoff, payments and email delivery — read from the deployment's server environment, plus the
 * per-workspace settings a tenant may keep for each one (payment mode, the support number the
 * public pages use, the address escalations are sent to).
 *
 * What this is not: it does not call WhatsApp, Stripe or an SMTP server to prove anything, and it
 * never stores credentials. Secrets stay in server environment variables (see .env.example); this
 * module only reports whether a variable is present, and a workspace can only store non-secret
 * configuration such as an account label or a phone number it already publishes.
 */
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, whatsappHref } from '@/lib/domain';

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED';

export type IntegrationProvider = {
  id: 'WHATSAPP' | 'PAYMENTS' | 'EMAIL';
  name: string;
  /** What the workspace gets from it, in plain language. */
  purpose: string;
  /** Environment variables that supply the credentials for this deployment. */
  credentialEnv: string[];
  /** Non-secret fields a workspace may store. */
  configFields: { key: string; label: string; placeholder: string }[];
  /** How to tell whether this deployment has what it needs. */
  check: () => { configured: boolean; detail: string };
};

function shortList(values: string[], limit = 2): string {
  const present = values.slice(0, limit);
  return present.length ? present.join(', ') : '—';
}

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: 'WHATSAPP',
    name: 'WhatsApp',
    purpose:
      'The channel your customers already use: the support widget leaves a click-to-chat link, booking confirmations and reminders reference it, and WhatsApp conversations are logged in the inbox.',
    credentialEnv: ['NEXT_PUBLIC_SUPPORT_WHATSAPP', 'NEXT_PUBLIC_SUPPORT_DIAL_CODE'],
    configFields: [
      { key: 'number', label: 'Number customers should message', placeholder: '0774075285' },
      { key: 'handoffMessage', label: 'Greeting used in the click-to-chat link', placeholder: 'Hello, I have a question' },
    ],
    check: () => ({
      configured: Boolean(SUPPORT_WHATSAPP),
      detail: SUPPORT_WHATSAPP
        ? `Click-to-chat links resolve to ${whatsappHref('').replace('https://wa.me/', '+')}`
        : 'No WhatsApp number is configured for this deployment',
    }),
  },
  {
    id: 'PAYMENTS',
    name: 'Payments',
    purpose:
      'How plan changes are billed. In manual mode a plan change is applied and recorded in the audit log; with Stripe configured the same action prepares a checkout session against your own account.',
    credentialEnv: ['PAYMENT_PROVIDER', 'PAYMENT_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_<PLAN>_<CYCLE>'],
    configFields: [
      { key: 'accountLabel', label: 'Account label (for your own reference)', placeholder: 'Main business account' },
      { key: 'billingEmail', label: 'Where invoices should be sent', placeholder: SUPPORT_EMAIL },
    ],
    check: () => {
      const provider = process.env.PAYMENT_PROVIDER || 'manual';
      if (provider === 'stripe') {
        const configured = Boolean(process.env.STRIPE_SECRET_KEY);
        return {
          configured,
          detail: configured
            ? 'Stripe mode with a server-side secret key; plan prices come from STRIPE_PRICE_* variables'
            : 'Stripe is selected but STRIPE_SECRET_KEY is not set, so plan changes stay manual',
        };
      }
      return {
        configured: true,
        detail: 'Manual billing: plan changes apply immediately and are written to the audit log',
      };
    },
  },
  {
    id: 'EMAIL',
    name: 'Email delivery',
    purpose:
      'Verification, password reset, team invitations, appointment reminders and escalation notices. Without SMTP credentials the platform writes those messages to the server log instead of sending them.',
    credentialEnv: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'],
    configFields: [
      { key: 'replyTo', label: 'Reply-to address for customer email', placeholder: SUPPORT_EMAIL },
    ],
    check: () => {
      const host = process.env.SMTP_HOST;
      const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].filter((key) => !process.env[key]);
      return {
        configured: Boolean(host),
        detail: host
          ? `Delivering through ${host}${missing.length ? ` (optional: ${shortList(missing, 3)} not set)` : ''}`
          : 'No SMTP host configured — email is written to the server console in this deployment',
      };
    },
  },
];

export function findProvider(id: string): IntegrationProvider | undefined {
  return INTEGRATION_PROVIDERS.find((provider) => provider.id === id.toUpperCase());
}

export type IntegrationRow = {
  provider: string;
  status: string;
  config: Record<string, string>;
  updatedAt: string;
  /** Whether the provider's credentials exist in this deployment. */
  configured: boolean;
  /** Human-readable state of the deployment's credentials. */
  detail: string;
};

/**
 * Merges stored rows with the deployment's actual configuration. A provider whose credentials are
 * missing can still be marked CONNECTED by a workspace, but `configured` stays false and `detail`
 * says why — the UI shows both rather than pretending the integration works.
 */
export function describeIntegrations(
  rows: { provider: string; status: string; config_json: string | null; updated_at: string }[],
): IntegrationRow[] {
  const stored = new Map(rows.map((row) => [row.provider.toUpperCase(), row]));
  return INTEGRATION_PROVIDERS.map((provider) => {
    const row = stored.get(provider.id);
    const check = provider.check();
    let config: Record<string, string> = {};
    if (row?.config_json) {
      try {
        const parsed = JSON.parse(row.config_json) as Record<string, unknown>;
        config = Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
        ) as Record<string, string>;
      } catch {
        config = {};
      }
    }
    return {
      provider: provider.id,
      status: row?.status ?? 'DISCONNECTED',
      config,
      updatedAt: row?.updated_at ?? '',
      configured: check.configured,
      detail: check.detail,
    };
  });
}

/** Keeps only the fields defined for the provider, so a client cannot store arbitrary payloads. */
export function sanitiseConfig(provider: IntegrationProvider, input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const clean: Record<string, string> = {};
  for (const field of provider.configFields) {
    const value = raw[field.key];
    if (typeof value === 'string' && value.trim()) clean[field.key] = value.trim().slice(0, 200);
  }
  return clean;
}

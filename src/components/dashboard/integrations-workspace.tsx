'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, MessageSquare, Plug, Wallet } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Input, StatusBadge, apiRequest, useToast } from '@/components/ui';

type Provider = {
  id: string;
  name: string;
  purpose: string;
  credentialEnv: string[];
  configFields: { key: string; label: string; placeholder: string }[];
};

type Integration = {
  provider: string;
  status: string;
  config: Record<string, string>;
  updatedAt: string;
  configured: boolean;
  detail: string;
};

const ICONS: Record<string, typeof MessageSquare> = {
  WHATSAPP: MessageSquare,
  PAYMENTS: Wallet,
  EMAIL: CheckCircle2,
};

/**
 * Integration settings.
 *
 * Deliberately blunt about what is and is not happening: `configured` comes from the deployment's
 * environment (does this install actually have the credentials?), while `status` is what the
 * workspace chose. A provider can be switched on and still show "credentials missing" — that is the
 * honest state, and the UI says so instead of implying a live connection.
 */
export function IntegrationsWorkspace({
  integrations,
  providers,
  canManage,
}: {
  integrations: Integration[];
  providers: Provider[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    Object.fromEntries(integrations.map((entry) => [entry.provider, entry.config ?? {}])),
  );

  const save = async (provider: Provider, status: 'CONNECTED' | 'DISCONNECTED') => {
    setBusy(provider.id);
    const result = await apiRequest<{ integration: Integration }>('/api/integrations', {
      method: 'PATCH',
      body: {
        provider: provider.id,
        status,
        config: status === 'CONNECTED' ? drafts[provider.id] ?? {} : {},
      },
    });
    setBusy(null);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(
      status === 'CONNECTED' ? `${provider.name} marked as in use` : `${provider.name} switched off`,
      'success',
    );
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Alert tone="info" title="How credentials work here">
        API keys, SMTP passwords and payment secrets are read from the server environment (for example
        <code className="mx-1 rounded bg-[rgb(var(--surface-muted))] px-1 py-0.5 text-xs">AI_API_KEY</code>
        or
        <code className="mx-1 rounded bg-[rgb(var(--surface-muted))] px-1 py-0.5 text-xs">STRIPE_SECRET_KEY</code>
        ). They are never entered in this dashboard and never sent to the browser. This page records which
        providers your workspace uses and the non-secret settings that go with them.
      </Alert>

      {providers.map((provider) => {
        const integration = integrations.find((entry) => entry.provider === provider.id);
        const Icon = ICONS[provider.id] ?? Plug;
        const inUse = integration?.status === 'CONNECTED';
        return (
          <Card key={provider.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-brand-600" aria-hidden />
                  {provider.name}
                </span>
              }
              description={provider.purpose}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={inUse ? 'success' : 'neutral'}>{inUse ? 'In use' : 'Not in use'}</Badge>
                  <StatusBadge status={integration?.configured ? 'CONNECTED' : 'PENDING'} />
                </div>
              }
            />
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-[rgb(var(--surface-muted))] p-3 text-xs">
              <KeyRound className="h-3.5 w-3.5 text-brand-600" aria-hidden />
              <span className="font-medium">
                {integration?.configured ? 'Credentials present in this deployment' : 'Credentials missing in this deployment'}
              </span>
              <span className="muted">{integration?.detail}</span>
            </div>
            <p className="muted mt-2 text-xs">
              Environment variables this provider reads: {provider.credentialEnv.join(', ')}
            </p>

            {provider.configFields.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {provider.configFields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="muted text-xs">{field.label}</span>
                    <Input
                      className="mt-1"
                      value={drafts[provider.id]?.[field.key] ?? ''}
                      placeholder={field.placeholder}
                      disabled={!canManage}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [provider.id]: { ...current[provider.id], [field.key]: event.target.value },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canManage || busy === provider.id}
                onClick={() => save(provider, 'CONNECTED')}
              >
                {inUse ? 'Save settings' : 'Mark as in use'}
              </Button>
              {inUse ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canManage || busy === provider.id}
                  onClick={() => save(provider, 'DISCONNECTED')}
                >
                  Switch off
                </Button>
              ) : null}
              {!canManage ? <span className="muted self-center text-xs">Owners and admins can change this.</span> : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

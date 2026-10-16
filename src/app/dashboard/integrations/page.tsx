import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { listIntegrations } from '@/lib/db/repositories/platform';
import { describeIntegrations, INTEGRATION_PROVIDERS } from '@/lib/services/integrations';
import { IntegrationsWorkspace } from '@/components/dashboard/integrations-workspace';
import { PageHeader } from '@/components/dashboard/shared';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const ctx = requireTenant(await getSessionContext());
  const rows = listIntegrations(ctx.business.id);
  const described = describeIntegrations(rows);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="WhatsApp, payments and email delivery for this workspace. Credentials stay in the server environment — a workspace records which providers it uses, never the keys."
      />
      <IntegrationsWorkspace
        integrations={described}
        providers={INTEGRATION_PROVIDERS.map((provider) => ({
          id: provider.id,
          name: provider.name,
          purpose: provider.purpose,
          credentialEnv: provider.credentialEnv,
          configFields: provider.configFields,
        }))}
        canManage={ctx.role === 'OWNER' || ctx.role === 'ADMIN'}
      />
    </div>
  );
}

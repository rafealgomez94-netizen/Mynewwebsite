import { handleError, ok, parseBody } from '@/lib/api/http';
import { integrationUpdateSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import { listIntegrations, upsertIntegration } from '@/lib/db/repositories/platform';
import {
  describeIntegrations,
  findProvider,
  INTEGRATION_PROVIDERS,
  sanitiseConfig,
} from '@/lib/services/integrations';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace integrations.
 *
 * GET   → each provider with its stored state and whether this deployment has the credentials.
 * PATCH → connect or disconnect a provider and store its non-secret settings.
 *
 * Credentials are never accepted here: they live in server environment variables, and the response
 * reports only whether they are present. Everything is tenant-scoped and audited.
 */
export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'integrations:read');
    const rows = listIntegrations(ctx.business.id);
    return ok({
      integrations: describeIntegrations(rows),
      providers: INTEGRATION_PROVIDERS.map((provider) => ({
        id: provider.id,
        name: provider.name,
        purpose: provider.purpose,
        credentialEnv: provider.credentialEnv,
        configFields: provider.configFields,
      })),
      limits: { canManage: ctx.role === 'OWNER' || ctx.role === 'ADMIN' },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'integrations:write');
    const input = await parseBody(request, integrationUpdateSchema);

    const provider = findProvider(input.provider);
    if (!provider) {
      throw new HttpError(
        422,
        `Unknown integration "${input.provider}". Supported: ${INTEGRATION_PROVIDERS.map((entry) => entry.id).join(', ')}.`,
        'unsupported_type',
      );
    }

    const status = input.status ?? 'CONNECTED';
    const config = sanitiseConfig(provider, input.config);
    upsertIntegration(ctx.business.id, provider.id, status, config);

    audit({
      businessId: ctx.business.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.session.user.email,
      action: status === 'CONNECTED' ? 'integration.connected' : 'integration.disconnected',
      entityType: 'integration',
      entityId: provider.id,
      meta: { provider: provider.id, fields: Object.keys(config) },
    });

    const rows = listIntegrations(ctx.business.id);
    return ok({
      integration: describeIntegrations(rows).find((row) => row.provider === provider.id),
      integrations: describeIntegrations(rows),
    });
  } catch (error) {
    return handleError(error);
  }
}

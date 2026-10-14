import { findBusinessById, findMembership, type BusinessRow } from '@/lib/db/repositories/accounts';
import { roleHasPermission, type BusinessRole, type Permission } from '@/lib/domain';
import type { SessionContext } from '@/lib/auth/session';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type TenantContext = {
  session: SessionContext;
  business: BusinessRow;
  role: BusinessRole;
  userId: string;
};

export function requireUser(session: SessionContext | null): SessionContext {
  if (!session) throw new HttpError(401, 'You need to sign in to continue.', 'unauthenticated');
  return session;
}

export function requirePlatformAdmin(session: SessionContext | null): SessionContext {
  const authed = requireUser(session);
  if (authed.user.platformRole !== 'PLATFORM_ADMIN') {
    throw new HttpError(403, 'Platform administrator access required.', 'forbidden');
  }
  return authed;
}

/**
 * Resolves the tenant for a request and asserts the caller's membership.
 * `businessId` may come from the request (e.g. workspace switcher); when absent
 * the session's active business is used.
 */
export function requireTenant(session: SessionContext | null, businessId?: string | null): TenantContext {
  const authed = requireUser(session);
  const targetId = businessId ?? authed.businessId;
  if (!targetId) {
    throw new HttpError(409, 'No business workspace is selected yet.', 'no_workspace');
  }
  const business = findBusinessById(targetId);
  if (!business) throw new HttpError(404, 'Business workspace not found.', 'not_found');

  const membership = findMembership(business.id, authed.user.id);
  if (!membership || membership.status !== 'ACTIVE') {
    // Never disclose another tenant's existence or contents.
    throw new HttpError(403, 'You do not have access to this workspace.', 'forbidden');
  }
  return { session: authed, business, role: membership.role as BusinessRole, userId: authed.user.id };
}

export function assertPermission(ctx: TenantContext, permission: Permission): void {
  if (!roleHasPermission(ctx.role, permission)) {
    throw new HttpError(403, `Your role (${ctx.role}) cannot perform this action.`, 'forbidden');
  }
}

export function tenantWhere(ctx: TenantContext, column = 'business_id'): { clause: string; params: string[] } {
  return { clause: `${column} = ?`, params: [ctx.business.id] };
}

import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { businessProfileSchema } from '@/lib/validation';
import { getSessionContext, switchBusiness } from '@/lib/auth/session';
import { assertPermission, requireTenant, requireUser } from '@/lib/auth/rbac';
import {
  addMember,
  createBusiness,
  findBusinessesByUser,
  hoursFor,
  commsFor,
  updateBusiness,
} from '@/lib/db/repositories/accounts';
import { createSubscription, DEFAULT_CURRENCY } from '@/lib/db/repositories/platform';
import { getSupportSettings } from '@/lib/db/repositories/comms';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = businessProfileSchema.extend({ name: z.string().min(2).max(160), type: z.string().min(2) });
const updateSchema = businessProfileSchema.partial();

/** Normalises partially-specified opening hours into complete entries. */
function normaliseHours(
  hours: { day: string; open?: string; close?: string; closed?: boolean }[] | undefined,
) {
  if (!hours) return undefined;
  return hours.map((entry) => ({
    day: entry.day,
    open: entry.open ?? '09:00',
    close: entry.close ?? '17:00',
    closed: entry.closed ?? false,
  }));
}

/** Lists the workspaces the signed-in user belongs to. */
export async function GET() {
  try {
    const session = requireUser(await getSessionContext());
    const businesses = findBusinessesByUser(session.user.id).map((business) => ({
      id: business.id,
      name: business.name,
      slug: business.slug,
      type: business.type,
      currency: business.currency,
      onboardingCompleted: Boolean(business.onboarding_completed_at),
    }));
    return ok({ businesses, activeBusinessId: session.businessId });
  } catch (error) {
    return handleError(error);
  }
}

/** Creates the first (or an additional) business workspace during onboarding. */
export async function POST(request: Request) {
  try {
    const session = requireUser(await getSessionContext());
    const input = await parseBody(request, createSchema);

    const existing = findBusinessesByUser(session.user.id);
    const business = createBusiness({
      name: input.name,
      type: input.type,
      ownerId: session.user.id,
      description: input.description || null,
      address: input.address || null,
      city: input.city || null,
      country: input.country || null,
      phone: input.phone || null,
      email: input.email || null,
      website: input.website || null,
      timezone: input.timezone || 'UTC',
      currency: input.currency || DEFAULT_CURRENCY,
      hours: normaliseHours(input.hours),
      comms: input.comms,
    });

    addMember({ businessId: business.id, userId: session.user.id, role: 'OWNER', status: 'ACTIVE' });
    createSubscription(business.id, 'FREE');
    getSupportSettings(business.id);
    await switchBusiness(session.sessionId, business.id);
    audit({
      businessId: business.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      action: existing.length ? 'business.created' : 'business.onboarded',
      entityType: 'business',
      entityId: business.id,
    });

    return ok({
      business: { id: business.id, name: business.name, slug: business.slug, type: business.type },
    }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    const ctx = requireTenant(session);
    assertPermission(ctx, 'business:update');
    const input = await parseBody(request, updateSchema);

    updateBusiness(ctx.business.id, {
      name: input.name,
      type: input.type,
      description: input.description ?? undefined,
      address: input.address ?? undefined,
      city: input.city ?? undefined,
      country: input.country ?? undefined,
      phone: input.phone ?? undefined,
      email: input.email ?? undefined,
      website: input.website ?? undefined,
      timezone: input.timezone || undefined,
      currency: input.currency,
      hours: normaliseHours(input.hours),
      comms: input.comms
        ? {
            ...commsFor(ctx.business),
            ...input.comms,
            whatsapp: input.comms.whatsapp ?? commsFor(ctx.business).whatsapp,
            escalateTo: input.comms.escalateTo ?? commsFor(ctx.business).escalateTo,
          }
        : undefined,
      onboardingStep: input.onboardingStep,
      onboardingCompletedAt: input.complete ? new Date().toISOString() : undefined,
    });

    const normalised = normaliseHours(input.hours);
    return ok({
      updated: true,
      hours: normalised ?? hoursFor(ctx.business),
    });
  } catch (error) {
    return handleError(error);
  }
}

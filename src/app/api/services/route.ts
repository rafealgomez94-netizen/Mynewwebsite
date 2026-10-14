import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { serviceSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { createService, listServices, popularServices } from '@/lib/db/repositories/catalog';
import { parseMoneyToCents } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:read');
    const activeOnly = new URL(request.url).searchParams.get('active') === 'true';
    return ok({ services: listServices(ctx.business.id, activeOnly), popular: popularServices(ctx.business.id, 5) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:update');
    const input = await parseBody(request, serviceSchema);
    const service = createService(ctx.business.id, {
      name: input.name,
      description: input.description || null,
      category: input.category || null,
      priceCents: parseMoneyToCents(input.price),
      durationMinutes: input.durationMinutes,
      active: input.active,
    });
    return ok({ service }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:update');
    const input = await parseBody(
      request,
      z.object({ id: z.string().min(3) }).and(serviceSchema.partial()),
    );
    const { updateService } = await import('@/lib/db/repositories/catalog');
    updateService(ctx.business.id, input.id, {
      name: input.name,
      description: input.description ?? undefined,
      category: input.category ?? undefined,
      priceCents: input.price !== undefined ? parseMoneyToCents(input.price) : undefined,
      durationMinutes: input.durationMinutes,
      active: input.active,
    });
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:update');
    const { id } = await parseBody(request, z.object({ id: z.string().min(3) }));
    const { deleteService } = await import('@/lib/db/repositories/catalog');
    deleteService(ctx.business.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

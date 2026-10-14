import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { staffSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { createStaff, deleteStaff, listStaff, updateStaff } from '@/lib/db/repositories/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:read');
    const activeOnly = new URL(request.url).searchParams.get('active') === 'true';
    return ok({ staff: listStaff(ctx.business.id, activeOnly) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:update');
    const input = await parseBody(request, staffSchema);
    const staff = createStaff(ctx.business.id, {
      name: input.name,
      title: input.title || null,
      email: input.email || null,
      phone: input.phone || null,
      specialties: input.specialties,
      availability: input.availability,
      color: input.color || null,
    });
    return ok({ staff }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:update');
    const input = await parseBody(request, z.object({ id: z.string().min(3) }).and(staffSchema.partial()));
    updateStaff(ctx.business.id, input.id, {
      name: input.name,
      title: input.title ?? undefined,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      specialties: input.specialties,
      availability: input.availability,
      color: input.color ?? undefined,
      active: input.active,
    });
    return ok({ staff: listStaff(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'business:update');
    const { id } = await parseBody(request, z.object({ id: z.string().min(3) }));
    deleteStaff(ctx.business.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

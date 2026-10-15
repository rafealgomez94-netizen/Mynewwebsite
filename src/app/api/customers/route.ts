import { handleError, ok, parseBody } from '@/lib/api/http';
import { customerSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { createCustomer, listCustomers, countCustomers } from '@/lib/db/repositories/crm';
import { planForBusiness, incrementUsage } from '@/lib/db/repositories/platform';
import { notify } from '@/lib/services/notify';
import { HttpError } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'customers:read');
    const url = new URL(request.url);
    const result = listCustomers(ctx.business.id, {
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      sort: (url.searchParams.get('sort') as 'recent' | 'name' | 'spend' | null) ?? 'recent',
      limit: Number(url.searchParams.get('limit') ?? 50),
      offset: Number(url.searchParams.get('offset') ?? 0),
    });
    return ok({ ...result, totalCustomers: countCustomers(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'customers:write');
    const input = await parseBody(request, customerSchema);

    // Plan limit enforcement (Free plan caps customer records).
    const { plan } = planForBusiness(ctx.business.id);
    const existing = countCustomers(ctx.business.id);
    if (existing >= plan.limits.customers) {
      throw new HttpError(
        402,
        `Your ${plan.name} plan includes ${plan.limits.customers} customers. Upgrade to add more.`,
        'plan_limit',
      );
    }

    const customer = createCustomer(ctx.business.id, {
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      birthday: input.birthday || null,
      status: input.status,
      source: input.source || 'Dashboard',
      tags: input.tags,
      notes: input.notes || null,
    });

    incrementUsage(ctx.business.id, 'CUSTOMERS');
    await notify({
      businessId: ctx.business.id,
      type: 'NEW_CUSTOMER',
      title: `New customer: ${customer.name}`,
      body: `Added by ${ctx.session.user.name}${customer.phone ? ` · ${customer.phone}` : ''}`,
      href: `/dashboard/customers/${customer.id}`,
      entityType: 'customer',
      entityId: customer.id,
    });

    return ok({ customer }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

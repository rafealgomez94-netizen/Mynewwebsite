import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { orderSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { createOrder, findOrder, listOrders, revenueSummary, topSellingItems, updateOrderStatus } from '@/lib/db/repositories/catalog';
import { parseMoneyToCents } from '@/lib/utils';
import { notify } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'orders:read');
    const url = new URL(request.url);
    const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const until = url.searchParams.get('until') ?? new Date().toISOString();
    return ok({
      orders: listOrders(ctx.business.id, {
        search: url.searchParams.get('search') ?? undefined,
        status: url.searchParams.get('status') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? 100),
        sinceIso: since,
        untilIso: until,
      }),
      summary: revenueSummary(ctx.business.id, since, until),
      topItems: topSellingItems(ctx.business.id, since, 5),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'orders:write');
    const input = await parseBody(request, orderSchema);

    const order = createOrder(ctx.business.id, {
      customerId: input.customerId || null,
      status: input.status,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod || null,
      channel: input.channel || 'IN_STORE',
      notes: input.notes || null,
      taxCents: parseMoneyToCents(input.tax),
      discountCents: parseMoneyToCents(input.discount),
      placedAt: input.placedAt || undefined,
      items: input.items.map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId || null,
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: parseMoneyToCents(item.unitPrice),
      })),
    });

    if (input.customerId) {
      await notify({
        businessId: ctx.business.id,
        type: 'BUSINESS_ALERT',
        title: `Order ${order.orderNumber} recorded`,
        body: `${(order.totalCents / 100).toFixed(2)} ${order.paymentStatus.toLowerCase()} · ${order.items.length} line item(s)`,
        href: '/dashboard/orders',
        entityType: 'order',
        entityId: order.id,
      });
    }

    return ok({ order }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'orders:write');
    const input = await parseBody(
      request,
      z.object({
        id: z.string().min(3),
        status: z.enum(['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED']),
        paymentStatus: z.enum(['UNPAID', 'PAID', 'PARTIAL', 'REFUNDED']).optional(),
      }),
    );
    updateOrderStatus(ctx.business.id, input.id, input.status, input.paymentStatus);
    return ok({ order: findOrder(ctx.business.id, input.id) });
  } catch (error) {
    return handleError(error);
  }
}

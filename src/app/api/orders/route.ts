import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { orderSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import {
  createOrder,
  findOrder,
  findProduct,
  listOrders,
  revenueSummary,
  topSellingItems,
  updateOrderStatus,
} from '@/lib/db/repositories/catalog';
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

    // Selling is the most common way stock runs out, so the low-stock alert has to
    // fire from here too — the products API only covers creating a product and
    // correcting a level by hand. Only the crossing is announced: an item that was
    // already below its minimum was reported when it got there.
    for (const item of order.items) {
      if (item.itemType !== 'PRODUCT' || !item.itemId) continue;
      const product = findProduct(ctx.business.id, item.itemId);
      if (!product) continue;
      const quantityBefore = product.quantity + item.quantity;
      if (product.quantity <= product.minStock && quantityBefore > product.minStock) {
        await notify({
          businessId: ctx.business.id,
          type: 'LOW_INVENTORY',
          title: `Low stock: ${product.name}`,
          body: `Sold ${item.quantity} on order ${order.orderNumber} — ${product.quantity} left (minimum ${product.minStock}).`,
          level: product.quantity <= 0 ? 'CRITICAL' : 'WARNING',
          href: '/dashboard/inventory',
          entityType: 'product',
          entityId: product.id,
        });
      }
    }

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

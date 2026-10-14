import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { productSchema, stockAdjustSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import {
  createProduct,
  deleteProduct,
  inventoryValue,
  listInventoryMovements,
  listProducts,
  recordStockMovement,
  updateProduct,
} from '@/lib/db/repositories/catalog';
import { parseMoneyToCents } from '@/lib/utils';
import { notify } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'products:read');
    const url = new URL(request.url);
    return ok({
      products: listProducts(ctx.business.id, {
        search: url.searchParams.get('search') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        lowStockOnly: url.searchParams.get('lowStock') === 'true',
        limit: Number(url.searchParams.get('limit') ?? 200),
      }),
      value: inventoryValue(ctx.business.id),
      movements: listInventoryMovements(ctx.business.id, 25),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'products:write');
    const input = await parseBody(request, productSchema);
    const product = createProduct(ctx.business.id, {
      name: input.name,
      sku: input.sku || null,
      category: input.category || null,
      description: input.description || null,
      quantity: input.quantity,
      costCents: parseMoneyToCents(input.cost),
      priceCents: parseMoneyToCents(input.price),
      supplier: input.supplier || null,
      minStock: input.minStock,
      unit: input.unit || 'unit',
      active: input.active,
    });
    if (product.quantity <= product.minStock) {
      await notify({
        businessId: ctx.business.id,
        type: 'LOW_INVENTORY',
        title: `Low stock: ${product.name}`,
        body: `${product.quantity} ${product.unit ?? 'units'} left (minimum ${product.minStock}).`,
        level: 'WARNING',
        href: '/dashboard/inventory',
        entityType: 'product',
        entityId: product.id,
      });
    }
    return ok({ product }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'products:write');
    const body = (await request.json()) as Record<string, unknown>;

    // Stock adjustments are a distinct operation: they must be journalled.
    if (typeof body.adjust === 'object' && body.adjust !== null) {
      const input = stockAdjustSchema.parse(body.adjust);
      recordStockMovement(ctx.business.id, {
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        note: input.note || null,
        userId: ctx.userId,
      });
      const product = listProducts(ctx.business.id, { limit: 500 }).find((item) => item.id === input.productId);
      if (product && product.quantity <= product.minStock) {
        await notify({
          businessId: ctx.business.id,
          type: 'LOW_INVENTORY',
          title: `Low stock: ${product.name}`,
          body: `${product.quantity} left after ${input.type} movement (minimum ${product.minStock}).`,
          level: 'WARNING',
          href: '/dashboard/inventory',
          entityType: 'product',
          entityId: product.id,
        });
      }
      return ok({ product });
    }

    const input = z.object({ id: z.string().min(3) }).and(productSchema.partial()).parse(body);
    updateProduct(ctx.business.id, input.id, {
      name: input.name,
      sku: input.sku ?? undefined,
      category: input.category ?? undefined,
      description: input.description ?? undefined,
      quantity: input.quantity,
      costCents: input.cost !== undefined ? parseMoneyToCents(input.cost) : undefined,
      priceCents: input.price !== undefined ? parseMoneyToCents(input.price) : undefined,
      supplier: input.supplier ?? undefined,
      minStock: input.minStock,
      unit: input.unit ?? undefined,
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
    assertPermission(ctx, 'products:write');
    const { id } = await parseBody(request, z.object({ id: z.string().min(3) }));
    deleteProduct(ctx.business.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

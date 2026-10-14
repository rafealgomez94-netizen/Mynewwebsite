import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { inventoryValue, listInventoryMovements, listProducts } from '@/lib/db/repositories/catalog';
import { InventoryView } from '@/components/dashboard/inventory-view';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const ctx = requireTenant(await getSessionContext());
  const products = listProducts(ctx.business.id, { limit: 300 });
  const value = inventoryValue(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Products, cost and selling prices, suppliers, minimum stock levels and automatic low-stock alerts. The AI answers “what is running low?” from this data."
        meta={
          <>
            <Badge tone="info">{products.length} products</Badge>
            {value.low > 0 ? <Badge tone="danger">{value.low} at or below minimum</Badge> : <Badge tone="success">Stock healthy</Badge>}
          </>
        }
      />
      <InventoryView
        initial={products}
        value={value}
        movements={listInventoryMovements(ctx.business.id, 20)}
        currency={ctx.business.currency}
      />
    </div>
  );
}

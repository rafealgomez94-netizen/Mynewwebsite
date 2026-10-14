import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { listOrders, listProducts, listServices, revenueSummary, topSellingItems } from '@/lib/db/repositories/catalog';
import { listCustomers } from '@/lib/db/repositories/crm';
import { OrdersView } from '@/components/dashboard/orders-view';
import { PageHeader } from '@/components/dashboard/shared';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const ctx = requireTenant(await getSessionContext());
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const now = new Date().toISOString();

  return (
    <div>
      <PageHeader
        title="Orders & sales"
        description="Record sales in seconds. Stock levels, customer spend and revenue analytics update automatically."
        action={
          <a href="/dashboard/documents" className="text-sm font-semibold text-brand-600 hover:underline">
            Generate an invoice or receipt →
          </a>
        }
      />
      <OrdersView
        initial={listOrders(ctx.business.id, { limit: 100, sinceIso: since, untilIso: now }).map((order) => ({
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          status: order.status,
          payment_status: order.payment_status,
          total_cents: order.total_cents,
          channel: order.channel,
          placed_at: order.placed_at,
          item_count: order.item_count,
        }))}
        products={listProducts(ctx.business.id, { limit: 300 }).map((product) => ({
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          quantity: product.quantity,
        }))}
        services={listServices(ctx.business.id, true).map((service) => ({
          id: service.id,
          name: service.name,
          priceCents: service.price_cents,
        }))}
        customers={listCustomers(ctx.business.id, { limit: 300, sort: 'name' }).rows.map((customer) => ({
          id: customer.id,
          name: customer.name,
        }))}
        summary={revenueSummary(ctx.business.id, since, now)}
        topItems={topSellingItems(ctx.business.id, since, 5).map((item) => ({
          name: item.name,
          units: item.units,
          revenue: item.revenue,
        }))}
        currency={ctx.business.currency}
      />
    </div>
  );
}

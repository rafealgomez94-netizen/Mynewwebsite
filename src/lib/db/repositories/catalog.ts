import { all, get, json, nowIso, run, tx } from '@/lib/db';
import { newId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
export type ServiceRow = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  duration_minutes: number;
  active: number;
  times_booked: number;
  created_at: string;
};

export function listServices(businessId: string, onlyActive = false): ServiceRow[] {
  return all<ServiceRow>(
    `SELECT * FROM services WHERE business_id = ? ${onlyActive ? 'AND active = 1' : ''}
     ORDER BY active DESC, name ASC`,
    [businessId],
  );
}

export function findService(businessId: string, id: string): ServiceRow | undefined {
  return get<ServiceRow>(`SELECT * FROM services WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function createService(
  businessId: string,
  input: {
    name: string;
    description?: string | null;
    category?: string | null;
    priceCents?: number;
    durationMinutes?: number;
    active?: boolean;
  },
): ServiceRow {
  const id = newId('svc');
  const now = nowIso();
  run(
    `INSERT INTO services (id, business_id, name, description, category, price_cents, duration_minutes, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.priceCents ?? 0,
      input.durationMinutes ?? 60,
      input.active === false ? 0 : 1,
      now,
      now,
    ],
  );
  return findService(businessId, id)!;
}

export function updateService(businessId: string, id: string, patch: Record<string, unknown>): void {
  const map: Record<string, string> = {
    name: 'name',
    description: 'description',
    category: 'category',
    priceCents: 'price_cents',
    durationMinutes: 'duration_minutes',
    active: 'active',
  };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in patch && patch[key] !== undefined) {
      const value = patch[key];
      sets.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : ((value as string | number | null) ?? null));
    }
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE services SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteService(businessId: string, id: string): void {
  run(`DELETE FROM services WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function incrementServiceBookings(businessId: string, serviceId: string): void {
  run(`UPDATE services SET times_booked = times_booked + 1 WHERE business_id = ? AND id = ?`, [
    businessId,
    serviceId,
  ]);
}

export function popularServices(businessId: string, limit = 5) {
  return all<{ id: string; name: string; times_booked: number; price_cents: number }>(
    `SELECT id, name, times_booked, price_cents FROM services
     WHERE business_id = ? AND times_booked > 0 ORDER BY times_booked DESC LIMIT ?`,
    [businessId, limit],
  );
}

// ---------------------------------------------------------------------------
// Products & inventory
// ---------------------------------------------------------------------------
export type ProductRow = {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  quantity: number;
  cost_cents: number;
  price_cents: number;
  supplier: string | null;
  min_stock: number;
  unit: string | null;
  active: number;
  units_sold: number;
  created_at: string;
  updated_at: string;
};

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export function stockStatus(row: Pick<ProductRow, 'quantity' | 'min_stock'>): StockStatus {
  if (row.quantity <= 0) return 'OUT_OF_STOCK';
  if (row.quantity <= row.min_stock) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function toProduct(row: ProductRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    description: row.description,
    quantity: row.quantity,
    costCents: row.cost_cents,
    priceCents: row.price_cents,
    supplier: row.supplier,
    minStock: row.min_stock,
    unit: row.unit,
    active: row.active === 1,
    unitsSold: row.units_sold,
    stockStatus: stockStatus(row),
    marginCents: row.price_cents - row.cost_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProducts(
  businessId: string,
  filter: { search?: string; category?: string; lowStockOnly?: boolean; limit?: number } = {},
) {
  const clauses = ['business_id = ?'];
  const params: (string | number)[] = [businessId];
  if (filter.search) {
    clauses.push(`(lower(name) LIKE ? OR lower(coalesce(sku, '')) LIKE ?)`);
    const like = `%${filter.search.toLowerCase()}%`;
    params.push(like, like);
  }
  if (filter.category) {
    clauses.push('category = ?');
    params.push(filter.category);
  }
  if (filter.lowStockOnly) clauses.push('quantity <= min_stock');
  const rows = all<ProductRow>(
    `SELECT * FROM products WHERE ${clauses.join(' AND ')} ORDER BY name ASC LIMIT ?`,
    [...params, Math.min(filter.limit ?? 200, 500)],
  );
  return rows.map(toProduct);
}

export function findProduct(businessId: string, id: string) {
  const row = get<ProductRow>(`SELECT * FROM products WHERE business_id = ? AND id = ?`, [businessId, id]);
  return row ? toProduct(row) : undefined;
}

export function findProductRow(businessId: string, id: string): ProductRow | undefined {
  return get<ProductRow>(`SELECT * FROM products WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function createProduct(
  businessId: string,
  input: {
    name: string;
    sku?: string | null;
    category?: string | null;
    description?: string | null;
    quantity?: number;
    costCents?: number;
    priceCents?: number;
    supplier?: string | null;
    minStock?: number;
    unit?: string | null;
    active?: boolean;
  },
) {
  const id = newId('prd');
  const now = nowIso();
  run(
    `INSERT INTO products (id, business_id, name, sku, category, description, quantity, cost_cents, price_cents,
                           supplier, min_stock, unit, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.name,
      input.sku ?? null,
      input.category ?? null,
      input.description ?? null,
      input.quantity ?? 0,
      input.costCents ?? 0,
      input.priceCents ?? 0,
      input.supplier ?? null,
      input.minStock ?? 0,
      input.unit ?? 'unit',
      input.active === false ? 0 : 1,
      now,
      now,
    ],
  );
  return findProduct(businessId, id)!;
}

export function updateProduct(businessId: string, id: string, patch: Record<string, unknown>): void {
  const map: Record<string, string> = {
    name: 'name',
    sku: 'sku',
    category: 'category',
    description: 'description',
    quantity: 'quantity',
    costCents: 'cost_cents',
    priceCents: 'price_cents',
    supplier: 'supplier',
    minStock: 'min_stock',
    unit: 'unit',
    active: 'active',
  };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in patch && patch[key] !== undefined) {
      const value = patch[key];
      sets.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : ((value as string | number | null) ?? null));
    }
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE products SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteProduct(businessId: string, id: string): void {
  run(`DELETE FROM products WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function recordStockMovement(
  businessId: string,
  input: { productId: string; type: string; quantity: number; note?: string | null; userId?: string | null },
): void {
  tx(() => {
    const product = findProductRow(businessId, input.productId);
    if (!product) throw new Error('Product not found');
    const signed =
      input.type === 'IN'
        ? Math.abs(input.quantity)
        : input.type === 'ADJUST'
          ? input.quantity
          : -Math.abs(input.quantity);
    const next = Math.max(0, product.quantity + signed);
    run(`UPDATE products SET quantity = ?, updated_at = ? WHERE business_id = ? AND id = ?`, [
      next,
      nowIso(),
      businessId,
      input.productId,
    ]);
    run(
      `INSERT INTO inventory_movements (id, business_id, product_id, type, quantity, note, created_by_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('mov'),
        businessId,
        input.productId,
        input.type,
        input.quantity,
        input.note ?? null,
        input.userId ?? null,
        nowIso(),
      ],
    );
  });
}

export function lowStockProducts(businessId: string, limit = 10) {
  return all<ProductRow>(
    `SELECT * FROM products WHERE business_id = ? AND active = 1 AND quantity <= min_stock
     ORDER BY (quantity * 1.0) / (CASE WHEN min_stock = 0 THEN 1 ELSE min_stock END) ASC, quantity ASC
     LIMIT ?`,
    [businessId, limit],
  ).map(toProduct);
}

export function fastMovingProducts(businessId: string, limit = 5) {
  return all<ProductRow>(
    `SELECT * FROM products WHERE business_id = ? AND units_sold > 0 ORDER BY units_sold DESC LIMIT ?`,
    [businessId, limit],
  ).map(toProduct);
}

export function slowMovingProducts(businessId: string, limit = 5) {
  return all<ProductRow>(
    `SELECT * FROM products WHERE business_id = ? AND active = 1 ORDER BY units_sold ASC, name ASC LIMIT ?`,
    [businessId, limit],
  ).map(toProduct);
}

export function inventoryValue(businessId: string) {
  const row = get<{ cost: number; retail: number; units: number; low: number }>(
    `SELECT coalesce(sum(quantity * cost_cents), 0) AS cost,
            coalesce(sum(quantity * price_cents), 0) AS retail,
            coalesce(sum(quantity), 0) AS units,
            coalesce(sum(CASE WHEN quantity <= min_stock THEN 1 ELSE 0 END), 0) AS low
     FROM products WHERE business_id = ? AND active = 1`,
    [businessId],
  );
  return row ?? { cost: 0, retail: 0, units: 0, low: 0 };
}

export function listInventoryMovements(businessId: string, limit = 40) {
  return all<{
    id: string;
    type: string;
    quantity: number;
    note: string | null;
    created_at: string;
    product_name: string;
    author: string | null;
  }>(
    `SELECT m.id, m.type, m.quantity, m.note, m.created_at, p.name AS product_name, u.name AS author
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN users u ON u.id = m.created_by_id
     WHERE m.business_id = ? ORDER BY m.created_at DESC LIMIT ?`,
    [businessId, limit],
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export type OrderRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string | null;
  channel: string | null;
  placed_at: string;
  created_at: string;
};

export type OrderItemInput = {
  itemType: 'PRODUCT' | 'SERVICE';
  itemId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export function nextOrderNumber(businessId: string): string {
  const count = get<{ c: number }>(`SELECT count(*) AS c FROM orders WHERE business_id = ?`, [businessId])?.c ?? 0;
  return `ORD-${String(count + 1).padStart(5, '0')}`;
}

export function createOrder(
  businessId: string,
  input: {
    customerId?: string | null;
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string | null;
    channel?: string | null;
    notes?: string | null;
    taxCents?: number;
    discountCents?: number;
    placedAt?: string;
    items: OrderItemInput[];
  },
) {
  const id = newId('ord');
  const now = nowIso();
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const total = Math.max(0, subtotal + (input.taxCents ?? 0) - (input.discountCents ?? 0));
  tx(() => {
    run(
      `INSERT INTO orders (id, business_id, customer_id, order_number, status, payment_status, payment_method,
                           subtotal_cents, tax_cents, discount_cents, total_cents, notes, channel, placed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        businessId,
        input.customerId ?? null,
        nextOrderNumber(businessId),
        input.status ?? 'PAID',
        input.paymentStatus ?? 'PAID',
        input.paymentMethod ?? null,
        subtotal,
        input.taxCents ?? 0,
        input.discountCents ?? 0,
        total,
        input.notes ?? null,
        input.channel ?? 'IN_STORE',
        input.placedAt ?? now,
        now,
        now,
      ],
    );
    for (const item of input.items) {
      run(
        `INSERT INTO order_items (id, business_id, order_id, item_type, item_id, name, quantity, unit_price_cents, total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId('oit'),
          businessId,
          id,
          item.itemType,
          item.itemId ?? null,
          item.name,
          item.quantity,
          item.unitPriceCents,
          item.quantity * item.unitPriceCents,
        ],
      );
      if (item.itemType === 'PRODUCT' && item.itemId) {
        run(
          `UPDATE products SET units_sold = units_sold + ?, quantity = max(0, quantity - ?), updated_at = ?
           WHERE business_id = ? AND id = ?`,
          [item.quantity, item.quantity, now, businessId, item.itemId],
        );
        run(
          `INSERT INTO inventory_movements (id, business_id, product_id, type, quantity, note, created_at)
           VALUES (?, ?, ?, 'SALE', ?, ?, ?)`,
          [newId('mov'), businessId, item.itemId, -item.quantity, `Order ${id.slice(-6)}`, now],
        );
      }
      if (item.itemType === 'SERVICE' && item.itemId) {
        run(`UPDATE services SET times_booked = times_booked + ? WHERE business_id = ? AND id = ?`, [
          item.quantity,
          businessId,
          item.itemId,
        ]);
      }
    }
    if (input.customerId) {
      run(
        `UPDATE customers SET total_spend_cents = total_spend_cents + ?, order_count = order_count + 1,
                             last_interaction_at = ?, updated_at = ?,
                             status = CASE WHEN status IN ('NEW', 'LEAD') THEN 'ACTIVE' ELSE status END
         WHERE business_id = ? AND id = ?`,
        [total, now, now, businessId, input.customerId],
      );
    }
  });
  return findOrder(businessId, id)!;
}

export function findOrder(businessId: string, id: string) {
  const row = get<OrderRow>(`SELECT * FROM orders WHERE business_id = ? AND id = ?`, [businessId, id]);
  if (!row) return undefined;
  const items = all<{
    id: string;
    item_type: string;
    item_id: string | null;
    name: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }>(`SELECT * FROM order_items WHERE business_id = ? AND order_id = ?`, [businessId, id]);
  const customer = row.customer_id
    ? get<{ name: string; email: string | null; phone: string | null }>(
        `SELECT name, email, phone FROM customers WHERE business_id = ? AND id = ?`,
        [businessId, row.customer_id],
      )
    : undefined;
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    customerName: customer?.name ?? null,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    discountCents: row.discount_cents,
    totalCents: row.total_cents,
    notes: row.notes,
    channel: row.channel,
    placedAt: row.placed_at,
    items: items.map((item) => ({
      id: item.id,
      itemType: item.item_type,
      itemId: item.item_id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      totalCents: item.total_cents,
    })),
  };
}

export function listOrders(
  businessId: string,
  filter: { search?: string; status?: string; limit?: number; sinceIso?: string; untilIso?: string } = {},
) {
  const clauses = ['o.business_id = ?'];
  const params: (string | number)[] = [businessId];
  if (filter.status) {
    clauses.push('o.status = ?');
    params.push(filter.status);
  }
  if (filter.search) {
    clauses.push(`(lower(o.order_number) LIKE ? OR lower(coalesce(c.name, '')) LIKE ?)`);
    const like = `%${filter.search.toLowerCase()}%`;
    params.push(like, like);
  }
  if (filter.sinceIso) {
    clauses.push('o.placed_at >= ?');
    params.push(filter.sinceIso);
  }
  if (filter.untilIso) {
    clauses.push('o.placed_at <= ?');
    params.push(filter.untilIso);
  }
  return all<{
    id: string;
    order_number: string;
    customer_name: string | null;
    status: string;
    payment_status: string;
    total_cents: number;
    channel: string | null;
    placed_at: string;
    item_count: number;
  }>(
    `SELECT o.id, o.order_number, c.name AS customer_name, o.status, o.payment_status, o.total_cents, o.channel, o.placed_at,
            (SELECT coalesce(sum(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY o.placed_at DESC LIMIT ?`,
    [...params, Math.min(filter.limit ?? 100, 300)],
  );
}

export function updateOrderStatus(businessId: string, id: string, status: string, paymentStatus?: string): void {
  if (paymentStatus) {
    run(`UPDATE orders SET status = ?, payment_status = ?, updated_at = ? WHERE business_id = ? AND id = ?`, [
      status,
      paymentStatus,
      nowIso(),
      businessId,
      id,
    ]);
    return;
  }
  run(`UPDATE orders SET status = ?, updated_at = ? WHERE business_id = ? AND id = ?`, [
    status,
    nowIso(),
    businessId,
    id,
  ]);
}

export function revenueSummary(businessId: string, sinceIso: string, untilIso: string) {
  return (
    get<{ revenue: number; orders: number; avg: number }>(
      `SELECT coalesce(sum(total_cents), 0) AS revenue, count(*) AS orders,
              coalesce(avg(total_cents), 0) AS avg
       FROM orders WHERE business_id = ? AND placed_at >= ? AND placed_at <= ? AND status != 'CANCELLED'`,
      [businessId, sinceIso, untilIso],
    ) ?? { revenue: 0, orders: 0, avg: 0 }
  );
}

export function revenueByDay(businessId: string, sinceIso: string, untilIso: string) {
  return all<{ day: string; revenue: number; orders: number }>(
    `SELECT substr(placed_at, 1, 10) AS day, coalesce(sum(total_cents), 0) AS revenue, count(*) AS orders
     FROM orders WHERE business_id = ? AND placed_at >= ? AND placed_at <= ? AND status != 'CANCELLED'
     GROUP BY day ORDER BY day ASC`,
    [businessId, sinceIso, untilIso],
  );
}

export function topSellingItems(businessId: string, sinceIso: string, limit = 5) {
  return all<{ name: string; item_type: string; units: number; revenue: number; unit_price: number }>(
    `SELECT i.name, i.item_type, coalesce(sum(i.quantity), 0) AS units, coalesce(sum(i.total_cents), 0) AS revenue,
            coalesce(max(i.unit_price_cents), 0) AS unit_price
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE i.business_id = ? AND o.placed_at >= ? AND o.status != 'CANCELLED'
     GROUP BY i.name, i.item_type ORDER BY units DESC LIMIT ?`,
    [businessId, sinceIso, limit],
  );
}

export function salesByChannel(businessId: string, sinceIso: string) {
  return all<{ channel: string | null; revenue: number; orders: number }>(
    `SELECT channel, coalesce(sum(total_cents), 0) AS revenue, count(*) AS orders FROM orders
     WHERE business_id = ? AND placed_at >= ? AND status != 'CANCELLED' GROUP BY channel ORDER BY revenue DESC`,
    [businessId, sinceIso],
  );
}

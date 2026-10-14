'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Package, Plus } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, StatusBadge, apiRequest, useToast } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

export type ProductItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  costCents: number;
  priceCents: number;
  supplier: string | null;
  minStock: number;
  unit: string | null;
  stockStatus: string;
  unitsSold: number;
  marginCents: number;
};

export function InventoryView({
  initial,
  value,
  movements,
  currency,
}: {
  initial: ProductItem[];
  value: { cost: number; retail: number; units: number; low: number };
  movements: { id: string; type: string; quantity: number; note: string | null; created_at: string; product_name: string; author: string | null }[];
  currency: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [products, setProducts] = useState(initial);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [adjust, setAdjust] = useState<ProductItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    quantity: '0',
    minStock: '5',
    cost: '',
    price: '',
    supplier: '',
    unit: 'unit',
  });
  const [adjustForm, setAdjustForm] = useState({ type: 'IN', quantity: '1', note: '' });

  const reload = async () => {
    const result = await apiRequest<{ products: ProductItem[] }>('/api/products', { method: 'GET' });
    if (result.ok) setProducts(result.data.products ?? []);
    router.refresh();
  };

  const filtered = useMemo(
    () =>
      products.filter((product) => {
        if (lowOnly && product.stockStatus === 'IN_STOCK') return false;
        if (!search) return true;
        const query = search.toLowerCase();
        return product.name.toLowerCase().includes(query) || (product.sku ?? '').toLowerCase().includes(query);
      }),
    [products, search, lowOnly],
  );

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/products', { body: form });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Product added', 'success');
    setOpen(false);
    setForm({ name: '', sku: '', category: '', quantity: '0', minStock: '5', cost: '', price: '', supplier: '', unit: 'unit' });
    await reload();
  };

  const submitAdjust = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjust) return;
    setBusy(true);
    const result = await apiRequest('/api/products', {
      method: 'PATCH',
      body: { adjust: { productId: adjust.id, type: adjustForm.type, quantity: Number(adjustForm.quantity), note: adjustForm.note } },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Stock updated and journalled', 'success');
    setAdjust(null);
    setAdjustForm({ type: 'IN', quantity: '1', note: '' });
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Stock value (cost)', value: formatMoney(value.cost, currency) },
          { label: 'Stock value (retail)', value: formatMoney(value.retail, currency) },
          { label: 'Units in stock', value: String(value.units) },
          { label: 'At or below minimum', value: String(value.low), tone: value.low ? 'danger' : 'success' },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
            <p className={`mt-1 text-xl font-semibold ${stat.tone === 'danger' ? 'text-red-600' : ''}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search products" className="min-w-[200px] flex-1">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or SKU" />
        </Field>
        <Button variant={lowOnly ? 'primary' : 'secondary'} onClick={() => setLowOnly((current) => !current)}>
          <AlertTriangle className="h-4 w-4" /> Low stock only
        </Button>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New product
        </Button>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Products & stock</h2>
            <p className="muted text-xs">{filtered.length} products shown</p>
          </div>
          <Badge tone="info">Low-stock alerts notify your team automatically</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b">
                {['Product', 'SKU', 'Category', 'Qty', 'Min', 'Cost', 'Price', 'Margin', 'Sold', 'Status', ''].map((column) => (
                  <th key={column} className="table-head px-3 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} className="table-row border-b last:border-b-0">
                  <td className="px-3 py-3 font-medium">{product.name}</td>
                  <td className="muted px-3 py-3">{product.sku ?? '—'}</td>
                  <td className="px-3 py-3">{product.category ?? '—'}</td>
                  <td className="px-3 py-3">{product.quantity}</td>
                  <td className="px-3 py-3">{product.minStock}</td>
                  <td className="px-3 py-3">{formatMoney(product.costCents, currency)}</td>
                  <td className="px-3 py-3">{formatMoney(product.priceCents, currency)}</td>
                  <td className="px-3 py-3">{formatMoney(product.marginCents, currency)}</td>
                  <td className="px-3 py-3">{product.unitsSold}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={product.stockStatus} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => setAdjust(product)}>
                      Adjust stock
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="muted p-5 text-sm">No products match. Add your stock items to get low-stock alerts and AI inventory answers.</p>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Recent stock movements" description="Every adjustment is journalled with who made it and when." />
        {movements.length === 0 ? (
          <p className="muted text-sm">No movements recorded yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {movements.slice(0, 12).map((movement) => (
              <li key={movement.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{movement.product_name}</p>
                  <p className="muted text-xs">
                    {movement.type} · {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    {movement.note ? ` · ${movement.note}` : ''} {movement.author ? `· ${movement.author}` : ''}
                  </p>
                </div>
                <span className="muted text-xs">{movement.created_at.slice(0, 16).replace('T', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New product"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy}>
              <Package className="h-4 w-4" /> Add product
            </Button>
          </>
        }
      >
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </Field>
          <Field label="Quantity on hand">
            <Input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
          </Field>
          <Field label="Minimum stock level" hint="Alerts trigger at or below this level">
            <Input value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} />
          </Field>
          <Field label="Cost price">
            <Input value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
          </Field>
          <Field label="Selling price">
            <Input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </Field>
          <Field label="Supplier">
            <Input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(adjust)}
        onClose={() => setAdjust(null)}
        title={`Adjust stock — ${adjust?.name ?? ''}`}
        description="Movements are recorded in the inventory journal so stock levels always reconcile."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjust(null)}>
              Cancel
            </Button>
            <Button onClick={submitAdjust} loading={busy}>
              Save movement
            </Button>
          </>
        }
      >
        <form onSubmit={submitAdjust} className="grid gap-4 sm:grid-cols-2">
          <Field label="Movement type">
            <Select value={adjustForm.type} onChange={(event) => setAdjustForm({ ...adjustForm, type: event.target.value })}>
              <option value="IN">Stock received (IN)</option>
              <option value="OUT">Stock used / removed (OUT)</option>
              <option value="SALE">Sold (SALE)</option>
              <option value="WASTE">Waste / breakage</option>
              <option value="ADJUST">Correction (ADJUST)</option>
            </Select>
          </Field>
          <Field label="Quantity" hint="Use a negative number for corrections">
            <Input value={adjustForm.quantity} onChange={(event) => setAdjustForm({ ...adjustForm, quantity: event.target.value })} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Input value={adjustForm.note} onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })} placeholder="Supplier delivery, damage, stock count…" />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

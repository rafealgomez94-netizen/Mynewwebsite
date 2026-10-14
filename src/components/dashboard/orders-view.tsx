'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal, Select, StatusBadge, Textarea, apiRequest, useToast } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/utils';

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  status: string;
  payment_status: string;
  total_cents: number;
  channel: string | null;
  placed_at: string;
  item_count: number;
};

type LineItem = { itemType: 'PRODUCT' | 'SERVICE'; itemId: string; name: string; quantity: number; unitPrice: string };

export function OrdersView({
  initial,
  products,
  services,
  customers,
  summary,
  topItems,
  currency,
}: {
  initial: OrderRow[];
  products: { id: string; name: string; priceCents: number; quantity: number }[];
  services: { id: string; name: string; priceCents: number }[];
  customers: { id: string; name: string }[];
  summary: { revenue: number; orders: number; avg: number };
  topItems: { name: string; units: number; revenue: number }[];
  currency: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [orders, setOrders] = useState(initial);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    status: 'PAID',
    paymentStatus: 'PAID',
    paymentMethod: 'Cash',
    channel: 'IN_STORE',
    tax: '',
    discount: '',
    notes: '',
  });
  const [items, setItems] = useState<LineItem[]>([
    { itemType: 'PRODUCT', itemId: '', name: '', quantity: 1, unitPrice: '' },
  ]);

  const reload = async () => {
    const result = await apiRequest<{ orders: OrderRow[] }>('/api/orders', { method: 'GET' });
    if (result.ok) setOrders(result.data.orders ?? []);
    router.refresh();
  };

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * item.quantity, 0),
    [items],
  );
  const total = subtotal + Number(form.tax || 0) - Number(form.discount || 0);

  const filtered = orders.filter((order) => {
    if (status && order.status !== status) return false;
    if (!search) return true;
    const query = search.toLowerCase();
    return order.order_number.toLowerCase().includes(query) || (order.customer_name ?? '').toLowerCase().includes(query);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      ...form,
      items: items
        .filter((item) => item.name.trim() && Number(item.unitPrice) >= 0)
        .map((item) => ({
          itemType: item.itemType,
          itemId: item.itemId || '',
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice || '0',
        })),
    };
    if (!payload.items.length) {
      push('Add at least one line item', 'danger');
      return;
    }
    setBusy(true);
    const result = await apiRequest('/api/orders', { body: payload });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Order recorded — stock and customer totals updated', 'success');
    setOpen(false);
    setItems([{ itemType: 'PRODUCT', itemId: '', name: '', quantity: 1, unitPrice: '' }]);
    setForm({ customerId: '', status: 'PAID', paymentStatus: 'PAID', paymentMethod: 'Cash', channel: 'IN_STORE', tax: '', discount: '', notes: '' });
    await reload();
  };

  const changeStatus = async (order: OrderRow, next: string) => {
    const result = await apiRequest('/api/orders', { method: 'PATCH', body: { id: order.id, status: next } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(`Order marked ${next.toLowerCase()}`, 'success');
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Revenue (30 days)', value: formatMoney(summary.revenue, currency) },
          { label: 'Orders (30 days)', value: String(summary.orders) },
          { label: 'Average order value', value: formatMoney(Math.round(summary.avg), currency) },
          { label: 'Top item', value: topItems[0]?.name ?? '—', hint: topItems[0] ? `${topItems[0].units} units` : undefined },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
            <p className="mt-1 truncate text-xl font-semibold">{stat.value}</p>
            {stat.hint ? <p className="muted mt-1 text-xs">{stat.hint}</p> : null}
          </Card>
        ))}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search" className="min-w-[200px] flex-1">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number or customer" />
        </Field>
        <Field label="Status" className="w-44">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Record a sale
        </Button>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Orders</h2>
          <Badge tone="info">Stock and customer totals update automatically</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b">
                {['Order', 'Customer', 'Items', 'Total', 'Channel', 'Payment', 'Status', 'Date', ''].map((column) => (
                  <th key={column} className="table-head px-4 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id} className="table-row border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{order.order_number}</td>
                  <td className="px-4 py-3">{order.customer_name ?? 'Walk-in'}</td>
                  <td className="px-4 py-3">{order.item_count}</td>
                  <td className="px-4 py-3">{formatMoney(order.total_cents, currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{(order.channel ?? 'IN_STORE').replace('_', ' ').toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.payment_status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="muted px-4 py-3 text-xs">{formatDate(order.placed_at)}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={order.status}
                      onChange={(event) => changeStatus(order, event.target.value)}
                      className="w-auto text-xs"
                      aria-label={`Update order ${order.order_number}`}
                    >
                      {['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'].map((value) => (
                        <option key={value} value={value}>
                          {value.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="muted p-5 text-sm">No orders yet. Record your first sale to start building revenue analytics.</p>
        ) : null}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a sale"
        description="Prices come from your catalogue. Recording a product sale reduces stock automatically."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              <Receipt className="h-4 w-4" /> Save order
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer">
              <Select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
                <option value="">Walk-in / not recorded</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
                {['IN_STORE', 'ONLINE', 'PHONE', 'WHATSAPP'].map((channel) => (
                  <option key={channel} value={channel}>
                    {channel.replace('_', ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment status">
              <Select value={form.paymentStatus} onChange={(event) => setForm({ ...form, paymentStatus: event.target.value })}>
                {['PAID', 'UNPAID', 'PARTIAL', 'REFUNDED'].map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment method">
              <Input value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} placeholder="Cash, card, transfer…" />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Line items</p>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[110px_1fr_90px_120px_auto]">
                <Select
                  value={item.itemType}
                  onChange={(event) => {
                    const copy = [...items];
                    copy[index] = { ...item, itemType: event.target.value as 'PRODUCT' | 'SERVICE', itemId: '', name: '' };
                    setItems(copy);
                  }}
                  aria-label="Item type"
                >
                  <option value="PRODUCT">Product</option>
                  <option value="SERVICE">Service</option>
                </Select>
                <Select
                  value={item.itemId}
                  onChange={(event) => {
                    const list = item.itemType === 'PRODUCT' ? products : services;
                    const match = list.find((entry) => entry.id === event.target.value);
                    const copy = [...items];
                    copy[index] = {
                      ...item,
                      itemId: event.target.value,
                      name: match?.name ?? '',
                      unitPrice: match ? String(match.priceCents / 100) : item.unitPrice,
                    };
                    setItems(copy);
                  }}
                  aria-label="Item"
                >
                  <option value="">Custom item…</option>
                  {(item.itemType === 'PRODUCT' ? products : services).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
                <Input
                  value={item.quantity}
                  onChange={(event) => {
                    const copy = [...items];
                    copy[index] = { ...item, quantity: Number(event.target.value) || 1 };
                    setItems(copy);
                  }}
                  aria-label="Quantity"
                  placeholder="Qty"
                />
                <Input
                  value={item.unitPrice}
                  onChange={(event) => {
                    const copy = [...items];
                    copy[index] = { ...item, unitPrice: event.target.value };
                    setItems(copy);
                  }}
                  aria-label="Unit price"
                  placeholder="Price"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setItems(items.filter((_, position) => position !== index))}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setItems([...items, { itemType: 'PRODUCT', itemId: '', name: '', quantity: 1, unitPrice: '' }])}
            >
              Add line item
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tax">
              <Input value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} placeholder="0" />
            </Field>
            <Field label="Discount">
              <Input value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} placeholder="0" />
            </Field>
            <div className="rounded-xl border p-3">
              <p className="muted text-xs">Order total</p>
              <p className="text-lg font-semibold">{formatMoney(Math.round(total * 100), currency)}</p>
              <p className="muted text-xs">Subtotal {formatMoney(Math.round(subtotal * 100), currency)}</p>
            </div>
          </div>

          <Field label="Notes">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

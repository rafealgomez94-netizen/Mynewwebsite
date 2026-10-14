'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Button as UiButton,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
  apiRequest,
  useToast,
} from '@/components/ui';
import { CUSTOMER_STATUSES } from '@/lib/domain';
import { formatDate, formatMoney } from '@/lib/utils';

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  tags: string[];
  totalSpendCents: number;
  orderCount: number;
  appointmentCount: number;
  lastInteractionAt: string | null;
  createdAt: string;
};

export function CustomersView({
  initial,
  total,
  tags,
  currency,
}: {
  initial: CustomerListItem[];
  total: number;
  tags: string[];
  currency: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [customers, setCustomers] = useState(initial);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'spend'>('recent');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    status: 'NEW',
    source: '',
    tags: '',
    notes: '',
  });

  const refresh = async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (tag) params.set('tag', tag);
    params.set('sort', sort);
    const result = await apiRequest<{ rows: CustomerListItem[]; total: number }>(
      `/api/customers?${params.toString()}`,
      { method: 'GET' },
    );
    if (result.ok) setCustomers(result.data.rows ?? []);
  };

  const filtered = useMemo(() => customers, [customers]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      status: form.status,
      source: form.source,
      tags: form.tags.split(',').map((value) => value.trim()).filter(Boolean),
      notes: form.notes,
    };
    const result = editing
      ? await apiRequest(`/api/customers/${editing.id}`, { method: 'PATCH', body: payload })
      : await apiRequest('/api/customers', { body: payload });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(editing ? 'Customer updated' : 'Customer added', 'success');
    setOpen(false);
    setEditing(null);
    setForm({ name: '', phone: '', email: '', status: 'NEW', source: '', tags: '', notes: '' });
    await refresh();
    router.refresh();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this customer? Their order history stays in reports but the profile will be removed.')) return;
    const result = await apiRequest(`/api/customers/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Customer deleted', 'success');
    await refresh();
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="Search" className="min-w-[200px] flex-1">
          <div className="relative">
            <Search className="muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') refresh();
              }}
              placeholder="Name, email or phone"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Status" className="w-40">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setTimeout(refresh, 0);
            }}
          >
            <option value="">All statuses</option>
            {CUSTOMER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tag" className="w-40">
          <Select
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
              setTimeout(refresh, 0);
            }}
          >
            <option value="">All tags</option>
            {tags.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sort" className="w-40">
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as 'recent' | 'name' | 'spend');
              setTimeout(refresh, 0);
            }}
          >
            <option value="recent">Most recent</option>
            <option value="name">Name A–Z</option>
            <option value="spend">Highest spend</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={refresh}>
          Apply filters
        </Button>
        <Button
          onClick={() => {
            setEditing(null);
            setForm({ name: '', phone: '', email: '', status: 'NEW', source: '', tags: '', notes: '' });
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New customer
        </Button>
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Customers</h2>
            <p className="muted text-xs">
              {filtered.length} shown · {total} total in this workspace
            </p>
          </div>
          <Badge tone="info">Tenant isolated</Badge>
        </div>

        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No customers match these filters"
              description="Add a customer manually, or let bookings and AI support capture them automatically."
              action={
                <UiButton onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> Add customer
                </UiButton>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b">
                  {['Customer', 'Contact', 'Status', 'Orders', 'Appointments', 'Spend', 'Last interaction', ''].map((column) => (
                    <th key={column} className="table-head px-4 py-2">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id} className="table-row border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/customers/${customer.id}`} className="font-medium hover:underline">
                        {customer.name}
                      </Link>
                      {customer.tags.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {customer.tags.slice(0, 3).map((value) => (
                            <Badge key={value} tone="neutral">
                              {value}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{customer.phone ?? '—'}</p>
                      <p className="muted text-xs">{customer.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={customer.status} />
                    </td>
                    <td className="px-4 py-3">{customer.orderCount}</td>
                    <td className="px-4 py-3">{customer.appointmentCount}</td>
                    <td className="px-4 py-3">{formatMoney(customer.totalSpendCents, currency)}</td>
                    <td className="muted px-4 py-3 text-xs">
                      {customer.lastInteractionAt ? formatDate(customer.lastInteractionAt) : formatDate(customer.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(customer);
                            setForm({
                              name: customer.name,
                              phone: customer.phone ?? '',
                              email: customer.email ?? '',
                              status: customer.status,
                              source: '',
                              tags: customer.tags.join(', '),
                              notes: '',
                            });
                            setOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(customer.id)} aria-label="Delete customer">
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New customer'}
        description="Customer records feed the AI assistant, follow-up suggestions and reports."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              {editing ? 'Save changes' : 'Add customer'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {CUSTOMER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" hint="Where this customer came from">
            <Input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Walk-in, Instagram…" />
          </Field>
          <Field label="Tags" hint="Comma separated — used for filtering" className="sm:col-span-2">
            <Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="vip, colour, bridal" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

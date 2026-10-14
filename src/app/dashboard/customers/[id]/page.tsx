import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { findCustomer } from '@/lib/db/repositories/crm';
import { all } from '@/lib/db';
import { Badge, Card, CardHeader, StatusBadge } from '@/components/ui';
import { DataTable, PageHeader, SimpleRow } from '@/components/dashboard/shared';
import { formatDate, formatDateTime, formatMoney, relativeTime } from '@/lib/utils';
import { channelLabel } from '@/lib/domain';

export const metadata: Metadata = { title: 'Customer profile' };
export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = requireTenant(await getSessionContext());
  const customer = findCustomer(ctx.business.id, id);
  if (!customer) notFound();
  const currency = ctx.business.currency;

  const orders = all<{ id: string; order_number: string; total_cents: number; status: string; placed_at: string }>(
    `SELECT id, order_number, total_cents, status, placed_at FROM orders
     WHERE business_id = ? AND customer_id = ? ORDER BY placed_at DESC LIMIT 20`,
    [ctx.business.id, customer.id],
  );

  const appointments = all<{
    id: string;
    title: string;
    start_at: string;
    status: string;
    price_cents: number;
    staff_name: string | null;
  }>(
    `SELECT a.id, a.title, a.start_at, a.status, a.price_cents, s.name AS staff_name
     FROM appointments a LEFT JOIN staff s ON s.id = a.staff_id
     WHERE a.business_id = ? AND a.customer_id = ? ORDER BY a.start_at DESC LIMIT 20`,
    [ctx.business.id, customer.id],
  );

  const conversations = all<{
    id: string;
    channel: string;
    status: string;
    last_message_at: string;
    preview: string | null;
  }>(
    `SELECT v.id, v.channel, v.status, v.last_message_at,
            (SELECT body FROM messages m WHERE m.conversation_id = v.id ORDER BY m.created_at DESC LIMIT 1) AS preview
     FROM conversations v WHERE v.business_id = ? AND v.customer_id = ? ORDER BY v.last_message_at DESC LIMIT 10`,
    [ctx.business.id, customer.id],
  );

  const documents = all<{ id: string; type: string; number: string; title: string; total_cents: number; status: string; created_at: string }>(
    `SELECT id, type, number, title, total_cents, status, created_at FROM documents
     WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 10`,
    [ctx.business.id, customer.id],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDate(customer.createdAt)} · ${customer.orderCount} orders · ${customer.appointmentCount} appointments`}
        meta={
          <>
            <StatusBadge status={customer.status} />
            {customer.tags.map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
            {customer.lastInteractionAt ? (
              <span className="muted text-xs">Last interaction {relativeTime(customer.lastInteractionAt)}</span>
            ) : null}
          </>
        }
        action={
          <Link href="/dashboard/customers" className="text-sm font-semibold text-brand-600 hover:underline">
            ← All customers
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Lifetime spend', value: formatMoney(customer.totalSpendCents, currency) },
          { label: 'Orders', value: String(customer.orderCount) },
          { label: 'Appointments', value: String(customer.appointmentCount) },
          { label: 'Customer status', value: customer.status },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="p-0">
            <div className="p-5 pb-0">
              <CardHeader title="Purchase history" description="Orders recorded in this workspace." />
            </div>
            <DataTable columns={['Order', 'Date', 'Total', 'Status']} empty="">
              {orders.map((order) => (
                <SimpleRow
                  key={order.id}
                  cells={[
                    <span key="n" className="font-medium">
                      {order.order_number}
                    </span>,
                    formatDate(order.placed_at),
                    formatMoney(order.total_cents, currency),
                    <StatusBadge key="s" status={order.status} />,
                  ]}
                />
              ))}
            </DataTable>
            {orders.length === 0 ? <p className="muted p-5 pt-0 text-sm">No orders recorded for this customer yet.</p> : null}
          </Card>

          <Card className="p-0">
            <div className="p-5 pb-0">
              <CardHeader title="Appointments" description="Past and upcoming bookings." />
            </div>
            <DataTable columns={['Appointment', 'When', 'Staff', 'Price', 'Status']} empty="">
              {appointments.map((appointment) => (
                <SimpleRow
                  key={appointment.id}
                  cells={[
                    appointment.title,
                    formatDateTime(appointment.start_at),
                    appointment.staff_name ?? 'Unassigned',
                    formatMoney(appointment.price_cents, currency),
                    <StatusBadge key="s" status={appointment.status} />,
                  ]}
                />
              ))}
            </DataTable>
            {appointments.length === 0 ? <p className="muted p-5 pt-0 text-sm">No appointments yet.</p> : null}
          </Card>

          <Card>
            <CardHeader title="Conversations" description="Support and messaging history." />
            {conversations.length === 0 ? (
              <p className="muted text-sm">No conversations recorded.</p>
            ) : (
              <ul className="space-y-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{channelLabel(conversation.channel)}</p>
                      <StatusBadge status={conversation.status} />
                    </div>
                    <p className="muted mt-1 text-xs">{conversation.preview ?? 'No messages'}</p>
                    <p className="muted mt-1 text-[11px]">{relativeTime(conversation.last_message_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact details" />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="muted text-xs">Phone</dt>
                <dd>{customer.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="muted text-xs">Email</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="muted text-xs">Address</dt>
                <dd>{customer.address ?? '—'}</dd>
              </div>
              <div>
                <dt className="muted text-xs">Birthday</dt>
                <dd>{customer.birthday ? formatDate(customer.birthday) : '—'}</dd>
              </div>
              <div>
                <dt className="muted text-xs">Source</dt>
                <dd>{customer.source ?? '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Notes" description="Internal notes visible to your team." />
            <p className="muted whitespace-pre-wrap text-sm">{customer.notes || 'No notes yet.'}</p>
          </Card>

          <Card className="p-0">
            <div className="p-5 pb-0">
              <CardHeader title="Documents" description="Invoices, quotes and receipts." />
            </div>
            {documents.length === 0 ? (
              <p className="muted px-5 pb-5 text-sm">No documents generated for this customer.</p>
            ) : (
              <ul className="divide-y">
                {documents.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{document.number}</p>
                      <p className="muted truncate text-xs">{document.title}</p>
                    </div>
                    <a
                      href={`/api/documents/${document.id}/pdf`}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

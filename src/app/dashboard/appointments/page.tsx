import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { listStaff } from '@/lib/db/repositories/accounts';
import { listServices } from '@/lib/db/repositories/catalog';
import { listCustomers } from '@/lib/db/repositories/crm';
import { appointmentSummary, listAppointments } from '@/lib/db/repositories/ops';
import { AppointmentsView } from '@/components/dashboard/appointments-view';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Appointments' };
export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const ctx = requireTenant(await getSessionContext());
  const now = new Date();
  const to = new Date(now.getTime() + 60 * 86400000).toISOString();

  const appointments = listAppointments(ctx.business.id, { limit: 200 });
  const summary = appointmentSummary(
    ctx.business.id,
    new Date(now.getTime() - 30 * 86400000).toISOString(),
    to,
  );

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Real availability from your opening hours and staff schedules, with booking, confirmation, rescheduling, cancellation and reminders."
        meta={
          <>
            <Badge tone="info">{appointments.length} in view</Badge>
            <Badge tone="neutral">Public booking page: /book/{ctx.business.slug}</Badge>
          </>
        }
        action={
          <a
            href={`/book/${ctx.business.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            Open customer booking page ↗
          </a>
        }
      />
      <AppointmentsView
        initial={appointments.map((appointment) => ({ ...appointment }))}
        services={listServices(ctx.business.id, true).map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.duration_minutes,
          priceCents: service.price_cents,
        }))}
        staff={listStaff(ctx.business.id, true).map((member) => ({ id: member.id, name: member.name }))}
        customers={listCustomers(ctx.business.id, { limit: 200, sort: 'name' }).rows.map((customer) => ({
          id: customer.id,
          name: customer.name,
        }))}
        currency={ctx.business.currency}
        summary={summary}
      />
    </div>
  );
}

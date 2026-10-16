'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, CalendarClock, Clock } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal, Select, StatusBadge, Textarea, apiRequest, useToast } from '@/components/ui';
import { formatDateTime, formatMoney } from '@/lib/utils';

export type AppointmentItem = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  price_cents: number;
  staff_id: string | null;
  staff_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  service_id: string | null;
  service_name: string | null;
  source: string | null;
  notes: string | null;
};

type Slot = { startAt: string; endAt: string; staffId: string | null; staffName: string | null };

export function AppointmentsView({
  initial,
  services,
  staff,
  customers,
  currency,
  summary,
}: {
  initial: AppointmentItem[];
  services: { id: string; name: string; durationMinutes: number; priceCents: number }[];
  staff: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  currency: string;
  summary: { total: number; completed: number; cancelled: number; upcoming: number; revenue: number };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [appointments, setAppointments] = useState(initial);
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reschedule, setReschedule] = useState<AppointmentItem | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '', staffId: '' });
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [form, setForm] = useState({
    title: '',
    customerId: '',
    staffId: '',
    serviceId: '',
    startAt: '',
    endAt: '',
    price: '',
    status: 'CONFIRMED',
    notes: '',
  });

  const reload = async () => {
    const result = await apiRequest<{ appointments: AppointmentItem[] }>('/api/appointments?limit=200', { method: 'GET' });
    if (result.ok) setAppointments(result.data.appointments ?? []);
    router.refresh();
  };

  const loadAvailability = async (day: string, staffId: string, serviceId: string) => {
    if (!day) return;
    setLoadingSlots(true);
    const duration = services.find((service) => service.id === serviceId)?.durationMinutes ?? 60;
    const params = new URLSearchParams({ availability: 'true', day, duration: String(duration) });
    if (staffId) params.set('staffId', staffId);
    const result = await apiRequest<{ slots: Slot[] }>(`/api/appointments?${params.toString()}`, { method: 'GET' });
    setLoadingSlots(false);
    if (result.ok) setSlots(result.data.slots ?? []);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/appointments', { body: form });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Appointment booked', 'success');
    setOpen(false);
    setForm({ title: '', customerId: '', staffId: '', serviceId: '', startAt: '', endAt: '', price: '', status: 'CONFIRMED', notes: '' });
    setSlots([]);
    await reload();
  };

  const updateStatus = async (appointment: AppointmentItem, status: string) => {
    setAppointments((current) => current.map((item) => (item.id === appointment.id ? { ...item, status } : item)));
    const result = await apiRequest('/api/appointments', { method: 'PATCH', body: { id: appointment.id, status } });
    if (!result.ok) {
      push(result.error, 'danger');
      await reload();
      return;
    }
    push(`Marked as ${status.toLowerCase()}`, 'success');
    await reload();
  };

  /**
   * Rescheduling opens the same real availability the booking form uses, so a moved
   * appointment lands in a free slot instead of on top of another customer.
   */
  const openReschedule = async (appointment: AppointmentItem) => {
    const start = appointment.start_at.slice(0, 16);
    setReschedule(appointment);
    setRescheduleForm({ date: start.slice(0, 10), time: start.slice(11, 16), staffId: appointment.staff_id ?? '' });
    await loadRescheduleSlots(start.slice(0, 10), appointment.staff_id ?? '', appointment.service_id ?? '');
  };

  const loadRescheduleSlots = async (day: string, staffId: string, serviceId: string) => {
    if (!day) return;
    setLoadingRescheduleSlots(true);
    const duration = services.find((service) => service.id === serviceId)?.durationMinutes ?? 60;
    const params = new URLSearchParams({ availability: 'true', day, duration: String(duration) });
    if (staffId) params.set('staffId', staffId);
    const result = await apiRequest<{ slots: Slot[] }>(`/api/appointments?${params.toString()}`, { method: 'GET' });
    setLoadingRescheduleSlots(false);
    if (result.ok) setRescheduleSlots(result.data.slots ?? []);
  };

  const submitReschedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reschedule) return;
    setRescheduling(true);
    const duration = services.find((service) => service.id === reschedule.service_id)?.durationMinutes
      ?? Math.max(Math.round((new Date(reschedule.end_at).getTime() - new Date(reschedule.start_at).getTime()) / 60000), 15);
    const [hours, minutes] = rescheduleForm.time.split(':').map(Number);
    const end = new Date(Date.UTC(2024, 0, 1, hours, minutes + duration));
    const endTime = `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`;
    const result = await apiRequest('/api/appointments', {
      method: 'PATCH',
      body: {
        id: reschedule.id,
        startAt: new Date(`${rescheduleForm.date}T${rescheduleForm.time}:00Z`).toISOString(),
        endAt: new Date(`${rescheduleForm.date}T${endTime}:00Z`).toISOString(),
        staffId: rescheduleForm.staffId,
      },
    });
    setRescheduling(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Appointment rescheduled — the customer keeps the same booking reference', 'success');
    setReschedule(null);
    setRescheduleSlots([]);
    await reload();
  };

  const sendDueReminders = async () => {
    setSendingReminders(true);
    const result = await apiRequest<{ due: number; sent: number; skipped: number }>('/api/appointments/reminders', { method: 'POST' });
    setSendingReminders(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    const { sent, due } = result.data;
    if (sent === 0) {
      push(due === 0 ? 'No reminders are due right now.' : 'Nothing sent — check the customer email addresses.', 'info');
      return;
    }
    push(`${sent} reminder${sent === 1 ? '' : 's'} sent`, 'success');
    await reload();
  };

  const filtered = statusFilter ? appointments.filter((appointment) => appointment.status === statusFilter) : appointments;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Appointments (period)', value: String(summary.total) },
          { label: 'Completed', value: String(summary.completed) },
          { label: 'Cancelled / no-show', value: String(summary.cancelled) },
          { label: 'Appointment revenue', value: formatMoney(summary.revenue, currency) },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-48">
          <option value="">All statuses</option>
          {['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((status) => (
            <option key={status} value={status}>
              {status.replace('_', ' ')}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={sendDueReminders} loading={sendingReminders}>
            <BellRing className="h-4 w-4" /> Send due reminders
          </Button>
          <Button
            onClick={async () => {
              setOpen(true);
              const today = new Date().toISOString().slice(0, 10);
              await loadAvailability(today, '', '');
            }}
          >
            <CalendarClock className="h-4 w-4" /> New appointment
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b">
                {['Appointment', 'When', 'Customer', 'Staff', 'Price', 'Source', 'Status', ''].map((column) => (
                  <th key={column} className="table-head px-4 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((appointment) => (
                <tr key={appointment.id} className="table-row border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{appointment.title}</td>
                  <td className="px-4 py-3">{formatDateTime(appointment.start_at)}</td>
                  <td className="px-4 py-3">{appointment.customer_name ?? '—'}</td>
                  <td className="px-4 py-3">{appointment.staff_name ?? 'Unassigned'}</td>
                  <td className="px-4 py-3">{formatMoney(appointment.price_cents, currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{appointment.source?.replace('_', ' ').toLowerCase() ?? 'dashboard'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={appointment.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={appointment.status}
                        onChange={(event) => updateStatus(appointment, event.target.value)}
                        className="w-auto text-xs"
                        aria-label={`Change status for ${appointment.title}`}
                      >
                        {['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((status) => (
                          <option key={status} value={status}>
                            {status.replace('_', ' ').toLowerCase()}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openReschedule(appointment)}
                        aria-label={`Reschedule ${appointment.title}`}
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="muted p-5 text-sm">
            No appointments in this period. Book one here, or share your online booking page so customers can book themselves.
          </p>
        ) : null}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New appointment"
        description="Availability is calculated from your opening hours, staff schedules and existing bookings — no double bookings."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Book appointment
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Haircut — Naledi" />
          </Field>
          <Field label="Service">
            <Select
              value={form.serviceId}
              onChange={async (event) => {
                const serviceId = event.target.value;
                const service = services.find((item) => item.id === serviceId);
                setForm({ ...form, serviceId, price: service ? String(service.priceCents / 100) : form.price });
                if (form.startAt) await loadAvailability(form.startAt.slice(0, 10), form.staffId, serviceId);
              }}
            >
              <option value="">No specific service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {formatMoney(service.priceCents, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Staff">
            <Select
              value={form.staffId}
              onChange={async (event) => {
                setForm({ ...form, staffId: event.target.value });
                if (form.startAt) await loadAvailability(form.startAt.slice(0, 10), event.target.value, form.serviceId);
              }}
            >
              <option value="">Any available</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
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
          <Field label="Date">
            <Input
              type="date"
              onChange={async (event) => {
                const day = event.target.value;
                setForm({ ...form, startAt: `${day}T09:00`, endAt: `${day}T10:00` });
                await loadAvailability(day, form.staffId, form.serviceId);
              }}
            />
          </Field>
          <Field label="Start time" required>
            <Input
              required
              type="time"
              value={form.startAt.slice(11, 16)}
              onChange={(event) => {
                const day = form.startAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
                const duration = services.find((service) => service.id === form.serviceId)?.durationMinutes ?? 60;
                const [hours, minutes] = event.target.value.split(':').map(Number);
                const end = new Date(Date.UTC(2024, 0, 1, hours, minutes + duration));
                setForm({
                  ...form,
                  startAt: `${day}T${event.target.value}`,
                  endAt: `${day}T${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`,
                });
              }}
            />
          </Field>
          <Field label="End time" required>
            <Input required type="time" value={form.endAt.slice(11, 16)} onChange={(event) => setForm({ ...form, endAt: `${form.endAt.slice(0, 10) || new Date().toISOString().slice(0, 10)}T${event.target.value}` })} />
          </Field>
          <Field label="Price">
            <Input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {['PENDING', 'CONFIRMED'].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>

        <div className="mt-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-600" aria-hidden />
            <p className="text-sm font-semibold">Available slots for the selected day</p>
            {loadingSlots ? <span className="muted text-xs">Checking…</span> : null}
          </div>
          {slots.length === 0 && !loadingSlots ? (
            <p className="muted mt-2 text-xs">No open slots found for that day — try another date or staff member.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {slots.map((slot) => (
                <Button
                  key={`${slot.startAt}-${slot.staffId ?? 'any'}`}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      startAt: slot.startAt.slice(0, 16),
                      endAt: slot.endAt.slice(0, 16),
                      staffId: slot.staffId ?? form.staffId,
                    })
                  }
                >
                  {slot.startAt.slice(11, 16)}
                  {slot.staffName ? ` · ${slot.staffName}` : ''}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(reschedule)}
        onClose={() => setReschedule(null)}
        title={reschedule ? `Reschedule: ${reschedule.title}` : 'Reschedule'}
        description="Pick a new day and time from the real availability for this service and staff member. The appointment keeps its history and notes."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReschedule(null)}>
              Keep current time
            </Button>
            <Button onClick={submitReschedule} loading={rescheduling}>
              Move appointment
            </Button>
          </>
        }
      >
        <form onSubmit={submitReschedule} className="grid gap-4 sm:grid-cols-2">
          <Field label="Currently booked">
            <p className="text-sm">{reschedule ? formatDateTime(reschedule.start_at) : '—'}</p>
          </Field>
          <Field label="Staff">
            <Select
              value={rescheduleForm.staffId}
              onChange={async (event) => {
                setRescheduleForm({ ...rescheduleForm, staffId: event.target.value });
                await loadRescheduleSlots(rescheduleForm.date, event.target.value, reschedule?.service_id ?? '');
              }}
            >
              <option value="">Any available</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New date" required>
            <Input
              required
              type="date"
              value={rescheduleForm.date}
              onChange={async (event) => {
                setRescheduleForm({ ...rescheduleForm, date: event.target.value });
                await loadRescheduleSlots(event.target.value, rescheduleForm.staffId, reschedule?.service_id ?? '');
              }}
            />
          </Field>
          <Field label="New start time" required>
            <Input
              required
              type="time"
              value={rescheduleForm.time}
              onChange={(event) => setRescheduleForm({ ...rescheduleForm, time: event.target.value })}
            />
          </Field>
          {reschedule?.customer_name ? (
            <p className="muted text-xs sm:col-span-2">
              {reschedule.customer_name} keeps the booking and the reminder for the new time is sent automatically.
            </p>
          ) : null}
        </form>

        <div className="mt-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-600" aria-hidden />
            <p className="text-sm font-semibold">Free slots for that day</p>
            {loadingRescheduleSlots ? <span className="muted text-xs">Checking…</span> : null}
          </div>
          {rescheduleSlots.length === 0 && !loadingRescheduleSlots ? (
            <p className="muted mt-2 text-xs">
              No open slots for that day — every slot is booked, or the business is closed. Try another date or staff member.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {rescheduleSlots.map((slot) => (
                <Button
                  key={`${slot.startAt}-${slot.staffId ?? 'any'}`}
                  type="button"
                  size="sm"
                  variant={rescheduleForm.time === slot.startAt.slice(11, 16) ? 'primary' : 'secondary'}
                  onClick={() =>
                    setRescheduleForm({
                      ...rescheduleForm,
                      date: slot.startAt.slice(0, 10),
                      time: slot.startAt.slice(11, 16),
                      staffId: slot.staffId ?? rescheduleForm.staffId,
                    })
                  }
                >
                  {slot.startAt.slice(11, 16)}
                  {slot.staffName ? ` · ${slot.staffName}` : ''}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

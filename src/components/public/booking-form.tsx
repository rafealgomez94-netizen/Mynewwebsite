'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, apiRequest } from '@/components/ui';
import { formatMoney, formatTime } from '@/lib/utils';

type Slot = { startAt: string; endAt: string; staffId: string | null; staffName: string | null };

export function BookingForm({
  slug,
  services,
  staff,
  currency,
  days,
}: {
  slug: string;
  services: { id: string; name: string; priceCents: number; durationMinutes: number }[];
  staff: { id: string; name: string }[];
  currency: string;
  days: { iso: string; label: string }[];
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [staffId, setStaffId] = useState('');
  const [day, setDay] = useState(days[0]?.iso ?? new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', customerEmail: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ startAt: string; service: string; priceCents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(() => services.find((entry) => entry.id === serviceId), [serviceId, services]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const result = await apiRequest<{ slots: Slot[] }>(
        `/api/appointments?availability=true&day=${day}&duration=${service?.durationMinutes ?? 60}&staffId=${staffId}`,
        { method: 'GET' },
      );
      if (!active) return;
      setSlots(result.ok ? result.data.slots ?? [] : []);
      setSelected(null);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [day, serviceId, staffId, service?.durationMinutes]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Choose an available time first.');
      return;
    }
    setError(null);
    setBusy(true);
    const result = await apiRequest<{ appointment: { startAt: string; service: string; priceCents: number } }>(
      '/api/public/book',
      {
        body: {
          businessSlug: slug,
          serviceId,
          staffId: selected.staffId ?? '',
          startAt: selected.startAt,
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail,
          notes: form.notes,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(result.data.appointment);
  };

  if (done) {
    return (
      <Card>
        <CardHeader title="Your appointment is booked" description="A confirmation has been sent where possible." />
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <Check className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="font-semibold">{done.service}</p>
            <p className="muted">
              {new Date(done.startAt).toISOString().slice(0, 10)} at {formatTime(done.startAt)} ·{' '}
              {formatMoney(done.priceCents, currency)}
            </p>
          </div>
        </div>
        <p className="muted mt-3 text-sm">
          Need to change it? Reply to your confirmation or contact the business directly — rescheduling is handled from
          the dashboard.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Book an appointment"
        description="Only real, available times are shown — availability comes from the business hours and existing bookings."
        action={<CalendarCheck className="h-4 w-4 text-brand-600" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Service">
          <Select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            {services.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · {formatMoney(entry.priceCents, currency)} · {entry.durationMinutes} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Team member">
          <Select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            <option value="">Any available</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Day">
          <Select value={day} onChange={(event) => setDay(event.target.value)}>
            {days.map((entry) => (
              <option key={entry.iso} value={entry.iso}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold">Available times</p>
        {loading ? (
          <p className="muted mt-2 text-sm">Checking availability…</p>
        ) : slots.length === 0 ? (
          <Alert tone="warning" title="No free slots on this day">
            Try another day or choose “Any available” team member.
          </Alert>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={`${slot.startAt}-${slot.staffId ?? 'any'}`}
                type="button"
                onClick={() => setSelected(slot)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  selected?.startAt === slot.startAt && selected?.staffId === slot.staffId
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'hover:bg-[rgb(var(--surface-muted))]'
                }`}
              >
                {formatTime(slot.startAt)}
                {slot.staffName ? <span className="opacity-80"> · {slot.staffName}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Your name" required className="sm:col-span-2">
          <Input
            required
            value={form.customerName}
            onChange={(event) => setForm({ ...form, customerName: event.target.value })}
          />
        </Field>
        <Field label="Phone / WhatsApp">
          <Input value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.customerEmail}
            onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
          />
        </Field>
        <Field label="Anything we should know?" className="sm:col-span-2">
          <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>

        {selected ? (
          <p className="sm:col-span-2">
            <Badge tone="brand">
              Selected {formatTime(selected.startAt)} — {service?.name ?? 'appointment'}
              {selected.staffName ? ` with ${selected.staffName}` : ''}
            </Badge>
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}

        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!selected}>
            Confirm booking
          </Button>
        </div>
      </form>
    </Card>
  );
}

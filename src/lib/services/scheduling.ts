import { bookedSlots } from '@/lib/db/repositories/ops';
import { listStaff, type BusinessRow, hoursFor, type StaffRow } from '@/lib/db/repositories/accounts';

export type Slot = { startAt: string; endAt: string; staffId: string | null; staffName: string | null };

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return (hours || 0) * 60 + (minutes || 0);
}

function toIso(dayIso: string, minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${dayIso}T${hours}:${mins}:00.000Z`;
}

/**
 * Availability engine: business hours ∩ staff availability − existing bookings.
 * Used both by the dashboard calendar and by the AI booking flow, so the AI can
 * only ever offer slots that genuinely exist.
 */
export function availableSlots(input: {
  business: BusinessRow;
  dayIso: string;
  durationMinutes?: number;
  staffId?: string | null;
  stepMinutes?: number;
}): Slot[] {
  const { business, dayIso } = input;
  const duration = input.durationMinutes ?? 60;
  const step = input.stepMinutes ?? 30;
  const dayKey = DAY_KEYS[new Date(`${dayIso}T00:00:00.000Z`).getUTCDay()];
  const businessHours = hoursFor(business).find((entry) => entry.day === dayKey);
  if (!businessHours || businessHours.closed) return [];

  const openMinutes = minutesFromTime(businessHours.open);
  const closeMinutes = minutesFromTime(businessHours.close);
  const booked = bookedSlots(business.id, dayIso, input.staffId ?? null);

  const staffPool: (StaffRow | null)[] = input.staffId
    ? listStaff(business.id, true).filter((member) => member.id === input.staffId)
    : listStaff(business.id, true);
  const useStaff = staffPool.length ? staffPool : [null];

  const slots: Slot[] = [];
  for (let start = openMinutes; start + duration <= closeMinutes; start += step) {
    const startIso = toIso(dayIso, start);
    const endIso = toIso(dayIso, start + duration);
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (startMs < Date.now()) continue;

    for (const member of useStaff) {
      if (member) {
        const availability = member.availability_json ? (JSON.parse(member.availability_json) as Record<string, { start: string; end: string }[]>) : {};
        const windows = availability[dayKey] ?? [];
        const withinShift = windows.some(
          (window) => start >= minutesFromTime(window.start) && start + duration <= minutesFromTime(window.end),
        );
        if (!withinShift) continue;
      }
      const overlaps = booked.some((booking) => {
        const bookingStart = new Date(booking.start_at).getTime();
        const bookingEnd = new Date(booking.end_at).getTime();
        const sameStaff = member ? booking.staff_id === member.id || booking.staff_id === null : true;
        return sameStaff && startMs < bookingEnd && endMs > bookingStart;
      });
      if (overlaps) continue;
      slots.push({
        startAt: startIso,
        endAt: endIso,
        staffId: member?.id ?? null,
        staffName: member?.name ?? null,
      });
      if (member) break; // first free staff member wins for this time slot
    }
  }
  return slots.slice(0, 40);
}

export function findNextAvailableSlot(input: {
  business: BusinessRow;
  fromDayIso?: string;
  durationMinutes?: number;
  staffId?: string | null;
  daysToSearch?: number;
}): Slot | null {
  const days = input.daysToSearch ?? 14;
  for (let offset = 0; offset <= days; offset += 1) {
    const day = new Date(`${input.fromDayIso ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + offset);
    const slots = availableSlots({
      business: input.business,
      dayIso: day.toISOString().slice(0, 10),
      durationMinutes: input.durationMinutes,
      staffId: input.staffId,
    });
    if (slots.length) return slots[0];
  }
  return null;
}

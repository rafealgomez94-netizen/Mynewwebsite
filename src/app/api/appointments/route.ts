import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { appointmentSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import {
  appointmentSummary,
  createAppointment,
  deleteAppointment,
  findAppointment,
  listAppointments,
  updateAppointment,
} from '@/lib/db/repositories/ops';
import { availableSlots } from '@/lib/services/scheduling';
import { parseMoneyToCents } from '@/lib/utils';
import { audit, notify } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'appointments:read');
    const url = new URL(request.url);

    // Availability mode powers both the calendar view and the AI booking flow.
    if (url.searchParams.get('availability') === 'true') {
      const day = url.searchParams.get('day') ?? new Date().toISOString().slice(0, 10);
      const duration = Number(url.searchParams.get('duration') ?? 60);
      return ok({
        day,
        slots: availableSlots({
          business: ctx.business,
          dayIso: day.slice(0, 10),
          durationMinutes: duration,
          staffId: url.searchParams.get('staffId') ?? null,
        }),
      });
    }

    const from = url.searchParams.get('from') ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const to = url.searchParams.get('to') ?? new Date(Date.now() + 30 * 86400000).toISOString();
    return ok({
      appointments: listAppointments(ctx.business.id, {
        fromIso: from,
        toIso: to,
        status: url.searchParams.get('status') ?? undefined,
        staffId: url.searchParams.get('staffId') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? 300),
      }),
      summary: appointmentSummary(ctx.business.id, from, to),
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Double-booking protection for the assigned staff member.
 *
 * Both booking (`POST`) and rescheduling (`PATCH`) go through here, so moving an
 * appointment onto an occupied slot is rejected exactly like creating one there.
 * `excludeId` is the appointment being moved — it must not conflict with itself.
 * Cancelled and no-show appointments free their slot.
 */
async function assertNoConflict(input: {
  businessId: string;
  staffId: string | null;
  start: Date;
  end: Date;
  excludeId?: string;
}): Promise<void> {
  const { businessId, staffId, start, end, excludeId } = input;
  const conflicts = listAppointments(businessId, {
    fromIso: new Date(start.getTime() - 86400000).toISOString(),
    toIso: new Date(end.getTime() + 86400000).toISOString(),
    staffId: staffId ?? undefined,
  }).filter((appointment) => {
    if (appointment.id === excludeId) return false;
    if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) return false;
    const existingStart = new Date(appointment.start_at).getTime();
    const existingEnd = new Date(appointment.end_at).getTime();
    return start.getTime() < existingEnd && end.getTime() > existingStart;
  });
  if (conflicts.length) {
    throw new HttpError(409, 'That time overlaps an existing appointment for this staff member.', 'conflict');
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'appointments:write');
    const input = await parseBody(request, appointmentSchema);

    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new HttpError(422, 'Provide a valid start and end time.', 'invalid_time');
    }
    if (end <= start) throw new HttpError(422, 'The end time must be after the start time.', 'invalid_time');

    await assertNoConflict({
      businessId: ctx.business.id,
      staffId: input.staffId || null,
      start,
      end,
    });

    const id = createAppointment(ctx.business.id, {
      title: input.title,
      customerId: input.customerId || null,
      staffId: input.staffId || null,
      serviceId: input.serviceId || null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: input.status,
      priceCents: parseMoneyToCents(input.price),
      location: input.location || null,
      notes: input.notes || null,
      source: input.source ?? 'DASHBOARD',
      createdById: ctx.userId,
    });

    await notify({
      businessId: ctx.business.id,
      type: 'NEW_APPOINTMENT',
      title: `New appointment: ${input.title}`,
      body: `${start.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      href: '/dashboard/appointments',
      entityType: 'appointment',
      entityId: id,
    });

    return ok({ id }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'appointments:write');
    const input = await parseBody(
      request,
      z.object({ id: z.string().min(3) }).and(
        z.object({
          status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
          startAt: z.string().optional(),
          endAt: z.string().optional(),
          staffId: z.string().optional(),
          notes: z.string().optional(),
        }),
      ),
    );

    const existing = findAppointment(ctx.business.id, input.id);
    if (!existing) throw new HttpError(404, 'Appointment not found.', 'not_found', { id: input.id });

    // Resolve the appointment as it will be after this update, so a partial change
    // (only the time, only the staff member) is validated against the full slot.
    const nextStart = input.startAt ? new Date(input.startAt) : new Date(existing.start_at);
    const nextEnd = input.endAt ? new Date(input.endAt) : new Date(existing.end_at);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      throw new HttpError(422, 'Provide a valid start and end time.', 'invalid_time');
    }
    if (nextEnd <= nextStart) {
      throw new HttpError(422, 'The end time must be after the start time.', 'invalid_time');
    }
    const nextStaffId = input.staffId === undefined ? existing.staff_id : input.staffId || null;

    const timeMoved = input.startAt !== undefined || input.endAt !== undefined;
    const staffMoved = input.staffId !== undefined && nextStaffId !== existing.staff_id;
    const reopening = input.status !== undefined && ['PENDING', 'CONFIRMED'].includes(input.status);
    if ((timeMoved || staffMoved || reopening) && input.status !== 'CANCELLED' && input.status !== 'NO_SHOW') {
      await assertNoConflict({
        businessId: ctx.business.id,
        staffId: nextStaffId,
        start: nextStart,
        end: nextEnd,
        excludeId: existing.id,
      });
    }

    updateAppointment(ctx.business.id, input.id, {
      status: input.status,
      startAt: timeMoved ? nextStart.toISOString() : undefined,
      endAt: timeMoved ? nextEnd.toISOString() : undefined,
      staffId: input.staffId === undefined ? undefined : nextStaffId,
      notes: input.notes,
      // A moved appointment is a new appointment to the customer: clear the reminder
      // stamp so the reminder job sends one for the new time instead of staying silent.
      reminderSentAt: timeMoved ? null : undefined,
    });

    const summary = `${nextStart.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    if (timeMoved || staffMoved) {
      await notify({
        businessId: ctx.business.id,
        type: 'APPOINTMENT_RESCHEDULED',
        title: `Rescheduled: ${existing.title}`,
        body: `Moved to ${summary}${nextStaffId !== existing.staff_id ? ' (staff changed)' : ''}.`,
        href: '/dashboard/appointments',
        entityType: 'appointment',
        entityId: existing.id,
      });
    }
    if (input.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      await notify({
        businessId: ctx.business.id,
        type: 'APPOINTMENT_CANCELLED',
        title: `Cancelled: ${existing.title}`,
        body: `Was booked for ${summary}. The customer should be told the slot is free again.`,
        level: 'WARNING',
        href: '/dashboard/appointments',
        entityType: 'appointment',
        entityId: existing.id,
      });
    }

    audit({
      businessId: ctx.business.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.session.user.email,
      action: timeMoved || staffMoved ? 'appointment.rescheduled' : 'appointment.updated',
      entityType: 'appointment',
      entityId: existing.id,
      meta: {
        status: input.status ?? existing.status,
        startAt: nextStart.toISOString(),
        staffId: nextStaffId,
      },
    });

    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'appointments:write');
    const { id } = await parseBody(request, z.object({ id: z.string().min(3) }));
    deleteAppointment(ctx.business.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

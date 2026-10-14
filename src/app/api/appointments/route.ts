import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { appointmentSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import {
  appointmentSummary,
  createAppointment,
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from '@/lib/db/repositories/ops';
import { availableSlots } from '@/lib/services/scheduling';
import { parseMoneyToCents } from '@/lib/utils';
import { notify } from '@/lib/services/notify';

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

    // Double-booking protection for the assigned staff member.
    const conflicts = listAppointments(ctx.business.id, {
      fromIso: new Date(start.getTime() - 86400000).toISOString(),
      toIso: new Date(end.getTime() + 86400000).toISOString(),
      staffId: input.staffId || undefined,
    }).filter((appointment) => {
      if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) return false;
      const existingStart = new Date(appointment.start_at).getTime();
      const existingEnd = new Date(appointment.end_at).getTime();
      return start.getTime() < existingEnd && end.getTime() > existingStart;
    });
    if (conflicts.length) {
      throw new HttpError(409, 'That time overlaps an existing appointment for this staff member.', 'conflict');
    }

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
    updateAppointment(ctx.business.id, input.id, {
      status: input.status,
      startAt: input.startAt ? new Date(input.startAt).toISOString() : undefined,
      endAt: input.endAt ? new Date(input.endAt).toISOString() : undefined,
      staffId: input.staffId || undefined,
      notes: input.notes,
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

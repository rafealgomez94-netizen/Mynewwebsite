import { z } from 'zod';
import { assertRateLimit, fail, handleError, ok } from '@/lib/api/http';
import { publicBookingSchema } from '@/lib/validation';
import { findBusinessBySlug } from '@/lib/db/repositories/accounts';
import { findService } from '@/lib/db/repositories/catalog';
import {
  bookedSlots,
  countAppointmentsInMonth,
  createAppointment,
  findAppointment,
} from '@/lib/db/repositories/ops';
import { createCustomer, updateCustomer } from '@/lib/db/repositories/crm';
import { all } from '@/lib/db';
import { notify } from '@/lib/services/notify';
import { sendAppointmentReminderEmail } from '@/lib/mailer';
import { formatDateTime } from '@/lib/utils';
import { planForBusiness } from '@/lib/db/repositories/platform';
import { HttpError } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Customer-facing self-booking (public booking page + AI assisted booking). */
export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'public-book', 10, 10 * 60 * 1000);
    const input = publicBookingSchema.parse(await request.json());

    const business = findBusinessBySlug(input.businessSlug);
    if (!business) return fail(404, 'Business not found.', 'not_found');

    const service = input.serviceId ? findService(business.id, input.serviceId) : undefined;
    const duration = service?.duration_minutes ?? 60;
    const start = new Date(input.startAt);
    if (Number.isNaN(start.getTime())) throw new HttpError(422, 'Choose a valid date and time.', 'invalid_time');
    const end = new Date(start.getTime() + duration * 60000);

    // Server-side conflict check — the client cannot be trusted to pick free slots.
    const dayIso = start.toISOString().slice(0, 10);
    const existing = bookedSlots(business.id, dayIso, input.staffId || null);
    const overlaps = existing.some((booking) => {
      const bookingStart = new Date(booking.start_at).getTime();
      const bookingEnd = new Date(booking.end_at).getTime();
      return start.getTime() < bookingEnd && end.getTime() > bookingStart;
    });
    if (overlaps) throw new HttpError(409, 'That time has just been booked. Please pick another slot.', 'slot_taken');

    /**
     * Plan limit: the business's monthly appointment allowance. This is customer-facing, so it
     * never mentions plans or billing — the customer is told to contact the business, and the
     * business is told (once per month, when the allowance is first exhausted) so it can upgrade
     * instead of quietly losing bookings.
     */
    const { plan } = planForBusiness(business.id);
    const bookedThisMonth = countAppointmentsInMonth(business.id, new Date().toISOString());
    if (bookedThisMonth >= plan.limits.appointments) {
      if (bookedThisMonth === plan.limits.appointments) {
        await notify({
          businessId: business.id,
          type: 'BUSINESS_ALERT',
          title: 'Online booking is full for this month',
          body: `${plan.name} includes ${plan.limits.appointments} appointments per month and all of them are booked, so new online requests are being turned away. Upgrade the plan or take the booking by phone.`,
          level: 'CRITICAL',
          href: '/dashboard/billing',
        });
      }
      return fail(
        409,
        `Online booking is not available at the moment. Please ${business.phone ? `call ${business.phone}` : 'contact the business directly'} and the team will help you.`,
        'booking_unavailable',
      );
    }

    let customerId: string | null = null;
    if (input.customerEmail || input.customerPhone) {
      const match = all<{ id: string; status: string }>(
        `SELECT id, status FROM customers WHERE business_id = ? AND (lower(coalesce(email,'')) = lower(?) OR (coalesce(phone,'') <> '' AND coalesce(phone,'') = ?)) LIMIT 1`,
        [business.id, input.customerEmail ?? '', input.customerPhone ?? ''],
      )[0];
      if (match) {
        customerId = match.id;
        updateCustomer(business.id, match.id, {
          status: match.status === 'NEW' || match.status === 'LEAD' ? 'ACTIVE' : match.status,
        });
      } else {
        customerId = createCustomer(business.id, {
          name: input.customerName,
          email: input.customerEmail || null,
          phone: input.customerPhone || null,
          status: 'NEW',
          source: 'Online booking',
          tags: ['online-booking'],
        }).id;
      }
    }

    const appointmentId = createAppointment(business.id, {
      title: service?.name ? `${service.name} — ${input.customerName}` : `Appointment — ${input.customerName}`,
      customerId,
      staffId: input.staffId || null,
      serviceId: service?.id ?? null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: 'CONFIRMED',
      priceCents: service?.price_cents ?? 0,
      notes: input.notes || null,
      source: 'PUBLIC_BOOKING',
    });

    await notify({
      businessId: business.id,
      type: 'NEW_APPOINTMENT',
      title: `Online booking: ${input.customerName}`,
      body: `${service?.name ?? 'Appointment'} · ${formatDateTime(start.toISOString())} UTC`,
      href: '/dashboard/appointments',
      entityType: 'appointment',
      entityId: appointmentId,
    });

    if (input.customerEmail) {
      await sendAppointmentReminderEmail({
        to: input.customerEmail,
        customerName: input.customerName,
        businessName: business.name,
        when: `${formatDateTime(start.toISOString())} UTC`,
        service: service?.name ?? 'your appointment',
      }).catch((error) => console.warn('[booking] confirmation email failed', error));
    }

    return ok(
      {
        appointmentId,
        appointment: findAppointment(business.id, appointmentId)
          ? {
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              service: service?.name ?? 'Appointment',
              priceCents: service?.price_cents ?? 0,
            }
          : null,
        business: { name: business.name, phone: business.phone, currency: business.currency },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return handleError(error);
    return handleError(error);
  }
}

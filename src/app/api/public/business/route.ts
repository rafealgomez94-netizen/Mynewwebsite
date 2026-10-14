import { assertRateLimit, fail, handleError, ok } from '@/lib/api/http';
import { findBusinessBySlug, hoursFor, listStaff } from '@/lib/db/repositories/accounts';
import { listServices } from '@/lib/db/repositories/catalog';
import { listFaqs } from '@/lib/db/repositories/knowledge';
import { getSupportSettings } from '@/lib/db/repositories/comms';
import { availableSlots } from '@/lib/services/scheduling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public (unauthenticated) business profile used by the booking page and the
 * support widget. It exposes only customer-facing information: services and
 * prices, opening hours, staff names and FAQs — never CRM, orders or revenue.
 */
export async function GET(request: Request) {
  try {
    assertRateLimit(request, 'public-business', 60, 60 * 1000);
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug') ?? '';
    const business = findBusinessBySlug(slug);
    if (!business) return fail(404, 'Business not found.', 'not_found');

    const day = url.searchParams.get('day');
    const sessions = getSupportSettings(business.id);

    return ok({
      business: {
        name: business.name,
        slug: business.slug,
        type: business.type,
        description: business.description,
        address: business.address,
        city: business.city,
        country: business.country,
        phone: business.phone,
        email: business.email,
        website: business.website,
        currency: business.currency,
        timezone: business.timezone,
        hours: hoursFor(business),
      },
      services: listServices(business.id, true).map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        priceCents: service.price_cents,
        durationMinutes: service.duration_minutes,
      })),
      staff: listStaff(business.id, true).map((member) => ({
        id: member.id,
        name: member.name,
        title: member.title,
        specialties: member.specialties ? (JSON.parse(member.specialties) as string[]) : [],
      })),
      faqs: listFaqs(business.id, true).slice(0, 20).map((faq) => ({ question: faq.question, answer: faq.answer })),
      support: { widgetEnabled: Boolean(sessions.widget_enabled), greeting: sessions.greeting },
      availability: day
        ? availableSlots({ business, dayIso: day.slice(0, 10), durationMinutes: 60 }).slice(0, 12)
        : [],
    });
  } catch (error) {
    return handleError(error);
  }
}

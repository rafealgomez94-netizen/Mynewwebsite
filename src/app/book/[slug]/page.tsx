import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { findBusinessBySlug, hoursFor, listStaff } from '@/lib/db/repositories/accounts';
import { listServices } from '@/lib/db/repositories/catalog';
import { businessTypeLabel } from '@/lib/domain';
import { formatTime } from '@/lib/utils';
import { BookingForm } from '@/components/public/booking-form';
import { WhatsAppWidget } from '@/components/public/whatsapp-widget';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const business = findBusinessBySlug(slug);
  return {
    title: business ? `Book with ${business.name}` : 'Book an appointment',
    description: business ? `Book an appointment online with ${business.name}.` : undefined,
  };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = findBusinessBySlug(slug);
  if (!business) notFound();

  const services = listServices(business.id, true);
  const staff = listStaff(business.id, true);
  const hours = hoursFor(business);

  const days: { iso: string; label: string }[] = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    days.push({
      iso: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <p className="muted text-xs uppercase tracking-wide">{businessTypeLabel(business.type)}</p>
        <h1 className="text-2xl font-semibold">{business.name}</h1>
        <p className="muted text-sm">
          {[business.address, business.city, business.country].filter(Boolean).join(', ')}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {business.phone ? <span>{business.phone}</span> : null}
          <Link href={`/support/${business.slug}`} className="font-semibold text-brand-600 hover:underline">
            Ask the AI assistant →
          </Link>
        </div>
      </header>

      {services.length === 0 ? (
        <div className="card">
          <p className="text-sm font-semibold">Online booking is not open yet</p>
          <p className="muted mt-1 text-sm">
            This business has not published its services yet. Please contact them directly.
          </p>
        </div>
      ) : (
        <BookingForm
          slug={business.slug}
          services={services.map((service) => ({
            id: service.id,
            name: service.name,
            priceCents: service.price_cents,
            durationMinutes: service.duration_minutes,
          }))}
          staff={staff.map((member) => ({ id: member.id, name: member.name }))}
          currency={business.currency}
          days={days}
        />
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="text-sm font-semibold">Opening hours</h2>
          <ul className="muted mt-2 space-y-1 text-sm">
            {hours.map((entry) => (
              <li key={entry.day} className="flex items-center justify-between gap-2 capitalize">
                <span>{entry.day}</span>
                <span>{entry.closed ? 'Closed' : `${formatTime(entry.open)} – ${formatTime(entry.close)}`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold">Services</h2>
          <ul className="muted mt-2 space-y-1 text-sm">
            {services.slice(0, 8).map((service) => (
              <li key={service.id} className="flex items-center justify-between gap-2">
                <span>{service.name}</span>
                <span>{service.duration_minutes} min</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="muted mt-8 text-center text-xs">
        Booking powered by Workspace Digital. Availability is calculated from real business hours and confirmed
        bookings.
      </p>
      <WhatsAppWidget />
    </main>
  );
}

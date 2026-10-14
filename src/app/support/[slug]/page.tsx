import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { findBusinessBySlug, hoursFor, listStaff } from '@/lib/db/repositories/accounts';
import { listServices } from '@/lib/db/repositories/catalog';
import { getSupportSettings } from '@/lib/db/repositories/comms';
import { businessTypeLabel } from '@/lib/domain';
import { ManagerCard } from '@/components/manager-card';
import { SupportChat } from '@/components/public/support-chat';
import { WhatsAppWidget } from '@/components/public/whatsapp-widget';
import { formatTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const business = findBusinessBySlug(slug);
  return {
    title: business ? `Support — ${business.name}` : 'Support',
    description: business ? `Ask ${business.name} a question and get an instant answer from their AI assistant.` : undefined,
  };
}

export default async function SupportWidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = findBusinessBySlug(slug);
  if (!business) notFound();

  const settings = getSupportSettings(business.id);
  const hours = hoursFor(business);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="muted text-xs uppercase tracking-wide">{businessTypeLabel(business.type)}</p>
          <h1 className="text-xl font-semibold">{business.name}</h1>
          <p className="muted text-sm">
            {[business.address, business.city, business.country].filter(Boolean).join(', ') || 'Support chat'}
          </p>
        </div>
        <Link href={`/book/${business.slug}`} className="text-sm font-semibold text-brand-600 hover:underline">
          Book an appointment →
        </Link>
      </header>

      <SupportChat
        slug={business.slug}
        businessName={business.name}
        greeting={settings.greeting ?? 'Hi! How can I help you today?'}
        enabled={Boolean(settings.widget_enabled)}
        escalationMessage={
          settings.escalation_message ??
          'I want to make sure you get the right answer — let me pass this to a member of our team.'
        }
      />

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
          <h2 className="text-sm font-semibold">Contact</h2>
          <ul className="muted mt-2 space-y-1 text-sm">
            {business.phone ? <li>Phone: {business.phone}</li> : null}
            {business.email ? <li>Email: {business.email}</li> : null}
            {business.website ? <li>Website: {business.website}</li> : null}
            <li>Services: {listServices(business.id, true).length}</li>
            <li>Team: {listStaff(business.id, true).length}</li>
          </ul>
        </div>
      </section>

      <section className="mt-6">
        <ManagerCard />
      </section>

      <p className="muted mt-8 text-center text-xs">
        Powered by Workspace Digital — the AI assistant answers only from this business’s verified information and
        hands over to a human when it is not sure.
      </p>
      <WhatsAppWidget />
    </main>
  );
}

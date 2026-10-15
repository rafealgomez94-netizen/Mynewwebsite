import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OnboardingWizard } from '@/components/onboarding/wizard';
import { getSessionContext } from '@/lib/auth/session';
import { commsFor, findBusinessById, findBusinessesByUser, hoursFor } from '@/lib/db/repositories/accounts';
import { MarketingNav } from '@/components/marketing/site-chrome';
import { Button } from '@/components/ui';

export const metadata: Metadata = { title: 'Set up your business' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login?next=/onboarding');

  const businesses = findBusinessesByUser(session.user.id);
  const existing = businesses[0] ? findBusinessById(businesses[0].id) : undefined;

  // Platform administrators onboard businesses from the admin panel, not here.
  if (!businesses.length && session.user.platformRole === 'PLATFORM_ADMIN') redirect('/admin');

  if (existing?.onboarding_completed_at) {
    return (
      <div className="min-h-screen">
        <MarketingNav signedIn />
        <main id="main" className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-2xl font-semibold">Your business workspace is already set up</h1>
          <p className="muted mx-auto mt-3 max-w-xl text-sm">
            {existing.name} is ready. You can add services, staff and documents any time from the dashboard settings.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard">
              <Button>Open dashboard</Button>
            </Link>
            <Link href="/dashboard/settings">
              <Button variant="secondary">Business settings</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <MarketingNav signedIn />
      <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Guided onboarding</p>
          <h1 className="mt-2 text-3xl font-semibold">Let’s set up {existing?.name ?? 'your business'}</h1>
          <p className="muted mx-auto mt-3 max-w-2xl text-sm">
            Nine short steps. Everything you enter powers your dashboard, your booking system and your AI assistant —
            and nothing is shared with other businesses on the platform.
          </p>
        </div>
        <OnboardingWizard
            initial={
            existing
              ? {
                  name: existing.name,
                  type: existing.type,
                  description: existing.description,
                  address: existing.address,
                  city: existing.city,
                  country: existing.country,
                  phone: existing.phone,
                  email: existing.email,
                  website: existing.website,
                  timezone: existing.timezone,
                  currency: existing.currency,
                  hours: hoursFor(existing),
                  comms: commsFor(existing),
                }
              : undefined
          }
        />
      </main>
    </div>
  );
}

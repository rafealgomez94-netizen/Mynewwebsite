import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/shell';
import { getSessionContext } from '@/lib/auth/session';
import { findBusinessesByUser } from '@/lib/db/repositories/accounts';
import { unreadNotificationCount } from '@/lib/db/repositories/ops';
import { openConversationCount, countTickets } from '@/lib/db/repositories/comms';
import { lowStockProducts } from '@/lib/db/repositories/catalog';
import { overdueTaskCount } from '@/lib/db/repositories/ops';
import { aiAllowanceUsed, planForBusiness } from '@/lib/db/repositories/platform';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session) redirect('/login?next=/dashboard');

  const businesses = findBusinessesByUser(session.user.id);
  if (!businesses.length) {
    // A platform administrator has no tenant of their own — send them to the admin panel.
    if (session.user.platformRole === 'PLATFORM_ADMIN') redirect('/admin');
    redirect('/onboarding');
  }

  const businessId = session.businessId ?? businesses[0].id;
  const { plan } = planForBusiness(businessId);

  const badges = {
    notifications: unreadNotificationCount(businessId, session.user.id),
    conversations: openConversationCount(businessId),
    tickets: countTickets(businessId, 'OPEN'),
    lowStock: lowStockProducts(businessId, 100).length,
    overdueTasks: overdueTaskCount(businessId),
    aiUsed: aiAllowanceUsed(businessId),
    aiLimit: plan.limits.aiMessages,
  };

  return (
    <DashboardShell
      user={{
        name: session.user.name,
        email: session.user.email,
        platformRole: session.user.platformRole,
        emailVerified: Boolean(session.user.emailVerifiedAt),
      }}
      business={
        businesses.find((business) => business.id === businessId)
          ? {
              id: businessId,
              name: businesses.find((business) => business.id === businessId)!.name,
              type: businesses.find((business) => business.id === businessId)!.type,
              slug: businesses.find((business) => business.id === businessId)!.slug,
            }
          : { id: businessId, name: 'Workspace', type: 'business', slug: 'workspace' }
      }
      businesses={businesses.map((business) => ({ id: business.id, name: business.name }))}
      badges={badges}
    >
      {children}
    </DashboardShell>
  );
}

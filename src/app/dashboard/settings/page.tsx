import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { commsFor, findBusinessesByUser, hoursFor } from '@/lib/db/repositories/accounts';
import { getSupportSettings } from '@/lib/db/repositories/comms';
import { SettingsWorkspace } from '@/components/dashboard/settings-workspace';
import { PageHeader } from '@/components/dashboard/shared';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = requireTenant(await getSessionContext());
  const business = ctx.business;
  const comms = commsFor(business);
  const support = getSupportSettings(business.id);
  const canManage = ctx.role === 'OWNER' || ctx.role === 'ADMIN' || ctx.role === 'MANAGER';
  const businesses = findBusinessesByUser(ctx.userId);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your profile, business details, opening hours, communication preferences, AI support configuration and account security."
      />
      <SettingsWorkspace
        user={{
          name: ctx.session.user.name,
          email: ctx.session.user.email,
          phone: ctx.session.user.phone,
          jobTitle: ctx.session.user.jobTitle,
          timezone: ctx.session.user.timezone,
          avatarUrl: ctx.session.user.avatarUrl,
        }}
        business={{
          id: business.id,
          name: business.name,
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
          slug: business.slug,
        }}
        businesses={businesses
          .filter((entry) => entry.id !== business.id)
          .map((entry) => ({ id: entry.id, name: entry.name, slug: entry.slug }))}
        hours={hoursFor(business).map((entry) => ({
          day: entry.day,
          open: entry.open,
          close: entry.close,
          closed: entry.closed,
        }))}
        comms={{
          WHATSAPP: Boolean(comms.whatsapp || comms.preferredChannel === 'WHATSAPP'),
          EMAIL: Boolean(comms.escalateTo) || true,
          SMS: false,
          PHONE: true,
          WEB_CHAT: true,
          INSTAGRAM: false,
          autoReply: comms.autoReply,
          sendAppointmentReminders: comms.sendAppointmentReminders,
        }}
        support={{
          greeting: support.greeting,
          tone: support.tone,
          escalation_message: support.escalation_message,
          handoff_email: support.handoff_email,
          auto_reply_enabled: support.auto_reply_enabled,
          widget_enabled: support.widget_enabled,
        }}
        canManage={canManage}
      />
    </div>
  );
}

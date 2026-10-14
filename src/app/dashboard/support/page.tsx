import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { getSupportSettings, listConversations, listTickets } from '@/lib/db/repositories/comms';
import { knowledgeStats } from '@/lib/db/repositories/knowledge';
import { supportProviderName } from '@/lib/ai/support';
import { SupportWorkspace } from '@/components/dashboard/support-workspace';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Support inbox' };
export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const ctx = requireTenant(await getSessionContext());
  const settings = getSupportSettings(ctx.business.id);
  const conversations = listConversations(ctx.business.id, { limit: 60 });
  const tickets = listTickets(ctx.business.id, { limit: 60 });

  return (
    <div>
      <PageHeader
        title="AI customer support"
        description="One inbox for web chat, WhatsApp, SMS, email and phone. The assistant answers from your knowledge base, and escalates with captured contact details when unsure."
        meta={
          <>
            <Badge tone="brand">{supportProviderName()}</Badge>
            <Badge tone="info">{conversations.length} conversations</Badge>
            <Badge tone={tickets.some((ticket) => ticket.status === 'OPEN') ? 'danger' : 'success'}>
              {tickets.filter((ticket) => ticket.status === 'OPEN').length} open escalations
            </Badge>
          </>
        }
      />
      <SupportWorkspace
        initialConversations={conversations.map((conversation) => ({
          id: conversation.id,
          channel: conversation.channel,
          status: conversation.status,
          contact_name: conversation.contact_name,
          customer_name: conversation.customer_name,
          contact_email: conversation.contact_email,
          contact_phone: conversation.contact_phone,
          preview: conversation.preview,
          last_message_at: conversation.last_message_at,
          needs_human: conversation.needs_human,
          unread_for_business: conversation.unread_for_business,
          message_count: conversation.message_count,
        }))}
        initialTickets={tickets.map((ticket) => ({
          id: ticket.id,
          subject: ticket.subject,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          escalated_from_ai: ticket.escalated_from_ai,
          escalation_reason: ticket.escalation_reason,
          contact_name: ticket.contact_name,
          contact_email: ticket.contact_email,
          contact_phone: ticket.contact_phone,
          created_at: ticket.created_at,
        }))}
        settings={{
          greeting: settings.greeting,
          tone: settings.tone,
          escalation_message: settings.escalation_message,
          handoff_email: settings.handoff_email,
          auto_reply_enabled: settings.auto_reply_enabled,
          widget_enabled: settings.widget_enabled,
        }}
        widgetUrl={`/support/${ctx.business.slug}`}
        knowledgeStats={knowledgeStats(ctx.business.id)}
        provider={supportProviderName()}
      />
    </div>
  );
}

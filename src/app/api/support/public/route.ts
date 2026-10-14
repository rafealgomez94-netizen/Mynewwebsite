import { z } from 'zod';
import { assertRateLimit, fail, handleError, ok } from '@/lib/api/http';
import { publicSupportSchema } from '@/lib/validation';
import {
  addMessage,
  createConversation,
  createTicket,
  findConversation,
  listMessages,
  updateConversation,
  getSupportSettings,
} from '@/lib/db/repositories/comms';
import { findBusinessBySlug, findBusinessById } from '@/lib/db/repositories/accounts';
import { createCustomer, findCustomersByIds } from '@/lib/db/repositories/crm';
import { answerCustomerQuestion, supportWidgetIntro } from '@/lib/ai/support';
import { incrementUsage } from '@/lib/db/repositories/platform';
import { notify } from '@/lib/services/notify';
import { sendEscalationEmail } from '@/lib/mailer';
import { all } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public AI support endpoint used by the customer-facing widget.
 * Tenant is resolved from the business slug; nothing else from the tenant is
 * exposed. Every message is metered against the plan's support allowance.
 */
export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'public-support', 30, 60 * 1000);
    const input = await publicSupportSchema.parse(await request.json());

    const business = findBusinessBySlug(input.businessSlug);
    if (!business) return fail(404, 'This support widget is not available.', 'not_found');
    const settings = getSupportSettings(business.id);
    if (!settings.widget_enabled) {
      return fail(403, 'Support chat is currently disabled for this business.', 'widget_disabled');
    }

    let conversationId = input.conversationId || '';
    if (conversationId) {
      const existing = findConversation(business.id, conversationId);
      if (!existing) conversationId = '';
    }
    if (!conversationId) {
      conversationId = createConversation(business.id, {
        channel: 'WEB_CHAT',
        contactName: input.name || null,
        contactEmail: input.email || null,
        contactPhone: input.phone || null,
        subject: input.message.slice(0, 80),
        isAiHandled: true,
      });
    }

    addMessage(business.id, { conversationId, sender: 'CUSTOMER', body: input.message });
    incrementUsage(business.id, 'SUPPORT_MESSAGES', 1, { channel: 'WEB_CHAT' });

    const conversation = findConversation(business.id, conversationId);
    const history = listMessages(business.id, conversationId, 12).map((message) => ({
      sender: message.sender,
      body: message.body,
    }));

    const reply = await answerCustomerQuestion({
      businessId: business.id,
      question: input.message,
      history,
      contact: {
        name: input.name || conversation?.contact_name,
        email: input.email || conversation?.contact_email,
        phone: input.phone || conversation?.contact_phone,
      },
    });

    let finalReply = reply.reply;

    if (reply.escalated) {
      const contactName = input.name || conversation?.contact_name || 'Website visitor';
      const contactEmail = input.email || conversation?.contact_email || null;
      const contactPhone = input.phone || conversation?.contact_phone || null;
      const contactDetail = [contactEmail, contactPhone].filter(Boolean).join(' · ') || 'no contact detail provided yet';

      // 1. human handoff requested  2. contact captured  3. ticket raised  4. owner notified
      updateConversation(business.id, conversationId, {
        needsHuman: true,
        status: 'ESCALATED',
        isAiHandled: false,
        contactName,
        contactEmail,
        contactPhone,
      });

      const ticketId = createTicket(business.id, {
        subject: input.message.slice(0, 120),
        description: reply.escalateReason ?? 'AI could not answer the customer question.',
        priority: 'HIGH',
        escalatedFromAi: true,
        escalationReason: reply.escalateReason,
        contactName,
        contactEmail,
        contactPhone,
        conversationId,
      });

      let customerId: string | null = null;
      if (contactEmail || contactPhone) {
        const existing = all<{ id: string }>(
          `SELECT id FROM customers WHERE business_id = ? AND (lower(coalesce(email,'')) = lower(?) OR coalesce(phone,'') = ?) LIMIT 1`,
          [business.id, contactEmail ?? '', contactPhone ?? ''],
        )[0];
        customerId = existing?.id
          ? existing.id
          : createCustomer(business.id, {
              name: contactName,
              email: contactEmail,
              phone: contactPhone,
              status: 'LEAD',
              source: 'AI support',
              tags: ['support'],
              notes: `Escalated from AI support: ${input.message.slice(0, 200)}`,
            }).id;
        void findCustomersByIds;
      }
      if (customerId) updateConversation(business.id, conversationId, { customerId });

      await notify({
        businessId: business.id,
        type: 'SUPPORT_ESCALATION',
        title: `${contactName} needs human assistance`,
        body: `${input.message.slice(0, 140)} — ticket ${ticketId.slice(-6)}`,
        level: 'CRITICAL',
        href: '/dashboard/support',
        entityType: 'ticket',
        entityId: ticketId,
      });

      const handoffEmail = settings.handoff_email || business.email;
      if (handoffEmail) {
        await sendEscalationEmail({
          to: handoffEmail,
          businessName: business.name,
          subject: input.message.slice(0, 90),
          customerName: contactName,
          customerContact: contactDetail,
          question: input.message,
          ticketId,
        }).catch((error) => console.warn('[support] escalation email failed', error));
      }

      if (reply.needsContactDetails) {
        finalReply = `${finalReply}\n\nCould you share your name and a phone number or email so our team can reach you?`;
      } else {
        finalReply = `${finalReply}\n\nI've passed this to our team and created a request for you — they will follow up using the contact details you provided.`;
      }
    }

    addMessage(business.id, {
      conversationId,
      sender: 'AI',
      body: finalReply,
      grounded: !reply.escalated,
      meta: { confidence: reply.confidence, provider: reply.provider, escalated: reply.escalated },
    });

    const businessRecord = findBusinessById(business.id);
    const businessName = businessRecord?.name ?? 'Our team';

    return ok({
      conversationId,
      reply: finalReply,
      escalated: reply.escalated,
      needsContactDetails: reply.needsContactDetails,
      grounded: !reply.escalated,
      sources: reply.sources.map((source) => ({ title: source.title, kind: source.kind })),
      provider: reply.provider,
      businessName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return handleError(error);
    return handleError(error);
  }
}

/** Widget bootstrap: intro message + business display name. */
export async function GET(request: Request) {
  try {
    assertRateLimit(request, 'public-support-info', 60, 60 * 1000);
    const slug = new URL(request.url).searchParams.get('slug') ?? '';
    const business = findBusinessBySlug(slug);
    if (!business) return fail(404, 'Business not found.', 'not_found');
    const settings = getSupportSettings(business.id);
    return ok({
      business: { name: business.name, slug: business.slug, type: business.type },
      enabled: Boolean(settings.widget_enabled),
      greeting: supportWidgetIntro(business.id),
    });
  } catch (error) {
    return handleError(error);
  }
}

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
import { createCustomer,} from '@/lib/db/repositories/crm';
import { answerCustomerQuestion, handoverReply, supportWidgetIntro } from '@/lib/ai/support';
import { aiAllowanceUsed, incrementUsage, planForBusiness } from '@/lib/db/repositories/platform';
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
    const alreadyWithHuman = Boolean(conversation?.needs_human);

    /**
     * The plan's `aiMessages` allowance covers every AI answer the workspace gets, not only the
     * staff assistant: the public support widget used to call the model without checking, so the
     * busiest AI surface was unmetered. Both meters count towards it.
     */
    const { plan } = planForBusiness(business.id);
    const aiUsed = aiAllowanceUsed(business.id);
    const allowanceSpent = aiUsed > plan.limits.aiMessages;

    const history = listMessages(business.id, conversationId, 12).map((message) => ({
      sender: message.sender,
      body: message.body,
    }));

    let reply: Awaited<ReturnType<typeof answerCustomerQuestion>>;
    if (alreadyWithHuman) {
      // A human is already on this conversation: do not guess an answer over the top of them and
      // do not raise a second ticket for the same request.
      reply = handoverReply({
        message: settings.escalation_message,
        reason: 'Conversation already escalated to a human.',
        suffix: 'Someone from the team is already handling this request, so I have added your message to it.',
      });
    } else if (allowanceSpent) {
      reply = handoverReply({
        message: settings.escalation_message,
        reason: `AI allowance for this month is used up (${aiUsed} of ${plan.limits.aiMessages}).`,
        needsContactDetails: !(input.email || input.phone || conversation?.contact_email || conversation?.contact_phone),
        suffix: 'We are answering with the team instead of the assistant right now.',
      });
      if (aiUsed === plan.limits.aiMessages + 1) {
        await notify({
          businessId: business.id,
          type: 'BUSINESS_ALERT',
          title: 'AI allowance used up — support chat is handing over to humans',
          body: `All ${plan.limits.aiMessages} AI messages in the ${plan.name} plan are used for this month, so the support widget now answers with your escalation message and opens a ticket instead of using the assistant. Upgrade to keep AI answers on.`,
          level: 'CRITICAL',
          href: '/dashboard/billing',
        });
      }
    } else {
      reply = await answerCustomerQuestion({
        businessId: business.id,
        question: input.message,
        history,
        contact: {
          name: input.name || conversation?.contact_name,
          email: input.email || conversation?.contact_email,
          phone: input.phone || conversation?.contact_phone,
        },
      });
    }

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

      // Raise the request once. A customer who writes three times about the same problem needs one
      // ticket and one alert, not three — the team would otherwise chase the same request in
      // parallel. The message itself is always stored on the conversation.
      const ticketId = alreadyWithHuman
        ? all<{ id: string }>(
            `SELECT id FROM support_tickets WHERE business_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
            [business.id, conversationId],
          )[0]?.id ?? null
        : createTicket(business.id, {
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
      }
      if (customerId) updateConversation(business.id, conversationId, { customerId });

      if (!alreadyWithHuman) {
        await notify({
          businessId: business.id,
          type: 'SUPPORT_ESCALATION',
          title: `${contactName} needs human assistance`,
          body: `${input.message.slice(0, 140)}${ticketId ? ` — ticket ${ticketId.slice(-6)}` : ''}`,
          level: 'CRITICAL',
          href: '/dashboard/support',
          entityType: 'ticket',
          entityId: ticketId ?? undefined,
        });
      }

      const handoffEmail = settings.handoff_email || business.email;
      if (!alreadyWithHuman && handoffEmail) {
        await sendEscalationEmail({
          to: handoffEmail,
          businessName: business.name,
          subject: input.message.slice(0, 90),
          customerName: contactName,
          customerContact: contactDetail,
          question: input.message,
          ticketId: ticketId ?? '',
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

/**
 * AI business assistant.
 *
 * Pipeline:  question → intent routing → verified fact subset + knowledge
 * retrieval → narrative (LLM when configured, deterministic composer otherwise)
 * → response tagged with grounding labels so facts, documents and
 * recommendations are never blended together.
 */
import { callLlm, aiConfigured, aiModel, AI_SYSTEM_GUARDRAIL, type ChatMessage } from '@/lib/ai/provider';
import { buildFactPack, renderFactPack, type BusinessFactPack } from '@/lib/ai/facts';
import { calculatedStats, recommendations, type Insight } from '@/lib/ai/analytics';
import {
  answerCoverage,
  composeGroundedAnswer,
  retrieveChunks,
  storeAiRun,
  buildKnowledgeSnapshot,
  listFaqs,
} from '@/lib/db/repositories/knowledge';
import { findBusinessById, hoursFor } from '@/lib/db/repositories/accounts';
import { GROUNDING_LABELS, type GroundingKind } from '@/lib/domain';
import { formatMoney, formatNumber } from '@/lib/utils';

export type AssistantIntent =
  | 'CUSTOMER_COUNT'
  | 'POPULAR_SERVICES'
  | 'LOW_STOCK'
  | 'PROMOTION_IDEA'
  | 'FOLLOW_UPS'
  | 'BEST_SELLERS'
  | 'CUSTOMER_ISSUES'
  | 'WEEKLY_REPORT'
  | 'MARKETING_CAMPAIGN'
  | 'FOLLOW_UP_MESSAGE'
  | 'REVENUE'
  | 'APPOINTMENTS'
  | 'TASKS'
  | 'BUSINESS_PROFILE'
  | 'GENERAL';

const INTENT_RULES: { intent: AssistantIntent; patterns: RegExp }[] = [
  // Asking the assistant to *write* something comes first: "write a follow-up message
  // for the customers who have not booked" is a request to draft, not to list, and the
  // first matching rule wins. The data questions below stay strictly read-only.
  { intent: 'FOLLOW_UP_MESSAGE', patterns: /\b(follow[- ]?up (message|note|reminder)|message to (a )?customer|reminder message|(write|draft|compose|prepare) (a |an )?(whatsapp|sms|email|e-mail|text|dm|message|note|reply|reminder)( (message|note|reply|update))? (to|for)\b)/i },
  { intent: 'WEEKLY_REPORT', patterns: /\b((write|draft|generate|create|prepare) (a )?(weekly|week|monthly|daily|business) report|(weekly|week|monthly|daily|business) report|summary of (the )?(week|month)|report for (the )?(week|month))\b/i },
  { intent: 'MARKETING_CAMPAIGN', patterns: /\b((create|write|draft|generate|plan) (a )?(marketing )?campaign|marketing campaign|campaign plan|advert|campaign idea)\b/i },
  { intent: 'CUSTOMER_COUNT', patterns: /\b(how many (new )?customers|new customers|customer (growth|count)|this week'?s customers)\b/i },
  { intent: 'POPULAR_SERVICES', patterns: /\b(most popular service\w*|popular service\w*|top service\w*|best service\w*|which service\w*|most booked)\b/i },
  { intent: 'LOW_STOCK', patterns: /\b(low (in )?stock|running low|replenish\w*|re-?order\w*|out of stock|stock level\w*|needs? restocking)\b/i },
  { intent: 'PROMOTION_IDEA', patterns: /\b(what should (we|i) promote|promote this week|promotion\w*|what should we market|deal idea\w*|marketing idea\w*)\b/i },
  { intent: 'FOLLOW_UPS', patterns: /\b(follow[- ]?up(?! (message|note|reminder))|who should (we|i) contact|reach out|customers need attention)\b/i },
  { intent: 'BEST_SELLERS', patterns: /\b(best[- ]?sell\w*|top[- ]?sell\w*|most sold|top products?|best products?|best[- ]?performing products?)\b/i },
  { intent: 'CUSTOMER_ISSUES', patterns: /\b(problems (are|do) customers|complain\w*|customer issues?|what are customers reporting|common questions?|what are customers asking)\b/i },
  { intent: 'REVENUE', patterns: /\b(revenue|sales (this|last)|how much did we (make|earn)|income|turnover)\b/i },
  { intent: 'APPOINTMENTS', patterns: /\b(appointment|booking|schedule|calendar)\b/i },
  { intent: 'TASKS', patterns: /\b(task|to[- ]?do|overdue work|what should (we|i) do today)\b/i },
  { intent: 'BUSINESS_PROFILE', patterns: /\b(opening hours|open today|price list|our prices|where are we|address|contact details|policies)\b/i },
];

export function detectIntent(question: string): AssistantIntent {
  for (const rule of INTENT_RULES) {
    if (rule.patterns.test(question)) return rule.intent;
  }
  return 'GENERAL';
}

/**
 * A retrieved chunk only answers a question when it is clearly the best match;
 * the threshold mirrors the customer-support assistant so both surfaces escalate
 * rather than guess.
 */
export const DOCUMENT_ANSWER_THRESHOLD = 0.9;

function documentAnswer(
  chunks: {
    sourceTitle: string;
    heading: string | null;
    content: string;
    score: number;
    matchedTokens?: string[];
  }[],
  question: string,
  tag: (kind: keyof typeof GROUNDING_LABELS, text: string) => string,
): string | null {
  const best = chunks[0];
  if (!best || best.score < DOCUMENT_ANSWER_THRESHOLD) return null;
  // A strong score on one shared word is not an answer: the evidence has to cover
  // the question. Below that, the assistant says it does not know.
  const evidence = answerCoverage(chunks.slice(0, 3) as { matchedTokens: string[] }[], question);
  if (evidence.coverage < 0.5 || !evidence.answerable) return null;
  const quotes = composeGroundedAnswer(chunks.slice(0, 2), question, {
    maxChunks: 2,
    maxSentences: 2,
    withSourceLabels: true,
  });
  if (!quotes) return null;
  return tag('BUSINESS_DOCUMENT', quotes);

}

export type AssistantSource = {
  title: string;
  snippet: string;
  kind: string;
  score: number;
  /** Share of the question's words this excerpt contains — shown in the UI. */
  coverage: number;
};

export type AssistantAnswer = {
  intent: AssistantIntent;
  answer: string;
  sections: { kind: GroundingKind; label: string; items: string[] }[];
  recommendations: Insight[];
  sources: AssistantSource[];
  provider: 'openai-compatible' | 'builtin-analytics';
  model: string | null;
  grounded: boolean;
  latencyMs: number;
  tokens: { in: number; out: number };
  suggestions: string[];
};


function deterministicAnswer(
  intent: AssistantIntent,
  facts: BusinessFactPack,
  businessName: string,
  question: string,
  documents: { sourceTitle: string; heading: string | null; content: string; score: number }[] = [],
): { answer: string; suggestions: string[] } {
  const L: string[] = [];
  const tag = (kind: keyof typeof GROUNDING_LABELS, text: string) => `[${GROUNDING_LABELS[kind]}] ${text}`;
  const fromDocuments = documentAnswer(documents, question, tag);

  switch (intent) {
    case 'CUSTOMER_COUNT':
      L.push(
        tag('VERIFIED_DATA', `You have ${formatNumber(facts.customers.total)} customers on file, with ${formatNumber(
          facts.customers.newThisWeek,
        )} added in the last 7 days and ${formatNumber(facts.customers.newThisMonth)} in the last 30 days.`),
      );
      if (facts.customers.byStatus.length) {
        L.push(
          tag(
            'VERIFIED_DATA',
            `Status mix: ${facts.customers.byStatus.map((row) => `${row.status} ${row.c}`).join(', ')}.`,
          ),
        );
      }
      L.push(
        tag(
          'AI_RECOMMENDATION',
          facts.customers.followUp.length
            ? `Reach out to the ${facts.customers.followUp.length} customers who have not interacted in 30+ days — start with ${facts.customers.followUp[0].name}.`
            : 'Growth looks steady; keep capture details (name + phone) at every touchpoint to keep the list compounding.',
        ),
      );
      break;
    case 'POPULAR_SERVICES':
      L.push(
        facts.sales.popularServices.length
          ? tag(
              'VERIFIED_DATA',
              `Most booked services: ${facts.sales.popularServices
                .map((service) => `${service.name} (${service.bookings} bookings, ${formatMoney(service.priceCents, facts.currency)})`)
                .join(', ')}.`,
            )
          : `[${GROUNDING_LABELS.INSUFFICIENT}] No service bookings have been recorded yet, so I cannot rank your services. Record bookings (or connect your calendar) and ask me again.`,
      );
      break;
    case 'LOW_STOCK':
      L.push(
        facts.inventory.lowStock.length
          ? tag(
              'VERIFIED_DATA',
              `${facts.inventory.lowStockCount} product(s) are at or below the minimum level: ${facts.inventory.lowStock
                .map((product) => `${product.name} — ${product.quantity} left (min ${product.minStock})${product.supplier ? `, supplier ${product.supplier}` : ''}`)
                .join('; ')}.`,
            )
          : tag('VERIFIED_DATA', 'No products are currently at or below their minimum stock level.'),
      );
      if (facts.inventory.fastMoving.length) {
        L.push(
          tag(
            'VERIFIED_DATA',
            `Fastest moving stock: ${facts.inventory.fastMoving
              .map((product) => `${product.name} (${product.unitsSold} units sold, ${product.quantity} in stock)`)
              .join(', ')}.`,
          ),
        );
      }
      L.push(
        tag('AI_RECOMMENDATION', 'Reorder low-stock items before your next busy period and consider a minimum-level review for your fastest movers.'),
      );
      break;
    case 'BEST_SELLERS':
      L.push(
        facts.sales.topItems.length
          ? tag(
              'VERIFIED_DATA',
              `Best-selling items in the last 30 days: ${facts.sales.topItems
                .map((item) => `${item.name} (${item.units} units, ${formatMoney(item.revenueCents, facts.currency)})`)
                .join('; ')}.`,
            )
          : `[${GROUNDING_LABELS.INSUFFICIENT}] There are no orders recorded in the last 30 days, so I cannot determine best sellers yet.`,
      );
      break;
    case 'FOLLOW_UPS':
      L.push(
        facts.customers.followUp.length
          ? tag(
              'VERIFIED_DATA',
              `${facts.customers.followUp.length} customer(s) have not interacted in over 30 days: ${facts.customers.followUp
                .map((customer) => `${customer.name} (${customer.status})`)
                .join(', ')}.`,
            )
          : tag('VERIFIED_DATA', 'No customers are currently overdue for follow-up.'),
      );
      if (facts.leads.staleFollowUps.length) {
        L.push(
          tag(
            'VERIFIED_DATA',
            `Leads waiting the longest: ${facts.leads.staleFollowUps.map((lead) => `${lead.name} (${lead.stage})`).join(', ')}.`,
          ),
        );
      }
      break;
    case 'CUSTOMER_ISSUES':
      L.push(
        facts.support.frequentTopics.length
          ? tag(
              'VERIFIED_DATA',
              `Recurring customer questions in the last 90 days: ${facts.support.frequentTopics
                .map((topic) => `“${topic.topic}” ×${topic.count}`)
                .join('; ')}.`,
            )
          : tag('VERIFIED_DATA', 'No customer issues or escalations have been recorded yet.'),
      );
      L.push(
        tag('AI_RECOMMENDATION', 'Add the top recurring question to your FAQ and the AI support assistant will answer it automatically.'),
      );
      break;
    case 'WEEKLY_REPORT':
      L.push(
        tag('VERIFIED_DATA', `Weekly report for ${businessName} (calculated from your stored data):`),
        tag('VERIFIED_DATA', `• Revenue: ${formatMoney(facts.revenue.weekCents, facts.currency)} from ${facts.revenue.weekOrders} orders (${facts.revenue.weekChangePct >= 0 ? '+' : ''}${facts.revenue.weekChangePct.toFixed(1)}% week over week).`),
        tag('VERIFIED_DATA', `• Customers: ${facts.customers.newThisWeek} new, ${facts.customers.total} total.`),
        tag('VERIFIED_DATA', `• Appointments: ${facts.appointments.last7Days} in the past week, ${facts.appointments.next7Days} booked for the next 7 days.`),
        tag('VERIFIED_DATA', `• Leads: ${facts.leads.open} open, win rate ${facts.leads.conversionRatePct.toFixed(1)}%.`),
        tag('VERIFIED_DATA', `• Inventory: ${facts.inventory.lowStockCount} product(s) at or below minimum.`),
        tag('VERIFIED_DATA', `• Customers/issues: ${facts.support.openConversations} open conversations, ${facts.support.openTickets} open tickets.`),
        tag('AI_RECOMMENDATION', 'Focus areas for next week: clear overdue tasks, reorder low stock, and follow up the customers who have gone quiet.'),
      );
      break;
    case 'PROMOTION_IDEA': {
      const best = facts.sales.topItems[0] ?? facts.sales.popularServices[0];
      const slow = facts.inventory.slowMoving[0];
      L.push(
        best
          ? tag(
              'VERIFIED_DATA',
              `Your strongest performer is ${best.name}${'units' in best ? ` (${best.units} units sold recently)` : ''}.`,
            )
          : tag('VERIFIED_DATA', 'No sales history is available yet to base a promotion on.'),
      );
      L.push(
        tag(
          'AI_RECOMMENDATION',
          best
            ? `Run a bundle: ${best.name}${slow ? ` together with ${slow.name}, which has been slower (${slow.unitsSold} sold)` : ''}. Promote it on WhatsApp to returning customers between 4–6pm and publish a social post with the same offer.`
            : 'Start by recording a few sales, then I can suggest what to promote based on what actually sells.',
        ),
      );
      break;
    }
    case 'MARKETING_CAMPAIGN': {
      L.push(
        tag('VERIFIED_DATA', `Audience available: ${formatNumber(facts.customers.total)} customers, ${facts.customers.byStatus.find((row) => row.status === 'VIP')?.c ?? 0} VIP.`),
        tag(
          'AI_RECOMMENDATION',
          'Campaign outline — Goal: repeat visits this month. Audience: returning + VIP customers. Channels: WhatsApp broadcast, Instagram post, SMS to inactive customers. Offer: limited-time bundle on your best seller. Sequence: day 1 announcement, day 3 reminder to non-openers, day 7 last chance.',
        ),
      );
      break;
    }
    case 'FOLLOW_UP_MESSAGE':
      L.push(
        facts.customers.followUp[0]
          ? tag('VERIFIED_DATA', `Suggested recipient: ${facts.customers.followUp[0].name} (${facts.customers.followUp[0].status}).`)
          : tag('VERIFIED_DATA', 'No specific customer is overdue — I drafted a generic follow-up you can personalise.'),
        tag(
          'AI_RECOMMENDATION',
          `Draft: “Hi ${
            facts.customers.followUp[0]?.name.split(' ')[0] ?? 'there'
          }, it's ${businessName}. We haven't seen you in a while and we've kept something aside for you — ${
            facts.sales.topItems[0]?.name ?? 'our most popular service'
          }. Would you like me to book you in this week? Reply YES and I'll sort it out.”`,
        ),
      );
      break;
    case 'REVENUE':
      L.push(
        tag('VERIFIED_DATA', `Last 7 days: ${formatMoney(facts.revenue.weekCents, facts.currency)} from ${facts.revenue.weekOrders} orders (${facts.revenue.weekChangePct >= 0 ? '+' : ''}${facts.revenue.weekChangePct.toFixed(1)}% vs the previous week).`),
        tag('VERIFIED_DATA', `Last 30 days: ${formatMoney(facts.revenue.monthCents, facts.currency)} from ${facts.revenue.monthOrders} orders, average order value ${formatMoney(facts.revenue.monthAverageCents, facts.currency)}.`),
      );
      if (facts.sales.channels.length) {
        L.push(
          tag('VERIFIED_DATA', `Channels (30d): ${facts.sales.channels.map((channel) => `${channel.channel} ${formatMoney(channel.revenueCents, facts.currency)}`).join(', ')}.`),
        );
      }
      L.push(tag('AI_RECOMMENDATION', facts.revenue.weekChangePct < 0 ? 'Revenue softened — a re-engagement campaign to returning customers is the fastest lever.' : 'Revenue is trending up; protect the momentum with a loyalty offer for repeat buyers.'));
      break;
    case 'APPOINTMENTS':
      L.push(
        tag('VERIFIED_DATA', `You had ${facts.appointments.last7Days} appointment(s) in the last 7 days (${facts.appointments.completedLast7Days} completed) and ${facts.appointments.next7Days} booked for the next 7 days.`),
      );
      if (facts.appointments.upcoming.length) {
        L.push(
          tag('VERIFIED_DATA', `Next: ${facts.appointments.upcoming.slice(0, 5).map((appointment) => `${appointment.title} — ${appointment.startAt.slice(0, 16).replace('T', ' ')} UTC`).join('; ')}.`),
        );
      }
      break;
    case 'TASKS':
      L.push(
        tag('VERIFIED_DATA', `Tasks: ${facts.tasks.byStatus.map((row) => `${row.status} ${row.c}`).join(', ') || 'none yet'}. Overdue: ${facts.tasks.overdue}.`),
      );
      L.push(tag('AI_RECOMMENDATION', 'Start with overdue items that involve a customer promise, then schedule the rest for the quietest part of your week.'));
      break;
    case 'BUSINESS_PROFILE':
      if (fromDocuments) {
        L.push(fromDocuments);
        L.push(
          tag('AI_RECOMMENDATION', 'This comes from the document you uploaded. Edit the document or the FAQ if anything has changed, and I will quote the new version.'),
        );
      } else {
        L.push(
          `[${GROUNDING_LABELS.INSUFFICIENT}] I don't have a confident answer for “${question}” from your stored data. This usually means the detail (price, policy or opening hours) has not been added or uploaded yet. Add it in Business settings or upload the document, and I will answer from then on.`,
        );
      }
      break;
    case 'GENERAL':
    default:
      if (fromDocuments) {
        // The question matched uploaded material even though it did not match a
        // built-in intent — answer from the document instead of a generic snapshot.
        L.push(fromDocuments);
        L.push(
          tag('VERIFIED_DATA', `For context: ${formatNumber(facts.customers.total)} customers on file, ${formatMoney(facts.revenue.monthCents, facts.currency)} revenue in the last 30 days, ${facts.inventory.lowStockCount} product(s) low on stock.`),
        );
        L.push(
          tag('AI_RECOMMENDATION', 'Quoted straight from your uploaded document. If the wording has changed, update the document so every answer stays accurate.'),
        );
      } else {
        // Nothing matched. The refusal has to be the headline — a generic snapshot
        // in front of it reads like an answer. The snapshot is offered afterwards,
        // clearly framed as what *can* be answered, never as a reply to the
        // question that was actually asked.
        L.push(
          `[${GROUNDING_LABELS.INSUFFICIENT}] I could not match “${question}” to your stored data or uploaded documents, so I am not guessing. Upload the price list, policy or FAQ that covers it (Knowledge base → Upload), or a member of your team can follow up with the customer directly.`,
        );
        L.push(
          tag(
            'VERIFIED_DATA',
            `What I can confirm about ${businessName} instead: ${formatNumber(facts.customers.total)} customers, ${formatMoney(facts.revenue.monthCents, facts.currency)} revenue in the last 30 days, ${facts.appointments.next7Days} upcoming appointments, ${facts.inventory.lowStockCount} product(s) low on stock.`,
          ),
        );
      }
      break;
  }
  return {
    answer: L.join('\n\n'),
    suggestions: suggestionsFor(intent),
  };
}

function suggestionsFor(intent: AssistantIntent): string[] {
  const common = [
    'How many customers did we get this week?',
    'What are our most popular services?',
    'Which products are low in stock?',
    'What should we promote this week?',
  ];
  switch (intent) {
    case 'LOW_STOCK':
      return ['Which products are selling fastest?', 'Create a purchase follow-up task', 'What were our best-selling products?'];
    case 'WEEKLY_REPORT':
      return ['Create a marketing campaign', 'Which customers need follow-up?', 'What problems are customers reporting?'];
    default:
      return common;
  }
}

export async function askAssistant(input: {
  businessId: string;
  userId?: string | null;
  question: string;
  surface?: 'ASSISTANT' | 'SALES' | 'MARKETING' | 'ANALYTICS' | 'DOCUMENTS';
  history?: ChatMessage[];
}): Promise<AssistantAnswer> {
  const started = Date.now();
  const business = findBusinessById(input.businessId);
  if (!business) throw new Error('Business not found');
  const facts = buildFactPack(input.businessId);
  const intent = detectIntent(input.question);
  const retrieved = retrieveChunks(input.businessId, input.question, 5);
  const knowledgeSnapshot = retrieved.length ? '' : buildKnowledgeSnapshot(input.businessId, 3000);
  const relatedRecommendations = recommendations(facts).slice(0, 4);

  const sections: AssistantAnswer['sections'] = [
    {
      kind: 'VERIFIED_DATA',
      label: GROUNDING_LABELS.VERIFIED_DATA,
      items: calculatedStats(facts)
        .slice(0, 6)
        .map((stat) => `${stat.label}: ${stat.value}${stat.changePct !== undefined ? ` (${stat.changePct >= 0 ? '+' : ''}${stat.changePct.toFixed(1)}%)` : ''}`),
    },
  ];

  if (retrieved.length) {
    sections.push({
      kind: 'BUSINESS_DOCUMENT',
      label: GROUNDING_LABELS.BUSINESS_DOCUMENT,
      items: retrieved.map(
        (chunk) => `${chunk.sourceTitle}${chunk.heading ? ` › ${chunk.heading}` : ''} (match ${chunk.score.toFixed(2)})`,
      ),
    });
  }

  sections.push({
    kind: 'AI_RECOMMENDATION',
    label: GROUNDING_LABELS.AI_RECOMMENDATION,
    items: relatedRecommendations.map((insight) => insight.title),
  });

  let answerText: string;
  let provider: AssistantAnswer['provider'] = 'builtin-analytics';
  let model: string | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  const fallback = deterministicAnswer(intent, facts, business.name, input.question, retrieved);

  if (aiConfigured()) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: AI_SYSTEM_GUARDRAIL },
        {
          role: 'system',
          content: [
            `BUSINESS PROFILE\n${business.name} (${business.type}) — currency ${business.currency}`,
            `DETECTED INTENT: ${intent}`,
            renderFactPack(facts),
            retrieved.length
              ? `UPLOADED BUSINESS DOCUMENTS (retrieved excerpts)\n${retrieved
                  .map((chunk) => `- ${chunk.sourceTitle}${chunk.heading ? ` › ${chunk.heading}` : ''}: ${chunk.content.slice(0, 700)}`)
                  .join('\n')}`
              : knowledgeSnapshot
                ? `UPLOADED BUSINESS DOCUMENTS\n${knowledgeSnapshot.slice(0, 2500)}`
                : 'No uploaded business documents are available.',
            `OPENING HOURS: ${JSON.stringify(hoursFor(business))}`,
            `FAQ COUNT: ${listFaqs(business.id, true).length}`,
          ].join('\n\n'),
        },
        ...(input.history ?? []).slice(-6),
        { role: 'user', content: input.question },
      ];
      const result = await callLlm(messages, { temperature: 0.3 });
      if (result.text) {
        answerText = result.text;
        provider = 'openai-compatible';
        model = result.model;
        tokensIn = result.tokensIn;
        tokensOut = result.tokensOut;
      } else {
        answerText = fallback.answer;
      }
    } catch (error) {
      console.warn('[ai] falling back to built-in analytics:', error instanceof Error ? error.message : error);
      answerText = `${fallback.answer}\n\n[${GROUNDING_LABELS.AI_RECOMMENDATION}] The AI provider was unavailable, so this answer was produced by the built-in analytics engine using your verified data only.`;
    }
  } else {
    answerText = `${fallback.answer}\n\n[${GROUNDING_LABELS.AI_RECOMMENDATION}] Generated by the built-in analytics engine from your verified business data. Add an AI_API_KEY to enable long-form generative answers.`;
  }

  const latencyMs = Date.now() - started;
  storeAiRun({
    businessId: input.businessId,
    userId: input.userId ?? null,
    surface: input.surface ?? 'ASSISTANT',
    prompt: input.question,
    response: answerText.slice(0, 8000),
    provider,
    model,
    sources: retrieved.map((chunk) => ({ title: chunk.sourceTitle, score: chunk.score })),
    grounded: retrieved.some((chunk) => chunk.score >= DOCUMENT_ANSWER_THRESHOLD) || intent !== 'GENERAL',
    tokensIn,
    tokensOut,
    latencyMs,
  });

  return {
    intent,
    answer: answerText,
    sections,
    recommendations: relatedRecommendations,
    sources: retrieved.map((chunk) => ({
      title: chunk.sourceTitle,
      snippet: chunk.content.slice(0, 240),
      kind: chunk.kind,
      score: chunk.score,
      coverage: chunk.coverage,
    })),
    provider,
    model,
    // A GENERAL question that matched no document above the threshold is answered
    // honestly as "not enough information", so it must not claim grounding.
    grounded:
      intent !== 'GENERAL' ||
      (retrieved.length > 0 &&
        retrieved[0].score >= DOCUMENT_ANSWER_THRESHOLD &&
        answerCoverage(retrieved.slice(0, 3), input.question).coverage >= 0.5 &&
        answerCoverage(retrieved.slice(0, 3), input.question).answerable),
    latencyMs,
    tokens: { in: tokensIn, out: tokensOut },
    suggestions: fallback.suggestions,
  };
}

export const ASSISTANT_EXAMPLES = [
  'How many customers did we get this week?',
  'What are our most popular services?',
  'Which products are low in stock?',
  'What should we promote this week?',
  'Which customers need follow-up?',
  'What were our best-selling products?',
  'What problems are customers reporting?',
  'Create a weekly business report.',
  'Create a marketing campaign.',
  'Create a customer follow-up message.',
];

export function assistantProviderName(): string {
  return aiConfigured() ? `AI provider (${aiModel()})` : 'Built-in analytics engine';
}

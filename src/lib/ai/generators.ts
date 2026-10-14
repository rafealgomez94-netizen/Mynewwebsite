/**
 * Generation services: marketing content, customer documents and sales messages.
 *
 * Money values always come from stored data (services, products, order items) or
 * from the figures the user entered — the generative layer is never allowed to
 * invent a price or a quantity.
 */
import { callLlm, aiConfigured, AI_SYSTEM_GUARDRAIL, type ChatMessage } from '@/lib/ai/provider';
import { buildFactPack } from '@/lib/ai/facts';
import { findBusinessById, hoursFor } from '@/lib/db/repositories/accounts';
import { findCustomer } from '@/lib/db/repositories/crm';
import { listProducts, listServices } from '@/lib/db/repositories/catalog';
import { createMarketingPost, createCampaign } from '@/lib/db/repositories/content';
import { retrieveChunks, storeAiRun, buildKnowledgeSnapshot } from '@/lib/db/repositories/knowledge';
import { formatMoney, parseMoneyToCents } from '@/lib/utils';
import { LEAD_STAGE_LABELS, type LeadStage } from '@/lib/domain';

function businessVoice(businessId: string): string {
  const business = findBusinessById(businessId);
  if (!business) return '';
  const services = listServices(businessId, true).slice(0, 12);
  const products = listProducts(businessId, { limit: 12 });
  return [
    `Business: ${business.name} (${business.type})${
      business.city || business.country ? `, ${[business.city, business.country].filter(Boolean).join(', ')}` : ''
    }`,
    business.description ? `Description: ${business.description}` : '',
    business.phone ? `Phone: ${business.phone}` : '',
    business.website ? `Website: ${business.website}` : '',
    `Currency: ${business.currency}`,
    services.length
      ? `Services/prices: ${services.map((service) => `${service.name} ${formatMoney(service.price_cents, business.currency)}`).join('; ')}`
      : '',
    products.length
      ? `Products/prices: ${products.map((product) => `${product.name} ${formatMoney(product.priceCents, business.currency)}`).join('; ')}`
      : '',
    `Opening hours: ${JSON.stringify(hoursFor(business))}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------
export type GeneratedPost = { channel: string; title: string | null; body: string; hashtags: string | null };

const CHANNEL_STYLE: Record<string, { tone: string; length: string; cta: string }> = {
  FACEBOOK: { tone: 'conversational, community-focused', length: '2–4 short paragraphs', cta: 'Message us to book' },
  INSTAGRAM: { tone: 'visual, energetic', length: '1 short paragraph plus hashtags', cta: 'DM us to book' },
  TIKTOK: { tone: 'punchy, trend-aware', length: 'a short script of 3 beats', cta: 'Link in bio' },
  LINKEDIN: { tone: 'professional, outcome-focused', length: '2 paragraphs', cta: 'Send us a message' },
  EMAIL: { tone: 'personal and clear', length: 'subject line + 3 short paragraphs', cta: 'Reply to confirm' },
  SMS: { tone: 'direct, under 160 characters', length: 'one message', cta: 'Reply YES' },
  WHATSAPP: { tone: 'friendly and quick', length: 'one short message', cta: 'Reply to book' },
  GOOGLE: { tone: 'local search focused', length: 'a business post with 2 short lines', cta: 'Call today' },
};

const VARIANT_HOOKS = [
  (hero: string) => hero,
  (hero: string) => `Back by popular demand: ${hero}`,
  (hero: string) => `Only a few slots left for ${hero}`,
  (hero: string) => `Treat yourself to ${hero}`,
];

function fallbackPost(input: {
  businessName: string;
  channel: string;
  goal: string;
  offer?: string;
  audience?: string;
  bestSeller?: { name: string; price?: string };
  city?: string | null;
  variant?: number;
}): GeneratedPost {
  const style = CHANNEL_STYLE[input.channel] ?? CHANNEL_STYLE.FACEBOOK;
  const offer = input.offer?.trim() || 'this week only';
  const audience = input.audience?.trim() || 'our customers';
  const heroName = input.bestSeller?.name ?? 'our most popular service';
  const variant = input.variant ?? 0;
  const hero = VARIANT_HOOKS[variant % VARIANT_HOOKS.length](heroName);
  const price = input.bestSeller?.price ? ` from ${input.bestSeller.price}` : '';
  const place = input.city ? ` in ${input.city}` : '';

  const bodies: Record<string, string> = {
    FACEBOOK: `${input.businessName}${place} — ${input.goal}\n\nThis week we are spotlighting ${hero}${price}, ${offer}. It is loved by ${audience} and spots go fast.\n\n${style.cta} and we will take care of the rest.`,
    INSTAGRAM: `${hero}${price} — ${offer} ✨\n${input.goal}\n${style.cta}!`,
    TIKTOK: `HOOK: "Nobody told me ${hero} was this good."\nBEAT 1: show the before/after.\nBEAT 2: mention ${offer}.\nBEAT 3: "${style.cta}"`,
    LINKEDIN: `${input.goal}\n\nAt ${input.businessName} we focus on results our clients can measure. This week: ${hero}${price}, ${offer}. ${style.cta}.`,
    EMAIL: `Subject: ${hero} — ${offer}\n\nHi {{first_name}},\n\n${input.goal} This week ${hero}${price} is available ${offer}.\n\n${style.cta} and we will confirm your slot.\n\n— ${input.businessName}`,
    SMS: `${input.businessName}: ${hero}${price} — ${offer}. ${style.cta}. Reply STOP to opt out.`,
    WHATSAPP: `Hi {{first_name}}! 👋 ${hero}${price} is available ${offer} at ${input.businessName}. ${style.cta}.`,
    GOOGLE: `${hero}${price} — ${offer}. Call ${input.businessName} to reserve your spot.`,
  };

  const hashtags =
    input.channel === 'INSTAGRAM' || input.channel === 'FACEBOOK'
      ? `#${input.businessName.replace(/\s+/g, '')} #${(input.audience ?? 'localbusiness').replace(/\s+/g, '')} #smallbusiness`
      : null;

  const suffix = variant ? ` (variant ${variant + 1})` : '';
  return { channel: input.channel, title: `${input.channel} — ${input.goal.slice(0, 60)}${suffix}`, body: bodies[input.channel] ?? bodies.FACEBOOK, hashtags };
}

export async function generateMarketingPosts(input: {
  businessId: string;
  userId?: string | null;
  channel: string;
  channels?: string[];
  goal: string;
  audience?: string;
  offer?: string;
  tone?: string;
  campaignName?: string;
  variants: number;
  scheduleStart?: string;
}): Promise<{ campaignId: string; posts: GeneratedPost[]; provider: string }> {
  const started = Date.now();
  const business = findBusinessById(input.businessId);
  if (!business) throw new Error('Business not found');
  const facts = buildFactPack(input.businessId);
  const bestSeller = facts.sales.topItems[0];
  const bestService = facts.sales.popularServices[0];
  const hero = bestSeller?.name ?? bestService?.name;
  // Price the item we actually put in the copy — never mix a product name with a service price.
  const heroPrice = bestSeller
    ? formatMoney(bestSeller.unitPriceCents, business.currency)
    : bestService
      ? formatMoney(bestService.priceCents, business.currency)
      : undefined;
  const channels = [...new Set([input.channel, ...(input.channels ?? [])])].slice(0, 5);

  const campaignId = createCampaign(input.businessId, {
    name: input.campaignName?.trim() || `${input.goal.slice(0, 50)} — ${new Date().toISOString().slice(0, 10)}`,
    objective: input.goal,
    audience: input.audience ?? null,
    channels,
    status: 'GENERATED',
    startDate: input.scheduleStart ? new Date(input.scheduleStart).toISOString() : new Date().toISOString(),
    createdById: input.userId ?? null,
  });

  let provider = 'builtin-templates';
  const generated: GeneratedPost[] = [];

  if (aiConfigured()) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: AI_SYSTEM_GUARDRAIL },
        {
          role: 'system',
          content: `You are a marketing copywriter for a small business. Write ready-to-publish content.
Never invent prices that are not provided. Use the verified prices below when mentioning offers.
Return STRICT JSON: {"posts":[{"channel":"...","title":"...","body":"...","hashtags":"..."}]}`,
        },
        {
          role: 'user',
          content: [
            businessVoice(input.businessId),
            `VERIFIED PERFORMANCE DATA:\n- Best selling item: ${hero ?? 'not recorded yet'}\n- Popular services: ${
              facts.sales.popularServices.map((service) => service.name).join(', ') || 'none recorded'
            }\n- Customers: ${facts.customers.total} total, ${facts.customers.newThisMonth} new in 30 days`,
            `CAMPAIGN GOAL: ${input.goal}`,
            `AUDIENCE: ${input.audience ?? 'existing customers'}`,
            `OFFER: ${input.offer ?? 'no specific offer'}`,
            `TONE: ${input.tone ?? 'friendly and professional'}`,
            `CHANNELS: ${channels.join(', ')}`,
            `VARIANTS: ${input.variants} per channel. Channel styles: ${channels
              .map((channel) => `${channel}: ${CHANNEL_STYLE[channel]?.tone ?? 'clear'} / ${CHANNEL_STYLE[channel]?.length ?? 'short'}`)
              .join(' | ')}`,
          ].join('\n\n'),
        },
      ];
      const result = await callLlm(messages, { temperature: 0.6, json: true });
      const parsed = JSON.parse(result.text) as { posts?: GeneratedPost[] };
      if (parsed.posts?.length) {
        generated.push(
          ...parsed.posts
            .slice(0, channels.length * input.variants)
            .map((post) => ({
              channel: channels.includes(post.channel?.toUpperCase()) ? post.channel.toUpperCase() : channels[0],
              title: post.title ?? null,
              body: post.body,
              hashtags: post.hashtags ?? null,
            }))
            .filter((post) => post.body?.trim()),
        );
        provider = `openai-compatible:${result.model}`;
        storeAiRun({
          businessId: input.businessId,
          userId: input.userId ?? null,
          surface: 'MARKETING',
          prompt: input.goal,
          response: generated.map((post) => post.body).join('\n---\n'),
          provider: 'openai-compatible',
          model: result.model,
          sources: [],
          grounded: true,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          latencyMs: Date.now() - started,
        });
      }
    } catch (error) {
      console.warn('[marketing] falling back to templates:', error instanceof Error ? error.message : error);
    }
  }

  if (!generated.length) {
    for (const channel of channels) {
      const variantCount = Math.max(1, Math.min(input.variants, 3));
      for (let variant = 0; variant < variantCount; variant += 1) {
        generated.push(
          fallbackPost({
            businessName: business.name,
            channel,
            goal: input.goal,
            offer: input.offer,
            audience: input.audience,
            bestSeller: hero ? { name: hero, price: heroPrice } : undefined,
            city: business.city,
            variant,
          }),
        );
      }
    }
  }

  const posts = generated.map((post) => ({
    ...post,
    body: [post.body, post.hashtags].filter(Boolean).join('\n\n'),
  }));

  for (const post of posts) {
    createMarketingPost(input.businessId, {
      campaignId,
      channel: post.channel,
      title: post.title,
      body: post.body,
      hashtags: post.hashtags,
      status: 'DRAFT',
      createdById: input.userId ?? null,
    });
  }

  return { campaignId, posts, provider };
}

export async function generateCampaignPlan(input: {
  businessId: string;
  userId?: string | null;
  objective: string;
  audience?: string;
  durationDays: number;
  channels: string[];
}): Promise<{ campaignId: string; plan: { day: number; channel: string; body: string }[]; provider: string }> {
  const business = findBusinessById(input.businessId);
  if (!business) throw new Error('Business not found');
  const facts = buildFactPack(input.businessId);
  const hero = facts.sales.topItems[0]?.name ?? facts.sales.popularServices[0]?.name ?? 'our most popular service';

  const campaignId = createCampaign(input.businessId, {
    name: `${input.objective.slice(0, 50)} — content calendar`,
    objective: input.objective,
    audience: input.audience ?? null,
    channels: input.channels,
    status: 'GENERATED',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + input.durationDays * 86400000).toISOString(),
    createdById: input.userId ?? null,
  });

  const plan: { day: number; channel: string; body: string }[] = [];
  for (let day = 1; day <= input.durationDays; day += 1) {
    const channel = input.channels[(day - 1) % input.channels.length];
    const body = fallbackPost({
      businessName: business.name,
      channel,
      goal: `${input.objective} (day ${day} of ${input.durationDays})`,
      audience: input.audience,
      offer: day === 1 ? 'launch announcement' : day === input.durationDays ? 'final call' : 'this week only',
      bestSeller: { name: hero },
      city: business.city,
    }).body;
    plan.push({ day, channel, body });
    createMarketingPost(input.businessId, {
      campaignId,
      channel,
      title: `Day ${day} — ${channel}`,
      body,
      status: 'DRAFT',
      createdById: input.userId ?? null,
    });
  }
  return { campaignId, plan, provider: 'builtin-templates' };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export type DocumentLine = { name: string; quantity: number; unitPriceCents: number; totalCents: number };

export type GeneratedDocument = {
  title: string;
  sections: { heading: string; body: string }[];
  lines: DocumentLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  contentText: string;
};

export async function generateDocument(input: {
  businessId: string;
  userId?: string | null;
  type: string;
  title?: string;
  customerId?: string | null;
  instructions?: string;
  items?: { name: string; quantity: number; unitPrice: string | number }[];
  currency: string;
  dueDate?: string | null;
}): Promise<{ document: GeneratedDocument; provider: string }> {
  const business = findBusinessById(input.businessId);
  if (!business) throw new Error('Business not found');
  const customer = input.customerId ? findCustomer(input.businessId, input.customerId) : undefined;
  const lines: DocumentLine[] = (input.items ?? []).map((item) => {
    const unitPriceCents = parseMoneyToCents(item.unitPrice);
    return {
      name: item.name,
      quantity: item.quantity,
      unitPriceCents,
      totalCents: Math.round(item.quantity * unitPriceCents),
    };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const taxCents = 0;
  const totalCents = subtotalCents + taxCents;

  const typeLabels: Record<string, string> = {
    INVOICE: 'Invoice',
    QUOTE: 'Quotation',
    RECEIPT: 'Receipt',
    PROPOSAL: 'Business proposal',
    REPORT: 'Report',
    MESSAGE: 'Customer message',
    MARKETING_PLAN: 'Marketing plan',
    SOP: 'Standard operating procedure',
  };
  const title = input.title?.trim() || `${typeLabels[input.type] ?? 'Document'}${customer ? ` for ${customer.name}` : ''}`;

  const facts = buildFactPack(input.businessId);
  const fallbackSections = buildDocumentSections({
    type: input.type,
    businessName: business.name,
    customerName: customer?.name ?? null,
    instructions: input.instructions ?? '',
    lines,
    factsSummary: {
      customers: facts.customers.total,
      revenue30: formatMoney(facts.revenue.monthCents, business.currency),
      topItems: facts.sales.topItems.map((item) => item.name),
      lowStock: facts.inventory.lowStock.map((product) => product.name),
      upcoming: facts.appointments.next7Days,
    },
    currency: input.currency,
    dueDate: input.dueDate ?? null,
  });

  let sections = fallbackSections;
  let provider = 'builtin-generator';

  if (aiConfigured()) {
    try {
      const retrieved = retrieveChunks(input.businessId, `${input.type} ${input.instructions ?? ''} ${title}`, 3);
      const messages: ChatMessage[] = [
        { role: 'system', content: AI_SYSTEM_GUARDRAIL },
        {
          role: 'system',
          content: `You draft business documents. Use ONLY the supplied business facts and line items; never invent figures.
Return STRICT JSON: {"sections":[{"heading":"...","body":"..."}]}`,
        },
        {
          role: 'user',
          content: [
            businessVoice(input.businessId),
            `DOCUMENT TYPE: ${input.type}`,
            `TITLE: ${title}`,
            customer ? `CUSTOMER: ${customer.name} (${customer.email ?? 'no email'}, ${customer.phone ?? 'no phone'})` : '',
            lines.length
              ? `LINE ITEMS (authoritative): ${lines
                  .map((line) => `${line.name} x${line.quantity} @ ${formatMoney(line.unitPriceCents, input.currency)} = ${formatMoney(line.totalCents, input.currency)}`)
                  .join('; ')}`
              : '',
            `TOTALS (authoritative): subtotal ${formatMoney(subtotalCents, input.currency)}, total ${formatMoney(totalCents, input.currency)}`,
            `INSTRUCTIONS: ${input.instructions ?? 'none'}`,
            retrieved.length ? `RELEVANT BUSINESS DOCUMENTS: ${retrieved.map((chunk) => chunk.content.slice(0, 400)).join(' | ')}` : '',
            `REQUIRED SECTIONS: ${
              input.type === 'INVOICE' || input.type === 'QUOTE' || input.type === 'RECEIPT'
                ? 'introduction, payment terms, thank-you note'
                : 'introduction, scope or summary, key points, next steps'
            }`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ];
      const result = await callLlm(messages, { temperature: 0.4, json: true });
      const parsed = JSON.parse(result.text) as { sections?: { heading: string; body: string }[] };
      if (parsed.sections?.length) {
        sections = parsed.sections.map((section) => ({ heading: section.heading, body: section.body }));
        provider = `openai-compatible:${result.model}`;
      }
      storeAiRun({
        businessId: input.businessId,
        userId: input.userId ?? null,
        surface: 'DOCUMENTS',
        prompt: `${input.type}: ${input.instructions ?? title}`,
        response: sections.map((section) => `${section.heading}\n${section.body}`).join('\n\n'),
        provider: aiConfigured() ? 'openai-compatible' : 'builtin-generator',
        model: result.model,
        sources: [],
        grounded: true,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      console.warn('[documents] falling back to deterministic document:', error instanceof Error ? error.message : error);
    }
  }

  const contentText = [
    title,
    `Issued by ${business.name}${business.phone ? ` · ${business.phone}` : ''}${business.email ? ` · ${business.email}` : ''}`,
    customer ? `Bill to: ${customer.name}` : '',
    ...sections.map((section) => `${section.heading}\n${section.body}`),
    lines.length
      ? `Line items:\n${lines
          .map((line) => `- ${line.name} x${line.quantity} — ${formatMoney(line.totalCents, input.currency)}`)
          .join('\n')}\nSubtotal ${formatMoney(subtotalCents, input.currency)}\nTotal ${formatMoney(totalCents, input.currency)}`
      : '',
    input.dueDate ? `Due: ${input.dueDate}` : '',
    `Generated with Workspace Digital${aiConfigured() ? '' : ' (built-in generator)'}.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    document: { title, sections, lines, subtotalCents, taxCents, totalCents, contentText },
    provider,
  };
}

function buildDocumentSections(input: {
  type: string;
  businessName: string;
  customerName: string | null;
  instructions: string;
  lines: DocumentLine[];
  factsSummary: { customers: number; revenue30: string; topItems: string[]; lowStock: string[]; upcoming: number };
  currency: string;
  dueDate: string | null;
}): { heading: string; body: string }[] {
  const hello = input.customerName ? `Dear ${input.customerName},` : 'Dear customer,';
  const totalText = formatMoney(input.lines.reduce((sum, line) => sum + line.totalCents, 0), input.currency);
  const intro = `${hello}\n\nThank you for working with ${input.businessName}.${
    input.instructions ? ` ${input.instructions}` : ''
  }`;

  switch (input.type) {
    case 'INVOICE':
    case 'RECEIPT':
      return [
        { heading: 'Summary', body: intro },
        { heading: 'Amount due', body: `Total: ${totalText}${input.dueDate ? `\nDue date: ${input.dueDate}` : ''}` },
        { heading: 'Payment terms', body: 'Payment is due on the date shown above. Please reference the document number when paying.' },
        { heading: 'Thank you', body: `We appreciate your business. For any question about this ${input.type.toLowerCase()}, reply to this message and we will help.` },
      ];
    case 'QUOTE':
      return [
        { heading: 'Introduction', body: intro },
        { heading: 'Quoted items', body: input.lines.map((line) => `${line.name} × ${line.quantity} — ${formatMoney(line.totalCents, input.currency)}`).join('\n') || 'No line items supplied.' },
        { heading: 'Validity', body: `This quotation is valid for 14 days. Quoted total: ${totalText}.` },
        { heading: 'Next steps', body: 'Reply to confirm and we will schedule delivery or your appointment.' },
      ];
    case 'PROPOSAL':
      return [
        { heading: 'Introduction', body: intro },
        { heading: 'Scope', body: input.instructions || 'The agreed scope will be confirmed in writing before work starts.' },
        { heading: 'Investment', body: input.lines.length ? input.lines.map((line) => `${line.name} — ${formatMoney(line.totalCents, input.currency)}`).join('\n') + `\nTotal: ${totalText}` : `Proposed total: ${totalText}` },
        { heading: 'Next steps', body: 'Approve this proposal and we will confirm the start date within two business days.' },
      ];
    case 'REPORT':
      return [
        { heading: 'Overview', body: `${input.businessName} performance summary.` },
        { heading: 'Verified metrics', body: `Customers on file: ${input.factsSummary.customers}\nRevenue (30 days): ${input.factsSummary.revenue30}\nUpcoming appointments (7 days): ${input.factsSummary.upcoming}` },
        { heading: 'Highlights', body: `Best sellers: ${input.factsSummary.topItems.join(', ') || 'not recorded yet'}` },
        { heading: 'AI recommendations', body: input.factsSummary.lowStock.length ? `Replenish low stock: ${input.factsSummary.lowStock.join(', ')}` : 'Inventory levels look healthy — focus on marketing to grow repeat visits.' },
      ];
    default:
      return [
        { heading: 'Overview', body: intro },
        { heading: 'Details', body: input.instructions || 'Details to be confirmed.' },
        { heading: 'Next steps', body: 'Contact us with any questions and we will confirm within one business day.' },
      ];
  }
}

// ---------------------------------------------------------------------------
// Sales assistance
// ---------------------------------------------------------------------------
export function scoreLead(input: {
  valueCents: number;
  stage: LeadStage;
  lastContactedAt: string | null;
  createdAt: string;
  source?: string | null;
  customer?: { status: string } | null;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 30;

  const stageWeight: Record<string, number> = {
    NEW_LEAD: 0,
    CONTACTED: 5,
    QUALIFIED: 15,
    PROPOSAL: 22,
    NEGOTIATION: 28,
    WON: 40,
    LOST: -30,
  };
  score += stageWeight[input.stage] ?? 0;
  if (stageWeight[input.stage]) reasons.push(`Pipeline stage ${LEAD_STAGE_LABELS[input.stage]}`);

  if (input.valueCents >= 100000) {
    score += 18;
    reasons.push('High deal value');
  } else if (input.valueCents >= 30000) {
    score += 10;
    reasons.push('Mid deal value');
  }

  const lastTouch = input.lastContactedAt ?? input.createdAt;
  const daysSince = Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000);
  if (daysSince <= 2) {
    score += 12;
    reasons.push('Contacted recently');
  } else if (daysSince > 14) {
    score -= 12;
    reasons.push('No contact for over two weeks');
  }

  if (input.source && /referral|repeat|walk/i.test(input.source)) {
    score += 8;
    reasons.push('High-intent source');
  }
  if (input.customer && ['VIP', 'RETURNING', 'ACTIVE'].includes(input.customer.status)) {
    score += 12;
    reasons.push(`Existing ${input.customer.status.toLowerCase()} customer`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export async function generateSalesMessage(input: {
  businessId: string;
  userId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  channel: string;
  intent: 'FOLLOW_UP' | 'QUOTE' | 'RECOMMENDATION' | 'REACTIVATION';
  tone?: string;
}): Promise<{ message: string; provider: string }> {
  const business = findBusinessById(input.businessId);
  if (!business) throw new Error('Business not found');
  const customer = input.customerId ? findCustomer(input.businessId, input.customerId) : undefined;
  const facts = buildFactPack(input.businessId);
  const hero = facts.sales.topItems[0]?.name ?? facts.sales.popularServices[0]?.name ?? 'our most requested service';
  const firstName = customer?.name.split(' ')[0] ?? 'there';

  const templates: Record<string, string> = {
    FOLLOW_UP: `Hi ${firstName}, this is ${business.name}. Just checking in on your enquiry — would you like me to hold a slot for you this week?`,
    QUOTE: `Hi ${firstName}, your quote from ${business.name} is ready. It covers ${hero}. Shall I send the breakdown so you can review it?`,
    RECOMMENDATION: `Hi ${firstName}, based on what other customers choose, ${hero} would suit you well at ${business.name}. Want me to reserve a time?`,
    REACTIVATION: `Hi ${firstName}, we have not seen you in a while at ${business.name} — we kept ${hero} aside for you. Reply YES and I will book you in.`,
  };

  let message = templates[input.intent] ?? templates.FOLLOW_UP;
  let provider = 'builtin-templates';

  if (aiConfigured()) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: AI_SYSTEM_GUARDRAIL },
        {
          role: 'system',
          content: `You write short sales messages for a small business. Use verified prices only when supplied. Keep under 400 characters. No markdown.`,
        },
        {
          role: 'user',
          content: [
            businessVoice(input.businessId),
            `CHANNEL: ${input.channel}`,
            `INTENT: ${input.intent}`,
            customer ? `CUSTOMER: ${customer.name} — status ${customer.status}, spend ${formatMoney(customer.totalSpendCents, business.currency)}` : 'CUSTOMER: unknown',
            `TONE: ${input.tone ?? 'warm and professional'}`,
          ].join('\n'),
        },
      ];
      const result = await callLlm(messages, { temperature: 0.6, maxTokens: 300 });
      if (result.text) {
        message = result.text.replace(/^["']|["']$/g, '').trim();
        provider = `openai-compatible:${result.model}`;
      }
    } catch (error) {
      console.warn('[sales] falling back to template message:', error instanceof Error ? error.message : error);
    }
  }

  storeAiRun({
    businessId: input.businessId,
    userId: input.userId ?? null,
    surface: 'SALES',
    prompt: `${input.intent} message for ${customer?.name ?? 'lead'}`,
    response: message,
    provider,
    model: null,
    sources: [],
    grounded: true,
    latencyMs: 0,
  });

  return { message, provider };
}

export function documentKnowledgeNote(businessId: string): string {
  const snapshot = buildKnowledgeSnapshot(businessId, 400);
  return snapshot ? 'Uses your uploaded business documents.' : 'No documents uploaded yet — upload your price list for better output.';
}

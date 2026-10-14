import { all, get, run, toJson, nowIso, type SqlValue } from '@/lib/db';
import { newId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export type ConversationRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  channel: string;
  subject: string | null;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_ai_handled: number;
  needs_human: number;
  assigned_to_id: string | null;
  unread_for_business: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  preview: string | null;
  message_count: number;
};

const CONVERSATION_SELECT = `
  SELECT cv.*, c.name AS customer_name,
         (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
         (SELECT count(*) FROM messages m WHERE m.conversation_id = cv.id) AS message_count
  FROM conversations cv
  LEFT JOIN customers c ON c.id = cv.customer_id
`;

export function listConversations(
  businessId: string,
  filter: { status?: string; channel?: string; search?: string; customerId?: string; limit?: number } = {},
): ConversationRow[] {
  const clauses = ['cv.business_id = ?'];
  const params: SqlValue[] = [businessId];
  if (filter.status) {
    clauses.push('cv.status = ?');
    params.push(filter.status);
  }
  if (filter.channel) {
    clauses.push('cv.channel = ?');
    params.push(filter.channel);
  }
  if (filter.customerId) {
    clauses.push('cv.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.search) {
    clauses.push(
      `(coalesce(cv.contact_name,'') LIKE ? OR coalesce(cv.contact_email,'') LIKE ? OR coalesce(cv.subject,'') LIKE ?
        OR coalesce(c.name,'') LIKE ? OR EXISTS (
          SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.body LIKE ?
        ))`,
    );
    const like = `%${filter.search}%`;
    params.push(like, like, like, like, like);
  }
  return all<ConversationRow>(
    `${CONVERSATION_SELECT} WHERE ${clauses.join(' AND ')}
     ORDER BY cv.last_message_at DESC LIMIT ?`,
    [...params, Math.min(Math.max(filter.limit ?? 60, 1), 200)],
  );
}

export function findConversation(businessId: string, id: string): ConversationRow | undefined {
  return get<ConversationRow>(`${CONVERSATION_SELECT} WHERE cv.business_id = ? AND cv.id = ?`, [businessId, id]);
}

export function createConversation(
  businessId: string,
  input: {
    channel: string;
    customerId?: string | null;
    subject?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    status?: string;
    isAiHandled?: boolean;
    needsHuman?: boolean;
  },
): string {
  const id = newId('cnv');
  const at = nowIso();
  run(
    `INSERT INTO conversations (id, business_id, customer_id, channel, subject, status, contact_name, contact_email,
        contact_phone, is_ai_handled, needs_human, assigned_to_id, unread_for_business, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?)`,
    [
      id,
      businessId,
      input.customerId ?? null,
      input.channel,
      input.subject ?? null,
      input.status ?? 'OPEN',
      input.contactName ?? null,
      input.contactEmail ?? null,
      input.contactPhone ?? null,
      input.isAiHandled === false ? 0 : 1,
      input.needsHuman ? 1 : 0,
      at,
      at,
      at,
    ],
  );
  return id;
}

export function updateConversation(
  businessId: string,
  id: string,
  patch: {
    status?: string;
    customerId?: string | null;
    subject?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    assignedToId?: string | null;
    isAiHandled?: boolean;
    needsHuman?: boolean;
    unreadForBusiness?: number;
    lastMessageAt?: string;
  },
): void {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  const push = (column: string, value: SqlValue) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if (patch.status !== undefined) push('status', patch.status);
  if (patch.customerId !== undefined) push('customer_id', patch.customerId);
  if (patch.subject !== undefined) push('subject', patch.subject);
  if (patch.contactName !== undefined) push('contact_name', patch.contactName);
  if (patch.contactEmail !== undefined) push('contact_email', patch.contactEmail);
  if (patch.contactPhone !== undefined) push('contact_phone', patch.contactPhone);
  if (patch.assignedToId !== undefined) push('assigned_to_id', patch.assignedToId);
  if (patch.isAiHandled !== undefined) push('is_ai_handled', patch.isAiHandled ? 1 : 0);
  if (patch.needsHuman !== undefined) push('needs_human', patch.needsHuman ? 1 : 0);
  if (patch.unreadForBusiness !== undefined) push('unread_for_business', patch.unreadForBusiness);
  if (patch.lastMessageAt !== undefined) push('last_message_at', patch.lastMessageAt);
  push('updated_at', nowIso());
  params.push(businessId, id);
  run(`UPDATE conversations SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function openConversationCount(businessId: string): number {
  const row = get<{ c: number }>(
    `SELECT count(*) AS c FROM conversations WHERE business_id = ? AND status IN ('OPEN','PENDING','ESCALATED')`,
    [businessId],
  );
  return Number(row?.c ?? 0);
}

export function conversationCounts(businessId: string) {
  return all<{ status: string; c: number }>(
    'SELECT status, count(*) AS c FROM conversations WHERE business_id = ? GROUP BY status',
    [businessId],
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type MessageRow = {
  id: string;
  conversation_id: string;
  business_id: string;
  sender: string;
  sender_user_id: string | null;
  sender_name: string | null;
  body: string;
  meta_json: string | null;
  meta: unknown;
  grounded: number | null;
  read_at: string | null;
  created_at: string;
};

function mapMessage(row: Record<string, SqlValue>): MessageRow {
  let meta: unknown = null;
  if (typeof row.meta_json === 'string' && row.meta_json) {
    try {
      meta = JSON.parse(row.meta_json);
    } catch {
      meta = null;
    }
  }
  return { ...(row as unknown as MessageRow), meta };
}

export function addMessage(
  businessId: string,
  input: {
    conversationId: string;
    sender: 'CUSTOMER' | 'AI' | 'STAFF' | 'SYSTEM';
    body: string;
    senderUserId?: string | null;
    grounded?: boolean;
    meta?: unknown;
  },
): string {
  const id = newId('msg');
  const at = nowIso();
  run(
    `INSERT INTO messages (id, business_id, conversation_id, sender, sender_user_id, body, meta_json, grounded, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      businessId,
      input.conversationId,
      input.sender,
      input.senderUserId ?? null,
      input.body,
      input.meta === undefined ? null : toJson(input.meta),
      input.grounded === undefined ? null : input.grounded ? 1 : 0,
      at,
    ],
  );
  updateConversation(businessId, input.conversationId, {
    lastMessageAt: at,
    ...(input.sender === 'CUSTOMER'
      ? { unreadForBusiness: 1, isAiHandled: true }
      : { unreadForBusiness: 0 }),
  });
  return id;
}

export function listMessages(businessId: string, conversationId: string, limit = 200): MessageRow[] {
  return all<Record<string, SqlValue>>(
    `SELECT m.*, u.name AS sender_name
     FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
     WHERE m.business_id = ? AND m.conversation_id = ?
     ORDER BY m.created_at ASC LIMIT ?`,
    [businessId, conversationId, Math.min(Math.max(limit, 1), 500)],
  ).map(mapMessage);
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export type TicketRow = {
  id: string;
  business_id: string;
  conversation_id: string | null;
  customer_id: string | null;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  escalated_from_ai: number;
  escalation_reason: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  assigned_to_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export function createTicket(
  businessId: string,
  input: {
    subject: string;
    description?: string | null;
    status?: string;
    priority?: string;
    escalatedFromAi?: boolean;
    escalationReason?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    conversationId?: string | null;
    customerId?: string | null;
    assignedToId?: string | null;
  },
): string {
  const id = newId('tkt');
  run(
    `INSERT INTO support_tickets (id, business_id, conversation_id, customer_id, subject, description, status, priority,
        escalated_from_ai, escalation_reason, contact_name, contact_email, contact_phone, assigned_to_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.conversationId ?? null,
      input.customerId ?? null,
      input.subject,
      input.description ?? null,
      input.status ?? 'OPEN',
      input.priority ?? 'MEDIUM',
      input.escalatedFromAi ? 1 : 0,
      input.escalationReason ?? null,
      input.contactName ?? null,
      input.contactEmail ?? null,
      input.contactPhone ?? null,
      input.assignedToId ?? null,
      nowIso(),
      nowIso(),
    ],
  );
  return id;
}

export function listTickets(businessId: string, filter: { status?: string; limit?: number } = {}): TicketRow[] {
  const clauses = ['business_id = ?'];
  const params: SqlValue[] = [businessId];
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  return all<TicketRow>(
    `SELECT * FROM support_tickets WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    [...params, Math.min(Math.max(filter.limit ?? 100, 1), 300)],
  );
}

export function updateTicket(
  businessId: string,
  id: string,
  patch: { status?: string; priority?: string; assignedToId?: string | null; resolvedAt?: string | null },
): void {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.priority !== undefined) {
    sets.push('priority = ?');
    params.push(patch.priority);
  }
  if (patch.assignedToId !== undefined) {
    sets.push('assigned_to_id = ?');
    params.push(patch.assignedToId);
  }
  if (patch.status === 'RESOLVED' || patch.status === 'CLOSED') {
    sets.push('resolved_at = ?');
    params.push(patch.resolvedAt ?? nowIso());
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE support_tickets SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function countTickets(businessId: string, status?: string): number {
  const row = status
    ? get<{ c: number }>('SELECT count(*) AS c FROM support_tickets WHERE business_id = ? AND status = ?', [
        businessId,
        status,
      ])
    : get<{ c: number }>('SELECT count(*) AS c FROM support_tickets WHERE business_id = ?', [businessId]);
  return Number(row?.c ?? 0);
}

/**
 * Recurring customer-issue topics, derived from support tickets and escalated
 * conversations. Statistical, not generated — safe to quote to the assistant.
 */
export function frequentIssueTopics(businessId: string, limit = 6) {
  const rows = all<{ subject: string }>(
    `SELECT subject FROM support_tickets WHERE business_id = ?
     UNION ALL
     SELECT coalesce(subject, '') AS subject FROM conversations
     WHERE business_id = ? AND status = 'ESCALATED'`,
    [businessId, businessId],
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    const topic = normaliseTopic(row.subject);
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([topic, c]) => ({ topic, c }))
    .sort((left, right) => right.c - left.c)
    .slice(0, limit);
}

const ISSUE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'about', 'please', 'help', 'need', 'want', 'this', 'that', 'have', 'can', 'you',
  'your', 'hello', 'hi', 'hey', 'thanks', 'thank', 'question', 'issue', 'problem', 'when', 'where', 'what',
]);

function normaliseTopic(subject: string): string | null {
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !ISSUE_STOP_WORDS.has(word));
  if (!words.length) return null;
  const topic = words.slice(0, 3).join(' ');
  return topic.length > 60 ? topic.slice(0, 60) : topic;
}

// ---------------------------------------------------------------------------
// AI support settings
// ---------------------------------------------------------------------------

export type SupportSettingsRow = {
  id: string;
  business_id: string;
  greeting: string | null;
  tone: string | null;
  escalation_message: string | null;
  handoff_email: string | null;
  collect_fields_json: string | null;
  auto_reply_enabled: number;
  widget_enabled: number;
  created_at: string;
  updated_at: string;
};

const DEFAULT_GREETING = 'Hi! I am the AI assistant for this business. How can I help you today?';
const DEFAULT_ESCALATION =
  'I want to make sure you get an accurate answer, so I have asked a member of our team to help you directly. Please share the best way to reach you and we will get back to you shortly.';

export function getSupportSettings(businessId: string): SupportSettingsRow {
  const existing = get<SupportSettingsRow>('SELECT * FROM support_settings WHERE business_id = ?', [businessId]);
  if (existing) return existing;
  const id = newId('sup');
  const at = nowIso();
  run(
    `INSERT INTO support_settings (id, business_id, greeting, tone, escalation_message, handoff_email,
        collect_fields_json, auto_reply_enabled, widget_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, 1, 1, ?, ?)`,
    [
      id,
      businessId,
      DEFAULT_GREETING,
      'friendly-professional',
      DEFAULT_ESCALATION,
      toJson(['name', 'email', 'phone']),
      at,
      at,
    ],
  );
  return get<SupportSettingsRow>('SELECT * FROM support_settings WHERE business_id = ?', [businessId])!;
}

export function updateSupportSettings(
  businessId: string,
  patch: {
    greeting?: string;
    tone?: string;
    escalationMessage?: string;
    handoffEmail?: string;
    collectFields?: string[];
    autoReplyEnabled?: boolean;
    widgetEnabled?: boolean;
  },
): void {
  getSupportSettings(businessId);
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.greeting !== undefined) {
    sets.push('greeting = ?');
    params.push(patch.greeting);
  }
  if (patch.tone !== undefined) {
    sets.push('tone = ?');
    params.push(patch.tone);
  }
  if (patch.escalationMessage !== undefined) {
    sets.push('escalation_message = ?');
    params.push(patch.escalationMessage);
  }
  if (patch.handoffEmail !== undefined) {
    sets.push('handoff_email = ?');
    params.push(patch.handoffEmail);
  }
  if (patch.collectFields !== undefined) {
    sets.push('collect_fields_json = ?');
    params.push(toJson(patch.collectFields));
  }
  if (patch.autoReplyEnabled !== undefined) {
    sets.push('auto_reply_enabled = ?');
    params.push(patch.autoReplyEnabled ? 1 : 0);
  }
  if (patch.widgetEnabled !== undefined) {
    sets.push('widget_enabled = ?');
    params.push(patch.widgetEnabled ? 1 : 0);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId);
  run(`UPDATE support_settings SET ${sets.join(', ')} WHERE business_id = ?`, params);
}

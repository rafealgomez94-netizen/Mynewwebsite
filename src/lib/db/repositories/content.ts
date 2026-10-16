import { all, get, run, toJson, nowIso, type SqlValue } from '@/lib/db';
import { newId } from '@/lib/utils';
// The platform-wide fallback currency (Liberia first) shared with workspace creation.
// eslint-disable-next-line import/no-cycle
import { DEFAULT_CURRENCY } from '@/lib/db/repositories/platform';

// ---------------------------------------------------------------------------
// Documents (invoices, quotes, receipts, proposals, reports, messages, SOPs)
// ---------------------------------------------------------------------------

export type DocumentRow = {
  id: string;
  business_id: string;
  type: string;
  number: string;
  title: string;
  customer_id: string | null;
  status: string;
  content: unknown;
  content_text: string | null;
  total_cents: number;
  currency: string;
  source: string;
  issued_at: string | null;
  due_at: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
};

const DOCUMENT_PREFIX: Record<string, string> = {
  INVOICE: 'INV',
  QUOTE: 'QUO',
  RECEIPT: 'REC',
  PROPOSAL: 'PRO',
  REPORT: 'REP',
  MESSAGE: 'MSG',
  MARKETING_PLAN: 'MKT',
  SOP: 'SOP',
};

function nextDocumentNumber(businessId: string, type: string, issuedAt: string): string {
  const row = get<{ c: number }>('SELECT count(*) AS c FROM documents WHERE business_id = ? AND type = ?', [
    businessId,
    type,
  ]);
  const sequence = String(Number(row?.c ?? 0) + 1).padStart(4, '0');
  return `${DOCUMENT_PREFIX[type] ?? 'DOC'}-${issuedAt.slice(0, 10).replace(/-/g, '')}-${sequence}`;
}

function mapDocument(row: Record<string, SqlValue>): DocumentRow {
  let content: unknown = null;
  if (typeof row.content_json === 'string' && row.content_json) {
    try {
      content = JSON.parse(row.content_json);
    } catch {
      content = null;
    }
  }
  return { ...(row as unknown as DocumentRow), content };
}

export function createDocument(
  businessId: string,
  input: {
    type: string;
    title: string;
    customerId?: string | null;
    status?: string;
    content: unknown;
    contentText?: string | null;
    totalCents?: number;
    currency?: string;
    source?: string;
    issuedAt?: string | null;
    dueAt?: string | null;
    createdById?: string | null;
  },
): DocumentRow {
  const id = newId('doc');
  const at = nowIso();
  const issuedAt = input.issuedAt ?? at;
  const number = nextDocumentNumber(businessId, input.type, issuedAt);
  run(
    `INSERT INTO documents (id, business_id, type, number, title, customer_id, status, content_json, content_text,
        total_cents, currency, source, issued_at, due_at, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.type,
      number,
      input.title,
      input.customerId ?? null,
      input.status ?? 'DRAFT',
      toJson(input.content),
      input.contentText ?? null,
      input.totalCents ?? 0,
      input.currency ?? DEFAULT_CURRENCY,
      input.source ?? 'MANUAL',
      issuedAt,
      input.dueAt ?? null,
      input.createdById ?? null,
      at,
      at,
    ],
  );
  return findDocument(businessId, id)!;
}

export function findDocument(businessId: string, id: string): DocumentRow | undefined {
  const row = get<Record<string, SqlValue>>(
    `SELECT d.*, c.name AS customer_name FROM documents d
     LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.business_id = ? AND d.id = ?`,
    [businessId, id],
  );
  return row ? mapDocument(row) : undefined;
}

export function listDocuments(
  businessId: string,
  filter: { type?: string; search?: string; limit?: number } = {},
): DocumentRow[] {
  const clauses = ['d.business_id = ?'];
  const params: SqlValue[] = [businessId];
  if (filter.type) {
    clauses.push('d.type = ?');
    params.push(filter.type);
  }
  if (filter.search) {
    clauses.push(`(d.title LIKE ? OR d.number LIKE ? OR coalesce(c.name, '') LIKE ?)`);
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  return all<Record<string, SqlValue>>(
    `SELECT d.*, c.name AS customer_name FROM documents d
     LEFT JOIN customers c ON c.id = d.customer_id
     WHERE ${clauses.join(' AND ')} ORDER BY d.created_at DESC LIMIT ?`,
    [...params, Math.min(Math.max(filter.limit ?? 100, 1), 300)],
  ).map(mapDocument);
}

export function updateDocument(
  businessId: string,
  id: string,
  patch: { title?: string; status?: string; content?: unknown; contentText?: string; totalCents?: number; dueAt?: string | null },
): void {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.content !== undefined) {
    sets.push('content_json = ?');
    params.push(toJson(patch.content));
  }
  if (patch.contentText !== undefined) {
    sets.push('content_text = ?');
    params.push(patch.contentText);
  }
  if (patch.totalCents !== undefined) {
    sets.push('total_cents = ?');
    params.push(patch.totalCents);
  }
  if (patch.dueAt !== undefined) {
    sets.push('due_at = ?');
    params.push(patch.dueAt);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE documents SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteDocument(businessId: string, id: string): void {
  run('DELETE FROM documents WHERE business_id = ? AND id = ?', [businessId, id]);
}

export function documentCounts(businessId: string) {
  return all<{ type: string; c: number }>(
    'SELECT type, count(*) AS c FROM documents WHERE business_id = ? GROUP BY type',
    [businessId],
  );
}

// ---------------------------------------------------------------------------
// Marketing: campaigns + posts (Generate → Edit → Approve → Publish)
// ---------------------------------------------------------------------------

export type CampaignRow = {
  id: string;
  business_id: string;
  name: string;
  objective: string | null;
  audience: string | null;
  channels_json: string | null;
  channels: string[];
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  post_count?: number;
  approved_count?: number;
};

export function createCampaign(
  businessId: string,
  input: {
    name: string;
    objective?: string | null;
    audience?: string | null;
    channels: string[];
    status?: string;
    startDate?: string | null;
    endDate?: string | null;
    createdById?: string | null;
  },
): string {
  const id = newId('cmp');
  const at = nowIso();
  run(
    `INSERT INTO marketing_campaigns (id, business_id, name, objective, audience, channels_json, status, start_date,
        end_date, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.name,
      input.objective ?? null,
      input.audience ?? null,
      toJson(input.channels),
      input.status ?? 'DRAFT',
      input.startDate ?? null,
      input.endDate ?? null,
      input.createdById ?? null,
      at,
      at,
    ],
  );
  return id;
}

function mapCampaign(row: Record<string, SqlValue>): CampaignRow {
  let channels: string[] = [];
  if (typeof row.channels_json === 'string' && row.channels_json) {
    try {
      channels = JSON.parse(row.channels_json) as string[];
    } catch {
      channels = [];
    }
  }
  return { ...(row as unknown as CampaignRow), channels };
}

export function listCampaigns(businessId: string, limit = 50): CampaignRow[] {
  return all<Record<string, SqlValue>>(
    `SELECT c.*,
            (SELECT count(*) FROM marketing_posts p WHERE p.campaign_id = c.id) AS post_count,
            (SELECT count(*) FROM marketing_posts p WHERE p.campaign_id = c.id
              AND p.status IN ('APPROVED','SCHEDULED','PUBLISHED')) AS approved_count
     FROM marketing_campaigns c WHERE c.business_id = ? ORDER BY c.created_at DESC LIMIT ?`,
    [businessId, Math.min(Math.max(limit, 1), 200)],
  ).map(mapCampaign);
}

export function findCampaign(businessId: string, id: string): CampaignRow | undefined {
  const row = get<Record<string, SqlValue>>('SELECT * FROM marketing_campaigns WHERE business_id = ? AND id = ?', [
    businessId,
    id,
  ]);
  return row ? mapCampaign(row) : undefined;
}

export function updateCampaign(
  businessId: string,
  id: string,
  patch: { name?: string; objective?: string | null; audience?: string | null; status?: string; startDate?: string | null; endDate?: string | null },
): void {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.objective !== undefined) {
    sets.push('objective = ?');
    params.push(patch.objective);
  }
  if (patch.audience !== undefined) {
    sets.push('audience = ?');
    params.push(patch.audience);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.startDate !== undefined) {
    sets.push('start_date = ?');
    params.push(patch.startDate);
  }
  if (patch.endDate !== undefined) {
    sets.push('end_date = ?');
    params.push(patch.endDate);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE marketing_campaigns SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export type MarketingPostRow = {
  id: string;
  business_id: string;
  campaign_id: string | null;
  channel: string;
  title: string | null;
  body: string;
  hashtags: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  approved_by_id: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export function createMarketingPost(
  businessId: string,
  input: {
    campaignId?: string | null;
    channel: string;
    title?: string | null;
    body: string;
    hashtags?: string | null;
    status?: string;
    scheduledAt?: string | null;
    createdById?: string | null;
  },
): string {
  const id = newId('pst');
  const at = nowIso();
  run(
    `INSERT INTO marketing_posts (id, business_id, campaign_id, channel, title, body, hashtags, status, scheduled_at,
        published_at, approved_by_id, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    [
      id,
      businessId,
      input.campaignId ?? null,
      input.channel,
      input.title ?? null,
      input.body,
      input.hashtags ?? null,
      input.status ?? 'DRAFT',
      input.scheduledAt ?? null,
      input.createdById ?? null,
      at,
      at,
    ],
  );
  return id;
}

export function listPosts(
  businessId: string,
  filter: { status?: string; channel?: string; campaignId?: string; limit?: number } = {},
): MarketingPostRow[] {
  const clauses = ['business_id = ?'];
  const params: SqlValue[] = [businessId];
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  if (filter.channel) {
    clauses.push('channel = ?');
    params.push(filter.channel);
  }
  if (filter.campaignId) {
    clauses.push('campaign_id = ?');
    params.push(filter.campaignId);
  }
  return all<MarketingPostRow>(
    `SELECT * FROM marketing_posts WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    [...params, Math.min(Math.max(filter.limit ?? 100, 1), 300)],
  );
}

export function findPost(businessId: string, id: string): MarketingPostRow | undefined {
  return get<MarketingPostRow>('SELECT * FROM marketing_posts WHERE business_id = ? AND id = ?', [businessId, id]);
}

export function updatePost(
  businessId: string,
  id: string,
  patch: {
    title?: string;
    body?: string;
    hashtags?: string | null;
    status?: string;
    channel?: string;
    campaignId?: string | null;
    scheduledAt?: string | null;
    publishedAt?: string | null;
    approvedById?: string | null;
  },
): void {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (patch.body !== undefined) {
    sets.push('body = ?');
    params.push(patch.body);
  }
  if (patch.hashtags !== undefined) {
    sets.push('hashtags = ?');
    params.push(patch.hashtags);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.channel !== undefined) {
    sets.push('channel = ?');
    params.push(patch.channel);
  }
  if (patch.campaignId !== undefined) {
    sets.push('campaign_id = ?');
    params.push(patch.campaignId);
  }
  if (patch.scheduledAt !== undefined) {
    sets.push('scheduled_at = ?');
    params.push(patch.scheduledAt);
  }
  if (patch.publishedAt !== undefined) {
    sets.push('published_at = ?');
    params.push(patch.publishedAt);
  }
  if (patch.approvedById !== undefined) {
    sets.push('approved_by_id = ?');
    params.push(patch.approvedById);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE marketing_posts SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deletePost(businessId: string, id: string): void {
  run('DELETE FROM marketing_posts WHERE business_id = ? AND id = ?', [businessId, id]);
}

export function marketingCounts(businessId: string) {
  return all<{ status: string; c: number }>(
    'SELECT status, count(*) AS c FROM marketing_posts WHERE business_id = ? GROUP BY status',
    [businessId],
  );
}

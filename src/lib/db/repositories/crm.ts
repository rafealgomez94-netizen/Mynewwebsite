import { all, get, json, nowIso, run } from '@/lib/db';
import { newId } from '@/lib/utils';
import type { CustomerStatus, LeadStage } from '@/lib/domain';

export type CustomerRow = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: string | null;
  status: string;
  source: string | null;
  tags_json: string | null;
  notes: string | null;
  total_spend_cents: number;
  order_count: number;
  appointment_count: number;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = Omit<CustomerRow, 'tags_json'> & { tags: string[]; totalSpendCents: number };

export function toCustomer(row: CustomerRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    birthday: row.birthday,
    status: row.status as CustomerStatus,
    source: row.source,
    tags: json<string[]>(row.tags_json, []),
    notes: row.notes,
    totalSpendCents: row.total_spend_cents,
    orderCount: row.order_count,
    appointmentCount: row.appointment_count,
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CustomerFilter = {
  search?: string;
  status?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  sort?: 'recent' | 'name' | 'spend';
};

export function listCustomers(businessId: string, filter: CustomerFilter = {}) {
  const clauses = ['business_id = ?'];
  const params: (string | number)[] = [businessId];
  if (filter.search) {
    clauses.push('(lower(name) LIKE ? OR lower(coalesce(email, \'\')) LIKE ? OR coalesce(phone, \'\') LIKE ?)');
    const like = `%${filter.search.toLowerCase()}%`;
    params.push(like, like, `%${filter.search}%`);
  }
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  if (filter.tag) {
    clauses.push('coalesce(tags_json, \'\') LIKE ?');
    params.push(`%"${filter.tag}"%`);
  }
  const order =
    filter.sort === 'name'
      ? 'name ASC'
      : filter.sort === 'spend'
        ? 'total_spend_cents DESC'
        : 'coalesce(last_interaction_at, created_at) DESC';
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;
  const rows = all<CustomerRow>(
    `SELECT * FROM customers WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const total = get<{ c: number }>(
    `SELECT count(*) AS c FROM customers WHERE ${clauses.join(' AND ')}`,
    params,
  )?.c ?? 0;
  return { rows: rows.map(toCustomer), total, limit, offset };
}

export function findCustomer(businessId: string, id: string) {
  const row = get<CustomerRow>(`SELECT * FROM customers WHERE business_id = ? AND id = ?`, [businessId, id]);
  return row ? toCustomer(row) : undefined;
}

export function findCustomersByIds(businessId: string, ids: string[]) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all<CustomerRow>(
    `SELECT * FROM customers WHERE business_id = ? AND id IN (${placeholders})`,
    [businessId, ...ids],
  ).map(toCustomer);
}

export function createCustomer(
  businessId: string,
  input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    birthday?: string | null;
    status?: CustomerStatus;
    source?: string | null;
    tags?: string[];
    notes?: string | null;
  },
) {
  const id = newId('cus');
  const now = nowIso();
  run(
    `INSERT INTO customers (id, business_id, name, phone, email, address, birthday, status, source, tags_json, notes,
                            last_interaction_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.birthday ?? null,
      input.status ?? 'NEW',
      input.source ?? null,
      JSON.stringify(input.tags ?? []),
      input.notes ?? null,
      now,
      now,
      now,
    ],
  );
  return findCustomer(businessId, id)!;
}

export function updateCustomer(
  businessId: string,
  id: string,
  patch: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    birthday: string | null;
    status: string;
    source: string | null;
    tags: string[];
    notes: string | null;
  }>,
) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const direct: [keyof typeof patch, string][] = [
    ['name', 'name'],
    ['phone', 'phone'],
    ['email', 'email'],
    ['address', 'address'],
    ['birthday', 'birthday'],
    ['status', 'status'],
    ['source', 'source'],
    ['notes', 'notes'],
  ];
  for (const [key, column] of direct) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push((patch[key] as string | null) ?? null);
    }
  }
  if (patch.tags !== undefined) {
    sets.push('tags_json = ?');
    params.push(JSON.stringify(patch.tags));
  }
  if (!sets.length) return findCustomer(businessId, id);
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE customers SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
  return findCustomer(businessId, id);
}

export function deleteCustomer(businessId: string, id: string): void {
  run(`DELETE FROM customers WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function touchCustomer(
  businessId: string,
  customerId: string,
  patch: { orderDelta?: number; orderCountDelta?: number; appointmentCountDelta?: number } = {},
): void {
  run(
    `UPDATE customers SET last_interaction_at = ?, updated_at = ?,
       total_spend_cents = total_spend_cents + ?,
       order_count = order_count + ?,
       appointment_count = appointment_count + ?
     WHERE business_id = ? AND id = ?`,
    [
      nowIso(),
      nowIso(),
      patch.orderDelta ?? 0,
      patch.orderCountDelta ?? 0,
      patch.appointmentCountDelta ?? 0,
      businessId,
      customerId,
    ],
  );
}

export function countCustomers(businessId: string, sinceIso?: string): number {
  const row = sinceIso
    ? get<{ c: number }>(`SELECT count(*) AS c FROM customers WHERE business_id = ? AND created_at >= ?`, [
        businessId,
        sinceIso,
      ])
    : get<{ c: number }>(`SELECT count(*) AS c FROM customers WHERE business_id = ?`, [businessId]);
  return row?.c ?? 0;
}

export function customerStatusCounts(businessId: string) {
  return all<{ status: string; c: number }>(
    `SELECT status, count(*) AS c FROM customers WHERE business_id = ? GROUP BY status`,
    [businessId],
  );
}

/** Customers whose last interaction is older than the given cut-off (follow-up list). */
export function customersNeedingFollowUp(businessId: string, days = 30, limit = 10) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return all<CustomerRow>(
    `SELECT * FROM customers
     WHERE business_id = ?
       AND status IN ('LEAD', 'ACTIVE', 'RETURNING', 'VIP')
       AND coalesce(last_interaction_at, created_at) < ?
     ORDER BY coalesce(last_interaction_at, created_at) ASC
     LIMIT ?`,
    [businessId, cutoff, limit],
  ).map(toCustomer);
}

export function allCustomerTags(businessId: string): string[] {
  const rows = all<{ tags_json: string | null }>(
    `SELECT tags_json FROM customers WHERE business_id = ? AND tags_json IS NOT NULL`,
    [businessId],
  );
  const set = new Set<string>();
  for (const row of rows) {
    for (const tag of json<string[]>(row.tags_json, [])) set.add(tag);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// Leads / sales pipeline
// ---------------------------------------------------------------------------
export type LeadRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: string;
  value_cents: number;
  score: number | null;
  score_reason: string | null;
  owner_user_id: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export function toLead(row: LeadRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    source: row.source,
    stage: row.stage as LeadStage,
    valueCents: row.value_cents,
    score: row.score,
    scoreReason: row.score_reason,
    ownerUserId: row.owner_user_id,
    notes: row.notes,
    lastContactedAt: row.last_contacted_at,
    nextFollowUpAt: row.next_follow_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listLeads(businessId: string, filter: { stage?: string; search?: string; limit?: number } = {}) {
  const clauses = ['business_id = ?'];
  const params: (string | number)[] = [businessId];
  if (filter.stage) {
    clauses.push('stage = ?');
    params.push(filter.stage);
  }
  if (filter.search) {
    clauses.push(`(lower(name) LIKE ? OR lower(coalesce(email, '')) LIKE ?)`);
    const like = `%${filter.search.toLowerCase()}%`;
    params.push(like, like);
  }
  const rows = all<LeadRow>(
    `SELECT * FROM leads WHERE ${clauses.join(' AND ')} ORDER BY
       CASE stage WHEN 'NEGOTIATION' THEN 0 WHEN 'PROPOSAL' THEN 1 WHEN 'QUALIFIED' THEN 2 WHEN 'CONTACTED' THEN 3
                  WHEN 'NEW_LEAD' THEN 4 WHEN 'WON' THEN 5 ELSE 6 END,
       created_at DESC
     LIMIT ?`,
    [...params, Math.min(filter.limit ?? 200, 400)],
  );
  return rows.map(toLead);
}

export function findLead(businessId: string, id: string) {
  const row = get<LeadRow>(`SELECT * FROM leads WHERE business_id = ? AND id = ?`, [businessId, id]);
  return row ? toLead(row) : undefined;
}

export function createLead(
  businessId: string,
  input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    stage?: LeadStage;
    valueCents?: number;
    notes?: string | null;
    customerId?: string | null;
    ownerUserId?: string | null;
    nextFollowUpAt?: string | null;
  },
) {
  const id = newId('led');
  const now = nowIso();
  run(
    `INSERT INTO leads (id, business_id, customer_id, name, phone, email, source, stage, value_cents, notes,
                        owner_user_id, next_follow_up_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.customerId ?? null,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.source ?? null,
      input.stage ?? 'NEW_LEAD',
      input.valueCents ?? 0,
      input.notes ?? null,
      input.ownerUserId ?? null,
      input.nextFollowUpAt ?? null,
      now,
      now,
    ],
  );
  return findLead(businessId, id)!;
}

export function updateLead(
  businessId: string,
  id: string,
  patch: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    source: string | null;
    stage: LeadStage;
    valueCents: number;
    notes: string | null;
    score: number | null;
    scoreReason: string | null;
    ownerUserId: string | null;
    lastContactedAt: string | null;
    nextFollowUpAt: string | null;
    customerId: string | null;
  }>,
) {
  const map: Record<string, string> = {
    name: 'name',
    phone: 'phone',
    email: 'email',
    source: 'source',
    stage: 'stage',
    valueCents: 'value_cents',
    notes: 'notes',
    score: 'score',
    scoreReason: 'score_reason',
    ownerUserId: 'owner_user_id',
    lastContactedAt: 'last_contacted_at',
    nextFollowUpAt: 'next_follow_up_at',
    customerId: 'customer_id',
  };
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (key in patch) {
      sets.push(`${column} = ?`);
      params.push((patch as Record<string, string | number | null>)[key] ?? null);
    }
  }
  if (!sets.length) return findLead(businessId, id);
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE leads SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
  return findLead(businessId, id);
}

export function deleteLead(businessId: string, id: string): void {
  run(`DELETE FROM leads WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function leadStageSummary(businessId: string) {
  return all<{ stage: string; c: number; value: number }>(
    `SELECT stage, count(*) AS c, coalesce(sum(value_cents), 0) AS value
     FROM leads WHERE business_id = ? GROUP BY stage`,
    [businessId],
  );
}

export function addLeadActivity(
  businessId: string,
  leadId: string,
  input: { type: string; content: string; createdById?: string | null },
) {
  run(
    `INSERT INTO lead_activities (id, business_id, lead_id, type, content, created_by_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId('lac'), businessId, leadId, input.type, input.content, input.createdById ?? null, nowIso()],
  );
}

export function listLeadActivities(businessId: string, leadId: string, limit = 50) {
  return all<{
    id: string;
    type: string;
    content: string;
    created_at: string;
    created_by_id: string | null;
    author: string | null;
  }>(
    `SELECT a.id, a.type, a.content, a.created_at, a.created_by_id, u.name AS author
     FROM lead_activities a LEFT JOIN users u ON u.id = a.created_by_id
     WHERE a.business_id = ? AND a.lead_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    [businessId, leadId, limit],
  );
}

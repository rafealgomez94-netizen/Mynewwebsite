import { all, get, run, toJson, nowIso, tx, type SqlValue } from '@/lib/db';
import { newId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export type AppointmentRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  staff_id: string | null;
  service_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  price_cents: number;
  location: string | null;
  notes: string | null;
  source: string;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service_name: string | null;
  service_duration_minutes: number | null;
  staff_name: string | null;
};

const APPOINTMENT_SELECT = `
  SELECT a.id, a.business_id, a.customer_id, a.staff_id, a.service_id, a.title, a.start_at, a.end_at, a.status,
         a.price_cents, a.location, a.notes, a.source, a.reminder_sent_at, a.created_at, a.updated_at,
         c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         s.name AS service_name, s.duration_minutes AS service_duration_minutes,
         st.name AS staff_name
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN services s ON s.id = a.service_id
  LEFT JOIN staff st ON st.id = a.staff_id
`;

export function listAppointments(
  businessId: string,
  filter: {
    fromIso?: string;
    toIso?: string;
    status?: string;
    customerId?: string;
    staffId?: string;
    limit?: number;
  } = {},
): AppointmentRow[] {
  const clauses = ['a.business_id = ?'];
  const params: SqlValue[] = [businessId];
  if (filter.fromIso) {
    clauses.push('a.start_at >= ?');
    params.push(filter.fromIso);
  }
  if (filter.toIso) {
    clauses.push('a.start_at <= ?');
    params.push(filter.toIso);
  }
  if (filter.status) {
    clauses.push('a.status = ?');
    params.push(filter.status);
  }
  if (filter.customerId) {
    clauses.push('a.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.staffId) {
    clauses.push('a.staff_id = ?');
    params.push(filter.staffId);
  }
  return all<AppointmentRow>(
    `${APPOINTMENT_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY a.start_at ASC LIMIT ?`,
    [...params, Math.min(Math.max(filter.limit ?? 100, 1), 500)],
  );
}

export function findAppointment(businessId: string, id: string): AppointmentRow | undefined {
  return get<AppointmentRow>(`${APPOINTMENT_SELECT} WHERE a.business_id = ? AND a.id = ?`, [businessId, id]);
}

export function createAppointment(
  businessId: string,
  input: {
    title: string;
    customerId?: string | null;
    staffId?: string | null;
    serviceId?: string | null;
    startAt: string;
    endAt: string;
    status?: string;
    priceCents?: number;
    location?: string | null;
    notes?: string | null;
    source?: string;
    createdById?: string | null;
  },
): string {
  const id = newId('apt');
  run(
    `INSERT INTO appointments (id, business_id, customer_id, staff_id, service_id, title, start_at, end_at, status,
        price_cents, location, notes, source, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.customerId ?? null,
      input.staffId ?? null,
      input.serviceId ?? null,
      input.title,
      input.startAt,
      input.endAt,
      input.status ?? 'PENDING',
      input.priceCents ?? 0,
      input.location ?? null,
      input.notes ?? null,
      input.source ?? 'DASHBOARD',
      input.createdById ?? null,
      nowIso(),
      nowIso(),
    ],
  );
  return id;
}

export function updateAppointment(
  businessId: string,
  id: string,
  patch: {
    title?: string;
    customerId?: string | null;
    staffId?: string | null;
    serviceId?: string | null;
    startAt?: string;
    endAt?: string;
    status?: string;
    priceCents?: number;
    location?: string | null;
    notes?: string | null;
    reminderSentAt?: string | null;
  },
): void {
  const columnMap: Record<string, string> = {
    title: 'title',
    customerId: 'customer_id',
    staffId: 'staff_id',
    serviceId: 'service_id',
    startAt: 'start_at',
    endAt: 'end_at',
    status: 'status',
    priceCents: 'price_cents',
    location: 'location',
    notes: 'notes',
    reminderSentAt: 'reminder_sent_at',
  };
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [key, column] of Object.entries(columnMap)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(value as SqlValue);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE appointments SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteAppointment(businessId: string, id: string): void {
  run('DELETE FROM appointments WHERE business_id = ? AND id = ?', [businessId, id]);
}

/** Slots already taken on a given day — the source of real availability. */
export function bookedSlots(businessId: string, dayIso: string, staffId?: string | null) {
  return all<{ start_at: string; end_at: string; staff_id: string | null }>(
    `SELECT start_at, end_at, staff_id FROM appointments
     WHERE business_id = ? AND date(start_at) = date(?)
       AND status NOT IN ('CANCELLED','NO_SHOW')
       ${staffId ? 'AND (staff_id = ? OR staff_id IS NULL)' : ''}
     ORDER BY start_at ASC`,
    staffId ? [businessId, dayIso, staffId] : [businessId, dayIso],
  );
}

export function appointmentSummary(businessId: string, sinceIso: string, untilIso: string) {
  const row = get<{ total: number; completed: number; cancelled: number; upcoming: number; revenue: number }>(
    `SELECT count(*) AS total,
            sum(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
            sum(CASE WHEN status IN ('CANCELLED','NO_SHOW') THEN 1 ELSE 0 END) AS cancelled,
            sum(CASE WHEN start_at > ? AND status IN ('PENDING','CONFIRMED') THEN 1 ELSE 0 END) AS upcoming,
            sum(CASE WHEN status = 'COMPLETED' THEN price_cents ELSE 0 END) AS revenue
     FROM appointments WHERE business_id = ? AND start_at BETWEEN ? AND ?`,
    [nowIso(), businessId, sinceIso, untilIso],
  );
  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
    revenue: Number(row?.revenue ?? 0),
  };
}

/** Upcoming appointment load per staff member. */
export function countAppointmentsByStaff(businessId: string) {
  return all<{ id: string; appointments: number }>(
    `SELECT st.id AS id, count(a.id) AS appointments
     FROM staff st
     LEFT JOIN appointments a ON a.staff_id = st.id AND a.start_at >= ? AND a.status NOT IN ('CANCELLED','NO_SHOW')
     WHERE st.business_id = ?
     GROUP BY st.id`,
    [nowIso(), businessId],
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskRowLocal = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  related_type: string | null;
  related_id: string | null;
  source: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function listTasks(
  businessId: string,
  filter: { status?: string; assignee?: string; search?: string; limit?: number } = {},
): TaskRowLocal[] {
  const clauses = ['t.business_id = ?'];
  const params: SqlValue[] = [businessId];
  if (filter.status) {
    clauses.push('t.status = ?');
    params.push(filter.status);
  }
  if (filter.assignee) {
    clauses.push('t.assignee_user_id = ?');
    params.push(filter.assignee);
  }
  if (filter.search) {
    clauses.push('(t.title LIKE ? OR coalesce(t.description, \'\') LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  return all<TaskRowLocal>(
    `SELECT t.*, u.name AS assignee_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY CASE t.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'TODO' THEN 1 ELSE 2 END,
              CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC
     LIMIT ?`,
    [...params, Math.min(Math.max(filter.limit ?? 200, 1), 500)],
  );
}

export function createTask(
  businessId: string,
  input: {
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
    dueAt?: string | null;
    assigneeUserId?: string | null;
    relatedType?: string | null;
    relatedId?: string | null;
    source?: string;
    createdById?: string | null;
  },
): string {
  const id = newId('task');
  run(
    `INSERT INTO tasks (id, business_id, title, description, status, priority, assignee_user_id, due_at,
        related_type, related_id, source, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.title,
      input.description ?? null,
      input.status ?? 'TODO',
      input.priority ?? 'MEDIUM',
      input.assigneeUserId ?? null,
      input.dueAt ?? null,
      input.relatedType ?? null,
      input.relatedId ?? null,
      input.source ?? 'MANUAL',
      input.createdById ?? null,
      nowIso(),
      nowIso(),
    ],
  );
  return id;
}

export function updateTask(
  businessId: string,
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    status?: string;
    priority?: string;
    dueAt?: string | null;
    assigneeUserId?: string | null;
    relatedType?: string | null;
    relatedId?: string | null;
    completedAt?: string | null;
  },
): void {
  const columnMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    status: 'status',
    priority: 'priority',
    dueAt: 'due_at',
    assigneeUserId: 'assignee_user_id',
    relatedType: 'related_type',
    relatedId: 'related_id',
    completedAt: 'completed_at',
  };
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [key, column] of Object.entries(columnMap)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(value as SqlValue);
  }
  if (patch.status === 'COMPLETED') {
    sets.push('completed_at = ?');
    params.push(patch.completedAt ?? nowIso());
  }
  if (patch.status && patch.status !== 'COMPLETED') {
    sets.push('completed_at = NULL');
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE tasks SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteTask(businessId: string, id: string): void {
  run('DELETE FROM tasks WHERE business_id = ? AND id = ?', [businessId, id]);
}

export function taskCounts(businessId: string) {
  return all<{ status: string; c: number }>(
    'SELECT status, count(*) AS c FROM tasks WHERE business_id = ? GROUP BY status',
    [businessId],
  );
}

export function overdueTaskCount(businessId: string): number {
  const row = get<{ c: number }>(
    `SELECT count(*) AS c FROM tasks
     WHERE business_id = ? AND status <> 'COMPLETED' AND due_at IS NOT NULL AND due_at < ?`,
    [businessId, nowIso()],
  );
  return Number(row?.c ?? 0);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationRow = {
  id: string;
  business_id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  level: string;
  entity_type: string | null;
  entity_id: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export function createNotification(input: {
  businessId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  level?: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): string {
  const id = newId('ntf');
  run(
    `INSERT INTO notifications (id, business_id, user_id, type, title, body, level, entity_type, entity_id, href, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      input.businessId,
      input.userId ?? null,
      input.type,
      input.title,
      input.body ?? null,
      input.level ?? 'INFO',
      input.entityType ?? null,
      input.entityId ?? null,
      input.href ?? null,
      nowIso(),
    ],
  );
  return id;
}

export function listNotifications(businessId: string, userId: string, limit = 40): NotificationRow[] {
  return all<NotificationRow>(
    `SELECT * FROM notifications
     WHERE business_id = ? AND (user_id IS NULL OR user_id = ?)
     ORDER BY created_at DESC LIMIT ?`,
    [businessId, userId, Math.min(Math.max(limit, 1), 100)],
  );
}

export function unreadNotificationCount(businessId: string, userId: string): number {
  const row = get<{ c: number }>(
    `SELECT count(*) AS c FROM notifications
     WHERE business_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL`,
    [businessId, userId],
  );
  return Number(row?.c ?? 0);
}

export function markNotificationRead(businessId: string, userId: string, id: string): void {
  run(
    `UPDATE notifications SET read_at = ? WHERE business_id = ? AND id = ? AND (user_id IS NULL OR user_id = ?)`,
    [nowIso(), businessId, id, userId],
  );
}

export function markAllNotificationsRead(businessId: string, userId: string): void {
  run(
    `UPDATE notifications SET read_at = ? WHERE business_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL`,
    [nowIso(), businessId, userId],
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportRowFull = {
  id: string;
  business_id: string;
  period: string;
  period_start: string;
  period_end: string;
  title: string;
  metrics: unknown;
  metrics_json: string | null;
  ai_summary: string | null;
  summary: string | null;
  summary_source: string | null;
  generated_by_id: string | null;
  created_at: string;
};

function mapReport(row: Record<string, SqlValue>): ReportRowFull {
  const metricsJson = (row.metrics_json as string | null) ?? null;
  let metrics: unknown = null;
  if (metricsJson) {
    try {
      metrics = JSON.parse(metricsJson);
    } catch {
      metrics = null;
    }
  }
  return {
    ...(row as unknown as ReportRowFull),
    metrics,
    metrics_json: metricsJson,
    ai_summary: (row.ai_summary as string | null) ?? null,
    summary: (row.ai_summary as string | null) ?? null,
    summary_source: (row.summary_source as string | null) ?? 'CALCULATED',
  };
}

export function createReport(input: {
  businessId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  metrics: unknown;
  aiSummary?: string | null;
  summarySource?: string;
  createdById?: string | null;
}): string {
  const id = newId('rpt');
  run(
    `INSERT INTO reports (id, business_id, period, period_start, period_end, title, metrics_json, ai_summary,
        summary_source, generated_by_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.businessId,
      input.period,
      input.periodStart,
      input.periodEnd,
      input.title,
      toJson(input.metrics),
      input.aiSummary ?? null,
      input.summarySource ?? (input.aiSummary ? 'AI' : 'CALCULATED'),
      input.createdById ?? null,
      nowIso(),
    ],
  );
  return id;
}

export function listReports(businessId: string, limit = 30): ReportRowFull[] {
  return all<Record<string, SqlValue>>(
    'SELECT * FROM reports WHERE business_id = ? ORDER BY created_at DESC LIMIT ?',
    [businessId, Math.min(Math.max(limit, 1), 200)],
  ).map(mapReport);
}

export function findReport(businessId: string, id: string): ReportRowFull | undefined {
  const row = get<Record<string, SqlValue>>('SELECT * FROM reports WHERE business_id = ? AND id = ?', [businessId, id]);
  return row ? mapReport(row) : undefined;
}

/**
 * Appointments that are due a reminder: still open (pending or confirmed), starting
 * inside the requested window, not reminded yet, and linked to a customer we can email.
 * Uses idx_appointments_business(business_id, start_at).
 */
export function appointmentsNeedingReminder(
  businessId: string,
  window: { fromIso: string; toIso: string; limit?: number },
): AppointmentRow[] {
  return all<AppointmentRow>(
    `${APPOINTMENT_SELECT}
     WHERE a.business_id = ?
       AND a.status IN ('PENDING', 'CONFIRMED')
       AND a.reminder_sent_at IS NULL
       AND a.start_at >= ? AND a.start_at <= ?
       AND c.email IS NOT NULL AND TRIM(c.email) <> ''
     ORDER BY a.start_at ASC
     LIMIT ?`,
    [businessId, window.fromIso, window.toIso, Math.min(Math.max(window.limit ?? 200, 1), 500)],
  );
}

/** Marks appointment reminders as sent so the reminder job never double-sends. */
export function markReminderSent(businessId: string, appointmentId: string): void {
  tx(() => {
    updateAppointment(businessId, appointmentId, { reminderSentAt: nowIso() });
  });
}

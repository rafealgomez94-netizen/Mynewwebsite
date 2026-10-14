import { createNotification } from '@/lib/db/repositories/ops';
import { recordAudit } from '@/lib/db/repositories/accounts';

export async function notify(input: {
  businessId: string;
  type: string;
  title: string;
  body?: string;
  level?: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  href?: string;
  entityType?: string;
  entityId?: string;
  userId?: string | null;
}) {
  createNotification({
    businessId: input.businessId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    level: input.level ?? 'INFO',
    href: input.href ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    userId: input.userId ?? null,
  });
}

export function audit(input: {
  businessId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  meta?: unknown;
}) {
  recordAudit({
    businessId: input.businessId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    meta: input.meta,
  });
}

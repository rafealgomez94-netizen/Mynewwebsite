import { all } from '@/lib/db';
import {
  markDeadlineAlerted,
  tasksNeedingDeadlineAlert,
  type TaskRowLocal,
} from '@/lib/db/repositories/ops';
import type { BusinessRow } from '@/lib/db/repositories/accounts';
import { notify } from '@/lib/services/notify';

/**
 * Task deadline alerts.
 *
 * The notification list has always advertised a `TASK_DUE` type but nothing ever
 * created one, so a deadline could pass without anyone being told. This service
 * announces open tasks whose deadline has arrived or is about to (default: the next
 * 24 hours), once each: `tasks.deadline_alerted_at` is stamped on the way out, so the
 * cron route, the dashboard button and any impatient owner pressing it three times
 * produce exactly one notification per deadline.
 *
 * Moving a deadline clears the stamp (see `PATCH /api/tasks`), so the new date is
 * announced in turn.
 */
export const DEFAULT_LEAD_HOURS = 24;

export type DeadlineAlert = {
  taskId: string;
  businessId: string;
  title: string;
  dueAt: string;
  overdue: boolean;
  assignee: string | null;
  priority: string;
};

export type DeadlineRunResult = {
  ranAt: string;
  businessesChecked: number;
  due: number;
  alerted: number;
  overdue: number;
  alerts: DeadlineAlert[];
};

export async function runTaskDeadlineAlerts(
  options: { businessId?: string; now?: Date; leadHours?: number; limit?: number; dryRun?: boolean } = {},
): Promise<DeadlineRunResult> {
  const now = options.now ?? new Date();
  const leadHours = options.leadHours ?? DEFAULT_LEAD_HOURS;
  const dueBefore = new Date(now.getTime() + leadHours * 3600 * 1000).toISOString();
  const businesses = all<BusinessRow>(
    options.businessId
      ? 'SELECT * FROM businesses WHERE id = ?'
      : 'SELECT * FROM businesses ORDER BY created_at ASC',
    options.businessId ? [options.businessId] : [],
  );

  const result: DeadlineRunResult = {
    ranAt: now.toISOString(),
    businessesChecked: businesses.length,
    due: 0,
    alerted: 0,
    overdue: 0,
    alerts: [],
  };

  for (const business of businesses) {
    const tasks = tasksNeedingDeadlineAlert(business.id, { dueBeforeIso: dueBefore, limit: options.limit ?? 200 });
    result.due += tasks.length;
    // A dry run reports what would go out (dashboard preview, tests) without writing.
    if (options.dryRun) continue;

    for (const task of tasks) {
      const overdue = new Date(task.due_at ?? '').getTime() < now.getTime();
      await announce({ business, task, overdue, now });
      result.alerted += 1;
      if (overdue) result.overdue += 1;
      result.alerts.push({
        taskId: task.id,
        businessId: business.id,
        title: task.title,
        dueAt: task.due_at ?? '',
        overdue,
        assignee: task.assignee_name,
        priority: task.priority,
      });
    }
  }

  return result;
}

async function announce(input: {
  business: BusinessRow;
  task: TaskRowLocal;
  overdue: boolean;
  now: Date;
}): Promise<void> {
  const { business, task, overdue } = input;
  const dueAt = task.due_at ?? '';
  const dueLabel = dueAt.slice(0, 16).replace('T', ' ');
  await notify({
    businessId: business.id,
    type: 'TASK_DUE',
    title: overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
    body: overdue
      ? `The deadline was ${dueLabel} UTC${task.assignee_name ? ` — assigned to ${task.assignee_name}` : ''}.`
      : `Due ${dueLabel} UTC${task.assignee_name ? ` — assigned to ${task.assignee_name}` : ''}.`,
    level: overdue ? 'CRITICAL' : 'WARNING',
    href: '/dashboard/tasks',
    entityType: 'task',
    entityId: task.id,
  });
  markDeadlineAlerted(business.id, task.id);
}

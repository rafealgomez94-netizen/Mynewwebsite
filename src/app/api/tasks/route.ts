import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { taskSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import {
  clearDeadlineAlert,
  createTask,
  deleteTask,
  findTask,
  listTasks,
  taskCounts,
  updateTask,
  overdueTaskCount,
} from '@/lib/db/repositories/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'tasks:read');
    const url = new URL(request.url);
    return ok({
      tasks: listTasks(ctx.business.id, {
        status: url.searchParams.get('status') ?? undefined,
        assignee: url.searchParams.get('assignee') ?? undefined,
        search: url.searchParams.get('search') ?? undefined,
      }),
      counts: taskCounts(ctx.business.id),
      overdue: overdueTaskCount(ctx.business.id),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'tasks:write');
    const input = await parseBody(request, taskSchema);
    const id = createTask(ctx.business.id, {
      title: input.title,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      assigneeUserId: input.assigneeUserId || null,
      dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
      createdById: ctx.userId,
    });
    return ok({ id }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'tasks:write');
    const input = await parseBody(request, z.object({ id: z.string().min(3) }).and(taskSchema.partial()));
    const existing = findTask(ctx.business.id, input.id);
    if (!existing) throw new HttpError(404, 'Task not found.', 'not_found', { id: input.id });

    const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : undefined;
    updateTask(ctx.business.id, input.id, {
      title: input.title,
      description: input.description ?? undefined,
      status: input.status,
      priority: input.priority,
      // An omitted assignee keeps whoever owns the task; an empty string unassigns it.
      assigneeUserId: input.assigneeUserId === undefined ? undefined : input.assigneeUserId || null,
      dueAt,
    });
    // A new deadline is a new deadline: let the alert job announce it again.
    if (dueAt && dueAt !== existing.due_at) clearDeadlineAlert(ctx.business.id, input.id);
    // Reopening a finished task makes its deadline relevant again too.
    if (input.status && input.status !== 'COMPLETED' && existing.status === 'COMPLETED') {
      clearDeadlineAlert(ctx.business.id, input.id);
    }
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'tasks:write');
    const { id } = await parseBody(request, z.object({ id: z.string().min(3) }));
    deleteTask(ctx.business.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

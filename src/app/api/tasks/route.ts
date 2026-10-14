import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { taskSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { createTask, deleteTask, listTasks, taskCounts, updateTask, overdueTaskCount } from '@/lib/db/repositories/ops';

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
    updateTask(ctx.business.id, input.id, {
      title: input.title,
      description: input.description ?? undefined,
      status: input.status,
      priority: input.priority,
      assigneeUserId: input.assigneeUserId || null,
      dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : undefined,
    });
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

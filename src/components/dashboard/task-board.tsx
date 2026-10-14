'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Modal, Select, StatusBadge, Textarea, apiRequest, useToast } from '@/components/ui';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/domain';
import { formatDate } from '@/lib/utils';

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  source: string;
};

export function TaskBoard({
  initial,
  members,
  suggestions,
}: {
  initial: TaskItem[];
  members: { userId: string; name: string }[];
  suggestions: { title: string; detail: string }[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tasks, setTasks] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeUserId: '',
    dueAt: '',
  });

  const reload = async () => {
    const result = await apiRequest<{ tasks: TaskItem[] }>('/api/tasks', { method: 'GET' });
    if (result.ok) setTasks(result.data.tasks ?? []);
    router.refresh();
  };

  const create = async (payload: typeof form) => {
    setBusy(true);
    const result = await apiRequest('/api/tasks', { body: payload });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return false;
    }
    push('Task created', 'success');
    await reload();
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await create(form)) {
      setOpen(false);
      setForm({ title: '', description: '', status: 'TODO', priority: 'MEDIUM', assigneeUserId: '', dueAt: '' });
    }
  };

  const update = async (task: TaskItem, patch: Record<string, unknown>) => {
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, ...patch } as TaskItem : item)));
    const result = await apiRequest('/api/tasks', { method: 'PATCH', body: { id: task.id, ...patch } });
    if (!result.ok) {
      push(result.error, 'danger');
      await reload();
      return;
    }
    await reload();
  };

  const remove = async (task: TaskItem) => {
    const result = await apiRequest('/api/tasks', { method: 'DELETE', body: { id: task.id } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Task deleted', 'success');
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TASK_STATUSES.map((status) => (
            <Badge key={status} tone={status === 'COMPLETED' ? 'success' : 'neutral'}>
              {status.replace('_', ' ').toLowerCase()} {tasks.filter((task) => task.status === status).length}
            </Badge>
          ))}
        </div>
        <Button onClick={() => setOpen(true)}>+ New task</Button>
      </div>

      {suggestions.length ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">AI suggested tasks</p>
              <p className="muted text-xs">Generated from your current business activity — add the ones you want to track.</p>
            </div>
            <Badge tone="brand">AI recommendation</Badge>
          </div>
          <ul className="mt-4 space-y-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{suggestion.title}</p>
                  <p className="muted text-xs">{suggestion.detail}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() =>
                    create({
                      title: suggestion.title,
                      description: suggestion.detail,
                      status: 'TODO',
                      priority: 'MEDIUM',
                      assigneeUserId: '',
                      dueAt: '',
                    })
                  }
                >
                  Add to my tasks
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <div key={status} className="space-y-3">
            <h3 className="text-sm font-semibold">{status.replace('_', ' ').toLowerCase()}</h3>
            {tasks.filter((task) => task.status === status).length === 0 ? (
              <p className="muted rounded-xl border border-dashed p-3 text-xs">Nothing here.</p>
            ) : (
              tasks
                .filter((task) => task.status === status)
                .map((task) => (
                  <Card key={task.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{task.title}</p>
                      <StatusBadge status={task.priority} />
                    </div>
                    {task.description ? <p className="muted text-xs">{task.description}</p> : null}
                    <p className="muted text-xs">
                      {task.assignee_name ?? 'Unassigned'}
                      {task.due_at ? ` · due ${formatDate(task.due_at)}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={task.status}
                        onChange={(event) => update(task, { status: event.target.value })}
                        aria-label={`Update status for ${task.title}`}
                        className="w-auto text-xs"
                      >
                        {TASK_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {option.replace('_', ' ').toLowerCase()}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={task.assignee_user_id ?? ''}
                        onChange={(event) => update(task, { assigneeUserId: event.target.value })}
                        aria-label={`Assign ${task.title}`}
                        className="w-auto text-xs"
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name}
                          </option>
                        ))}
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => remove(task)}>
                        Delete
                      </Button>
                    </div>
                    {task.source === 'AI_RECOMMENDATION' ? <Badge tone="brand">AI suggestion</Badge> : null}
                  </Card>
                ))
            )}
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Create task
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
          </Field>
          <Field label="Assign to">
            <Select value={form.assigneeUserId} onChange={(event) => setForm({ ...form, assigneeUserId: event.target.value })}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}

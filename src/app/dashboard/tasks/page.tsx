import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { listTasks, overdueTaskCount } from '@/lib/db/repositories/ops';
import { listMembers } from '@/lib/db/repositories/accounts';
import { buildFactPack } from '@/lib/ai/facts';
import { TaskBoard } from '@/components/dashboard/task-board';
import { PageHeader } from '@/components/dashboard/shared';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

function suggestedTasks(businessId: string) {
  const facts = buildFactPack(businessId);
  const suggestions: { title: string; detail: string }[] = [];
  if (facts.inventory.lowStock.length) {
    suggestions.push({
      title: `Reorder ${facts.inventory.lowStock[0].name}`,
      detail: `${facts.inventory.lowStock[0].quantity} left against a minimum of ${facts.inventory.lowStock[0].minStock}. Supplier: ${
        facts.inventory.lowStock[0].supplier ?? 'not recorded'
      }.`,
    });
  }
  if (facts.customers.followUp.length) {
    suggestions.push({
      title: `Follow up ${facts.customers.followUp[0].name}`,
      detail: 'No interaction for more than 30 days — a short WhatsApp message usually re-activates them.',
    });
  }
  if (facts.leads.staleFollowUps.length) {
    suggestions.push({
      title: `Chase lead ${facts.leads.staleFollowUps[0].name}`,
      detail: `Currently in ${facts.leads.staleFollowUps[0].stage}. Same-day follow-ups convert fastest.`,
    });
  }
  if (facts.appointments.cancelledLast7Days > 0) {
    suggestions.push({
      title: 'Review appointment reminders',
      detail: `${facts.appointments.cancelledLast7Days} cancellation(s) or no-show(s) in the last 7 days.`,
    });
  }
  if (!facts.knowledge.sources) {
    suggestions.push({
      title: 'Upload your price list to train the AI',
      detail: 'Without uploaded documents the assistant escalates more questions to your team.',
    });
  }
  return suggestions;
}

export default async function TasksPage() {
  const ctx = requireTenant(await getSessionContext());
  const tasks = listTasks(ctx.business.id, { limit: 200 });
  const members = listMembers(ctx.business.id).map((member) => ({ userId: member.user_id, name: member.name }));
  const overdue = overdueTaskCount(ctx.business.id);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Deadlines, priorities and assignments for your team — with AI suggestions drawn from what is actually happening in the business."
        meta={
          <>
            <Badge tone="info">{tasks.length} tasks</Badge>
            <Badge tone={overdue > 0 ? 'danger' : 'success'}>{overdue} overdue</Badge>
          </>
        }
      />
      <TaskBoard
        initial={tasks.map((task) => ({ ...task }))}
        members={members}
        suggestions={suggestedTasks(ctx.business.id)}
      />
    </div>
  );
}

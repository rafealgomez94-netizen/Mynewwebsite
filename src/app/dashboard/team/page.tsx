import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { requireTenant } from '@/lib/auth/rbac';
import { countMembers, listAuditLogs, listMembers, listStaff } from '@/lib/db/repositories/accounts';
import { countAppointmentsByStaff } from '@/lib/db/repositories/ops';
import { planForBusiness } from '@/lib/db/repositories/platform';
import { TeamWorkspace } from '@/components/dashboard/team-workspace';
import { PageHeader } from '@/components/dashboard/shared';

export const metadata: Metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const ctx = requireTenant(await getSessionContext());
  const { plan } = planForBusiness(ctx.business.id);
  const canManage = ctx.role === 'OWNER' || ctx.role === 'ADMIN';

  return (
    <div>
      <PageHeader
        title="Team & people"
        description="Users, roles and permissions enforced on every API call, plus the staff records that customers can book."
      />
      <TeamWorkspace
        initialMembers={listMembers(ctx.business.id).map((member) => ({
          userId: member.user_id,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          title: member.title,
          joined_at: member.joined_at ?? '',
          last_login_at: member.last_login_at,
        }))}
        initialStaff={listStaff(ctx.business.id).map((member) => ({
          id: member.id,
          name: member.name,
          title: member.title,
          email: member.email,
          phone: member.phone,
          specialties: member.specialties
            ? (() => {
                try {
                  const parsed = JSON.parse(member.specialties);
                  return Array.isArray(parsed) ? (parsed as string[]) : [member.specialties];
                } catch {
                  return member.specialties.split(',').map((item) => item.trim()).filter(Boolean);
                }
              })()
            : null,
          active: member.active,
        }))}
        auditLogs={canManage
          ? listAuditLogs(ctx.business.id, 40).map((entry) => ({
              id: entry.id,
              action: entry.action,
              actor_email: entry.actor_email,
              entity_type: entry.entity_type,
              created_at: entry.created_at,
            }))
          : []}
        limits={{ users: plan.limits.users, used: countMembers(ctx.business.id), plan: plan.name }}
        canManage={canManage}
        currentUserId={ctx.userId}
        staffLoad={countAppointmentsByStaff(ctx.business.id)}
      />
    </div>
  );
}

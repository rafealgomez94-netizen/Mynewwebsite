import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { memberInviteSchema, memberUpdateSchema } from '@/lib/validation';
import { getSessionContext, issueAuthToken } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import {
  addMember,
  countMembers,
  createUser,
  findMembership,
  findUserByEmail,
  listMembers,
  removeMember,
  updateMember,
} from '@/lib/db/repositories/accounts';
import { listAuditLogs } from '@/lib/db/repositories/accounts';
import { planForBusiness } from '@/lib/db/repositories/platform';
import { sendMemberInviteEmail } from '@/lib/mailer';
import { audit } from '@/lib/services/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'members:read');
    const { plan } = planForBusiness(ctx.business.id);
    return ok({
      members: listMembers(ctx.business.id),
      limits: { users: plan.limits.users, used: countMembers(ctx.business.id), plan: plan.name },
      auditLogs: ctx.role === 'OWNER' || ctx.role === 'ADMIN' ? listAuditLogs(ctx.business.id, 40) : [],
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'members:manage');
    const input = await parseBody(request, memberInviteSchema);

    const { plan } = planForBusiness(ctx.business.id);
    if (countMembers(ctx.business.id) >= plan.limits.users) {
      throw new HttpError(402, `Your ${plan.name} plan includes ${plan.limits.users} team members.`, 'plan_limit');
    }

    const existingUser = findUserByEmail(input.email);
    let userId: string;
    let invitationToken: string | null = null;

    if (existingUser) {
      if (findMembership(ctx.business.id, existingUser.id)) {
        throw new HttpError(409, 'That person is already a member of this workspace.', 'already_member');
      }
      userId = existingUser.id;
    } else {
      // Invitees get a pending account; they set their password via the invite link.
      const { hashPassword, createOpaqueToken } = await import('@/lib/auth/password');
      const randomPassword = await hashPassword(`${createOpaqueToken(24)}Aa1`);
      const created = createUser({
        email: input.email,
        passwordHash: randomPassword,
        name: input.name || input.email.split('@')[0],
        jobTitle: input.title || null,
      });
      userId = created.id;
    }

    addMember({
      businessId: ctx.business.id,
      userId,
      role: input.role,
      status: existingUser ? 'ACTIVE' : 'INVITED',
      title: input.title || null,
      invitedById: ctx.userId,
    });

    if (!existingUser) {
      invitationToken = await issueAuthToken({ id: userId, email: input.email }, 'INVITE');
      const origin = new URL(request.url).origin;
      await sendMemberInviteEmail(
        input.email,
        ctx.business.name,
        ctx.session.user.name,
        `${origin}/accept-invite?token=${invitationToken}`,
      );
    }

    audit({
      businessId: ctx.business.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.session.user.email,
      action: 'member.invited',
      entityType: 'member',
      entityId: userId,
      meta: { role: input.role, email: input.email },
    });

    return ok({
      members: listMembers(ctx.business.id),
      invitationToken: process.env.NODE_ENV === 'production' ? undefined : invitationToken,
    }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'members:manage');
    const input = await parseBody(request, z.object({ userId: z.string().min(3) }).and(memberUpdateSchema));

    const membership = findMembership(ctx.business.id, input.userId);
    if (!membership) throw new HttpError(404, 'Member not found.', 'not_found');
    if (membership.role === 'OWNER') throw new HttpError(403, 'The owner role cannot be changed here.', 'forbidden');

    updateMember(ctx.business.id, input.userId, {
      role: input.role,
      status: input.status,
      title: input.title ?? undefined,
    });
    audit({
      businessId: ctx.business.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.session.user.email,
      action: 'member.updated',
      entityType: 'member',
      entityId: input.userId,
      meta: { role: input.role, status: input.status },
    });
    return ok({ members: listMembers(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'members:manage');
    const { userId } = await parseBody(request, z.object({ userId: z.string().min(3) }));
    const membership = findMembership(ctx.business.id, userId);
    if (!membership) throw new HttpError(404, 'Member not found.', 'not_found');
    if (membership.role === 'OWNER') throw new HttpError(403, 'The workspace owner cannot be removed.', 'forbidden');
    removeMember(ctx.business.id, userId);
    audit({
      businessId: ctx.business.id,
      actorUserId: ctx.userId,
      actorEmail: ctx.session.user.email,
      action: 'member.removed',
      entityType: 'member',
      entityId: userId,
    });
    return ok({ members: listMembers(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

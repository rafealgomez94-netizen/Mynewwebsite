import { assertRateLimit, fail, handleError, ok, parseBody } from '@/lib/api/http';
import { acceptInviteSchema } from '@/lib/validation';
import { consumeAuthTokenFor, peekAuthToken, startSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import {
  countMembers,
  findUserById,
  listPendingInvitations,
  updateMember,
  updateUser,
} from '@/lib/db/repositories/accounts';
import { audit } from '@/lib/services/notify';
import { incrementUsage, planForBusiness } from '@/lib/db/repositories/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Invitation acceptance. The invitee is not signed in yet, so this route is the
 * one authenticated-by-token entry point into a tenant:
 *
 *   GET  /api/auth/accept-invite?token=…  → describe the invitation (no mutation)
 *   POST /api/auth/accept-invite          → set a password, activate the account
 *                                            and the membership, then sign in
 */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    if (token.length < 10) return fail(400, 'This invitation link is incomplete.', 'invalid_token');

    const peek = await peekAuthToken(token, 'INVITE');
    if (!peek.ok || !peek.userId) {
      return fail(400, peek.reason ?? 'This invitation link is not valid.', 'invalid_token');
    }

    const invitations = listPendingInvitations(peek.userId);
    if (!invitations.length) {
      return fail(409, 'This invitation has already been accepted.', 'already_accepted');
    }

    return ok({
      invite: {
        email: peek.email ?? '',
        name: findUserById(peek.userId)?.name ?? '',
        workspaces: invitations.map((invitation) => ({
          business: invitation.business_name,
          slug: invitation.business_slug,
          role: invitation.role,
        })),
        primary: {
          business: invitations[0].business_name,
          slug: invitations[0].business_slug,
          role: invitations[0].role,
        },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'accept-invite', 10, 15 * 60 * 1000);
    const input = await parseBody(request, acceptInviteSchema);

    // Seat check before the token is consumed: activating a membership must not exceed the
    // workspace's plan. Refusing after consumption would burn the invite link, so peek first —
    // the invitation stays usable and the invitee can accept once a seat is free again.
    const peek = await peekAuthToken(input.token, 'INVITE');
    if (peek.ok && peek.userId) {
      for (const invitation of listPendingInvitations(peek.userId)) {
        const { plan } = planForBusiness(invitation.business_id);
        if (countMembers(invitation.business_id) >= plan.limits.users) {
          return fail(
            402,
            `${invitation.business_name} has no free seat on its ${plan.name} plan (${plan.limits.users} included). ` +
              'Ask the workspace owner to free a seat or upgrade, then use the same invitation link.',
            'plan_limit',
          );
        }
      }
    }

    const result = await consumeAuthTokenFor(input.token, 'INVITE');
    if (!result.ok || !result.userId) {
      return fail(400, result.reason ?? 'This invitation link is not valid.', 'invalid_token');
    }

    const user = findUserById(result.userId);
    if (!user) return fail(404, 'The invited account no longer exists.', 'not_found');

    // Setting a password through an emailed, single-use link also proves control
    // of the address, so the account is activated and marked verified.
    updateUser(user.id, {
      passwordHash: await hashPassword(input.password),
      status: 'ACTIVE',
      emailVerifiedAt: user.email_verified_at ?? new Date().toISOString(),
      ...(input.name ? { name: input.name } : {}),
    });

    const invitations = listPendingInvitations(user.id);
    for (const invitation of invitations) {
      updateMember(invitation.business_id, user.id, { status: 'ACTIVE' });
    }

    const businessId = invitations[0]?.business_id ?? null;
    await startSession(user.id, businessId);

    audit({
      businessId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'member.invitation_accepted',
      entityType: 'member',
      entityId: user.id,
      meta: { workspaces: invitations.map((invitation) => invitation.business_name) },
    });
    if (businessId) incrementUsage(businessId, 'USERS', 1, { source: 'invitation' });

    return ok({
      accepted: true,
      user: { id: user.id, email: user.email, name: input.name ?? user.name },
      workspaces: invitations.map((invitation) => ({
        business: invitation.business_name,
        slug: invitation.business_slug,
        role: invitation.role,
      })),
      next: '/dashboard',
    });
  } catch (error) {
    return handleError(error);
  }
}

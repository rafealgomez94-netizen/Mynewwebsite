import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { ticketSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, requireTenant } from '@/lib/auth/rbac';
import { countTickets, createTicket, listTickets, updateTicket } from '@/lib/db/repositories/comms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:read');
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    return ok({
      tickets: listTickets(ctx.business.id, { status }),
      counts: {
        open: countTickets(ctx.business.id, 'OPEN'),
        inProgress: countTickets(ctx.business.id, 'IN_PROGRESS'),
        resolved: countTickets(ctx.business.id, 'RESOLVED'),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:write');
    const input = await parseBody(request, ticketSchema);
    const id = createTicket(ctx.business.id, {
      subject: input.subject,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      contactName: input.contactName || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
      conversationId: input.conversationId || null,
      customerId: input.customerId || null,
    });
    return ok({ id }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'conversations:write');
    const input = await parseBody(
      request,
      z.object({
        id: z.string().min(3),
        status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
        assignedToId: z.string().optional(),
      }),
    );
    updateTicket(ctx.business.id, input.id, {
      status: input.status,
      priority: input.priority,
      assignedToId: input.assignedToId || undefined,
    });
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

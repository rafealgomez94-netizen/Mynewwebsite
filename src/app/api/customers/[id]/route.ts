import { handleError, ok, parseBody } from '@/lib/api/http';
import { customerSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import { deleteCustomer, findCustomer, updateCustomer } from '@/lib/db/repositories/crm';
import { all } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function loadContext(paramsPromise: Params['params']) {
  const { id } = await paramsPromise;
  const ctx = requireTenant(await getSessionContext());
  const customer = findCustomer(ctx.business.id, id);
  if (!customer) throw new HttpError(404, 'Customer not found in this workspace.', 'not_found');
  return { ctx, customer };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { ctx, customer } = await loadContext(params);
    assertPermission(ctx, 'customers:read');

    const orders = all<{
      id: string;
      order_number: string;
      total_cents: number;
      status: string;
      placed_at: string;
      item_count: number;
    }>(
      `SELECT o.id, o.order_number, o.total_cents, o.status, o.placed_at,
              (SELECT coalesce(sum(quantity),0) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM orders o WHERE o.business_id = ? AND o.customer_id = ? ORDER BY o.placed_at DESC LIMIT 20`,
      [ctx.business.id, customer.id],
    );

    const appointments = all<{
      id: string;
      title: string;
      start_at: string;
      status: string;
      price_cents: number;
      staff_name: string | null;
    }>(
      `SELECT a.id, a.title, a.start_at, a.status, a.price_cents, s.name AS staff_name
       FROM appointments a LEFT JOIN staff s ON s.id = a.staff_id
       WHERE a.business_id = ? AND a.customer_id = ? ORDER BY a.start_at DESC LIMIT 20`,
      [ctx.business.id, customer.id],
    );

    const conversations = all<{
      id: string;
      channel: string;
      status: string;
      last_message_at: string;
      preview: string | null;
    }>(
      `SELECT v.id, v.channel, v.status, v.last_message_at,
              (SELECT body FROM messages m WHERE m.conversation_id = v.id ORDER BY m.created_at DESC LIMIT 1) AS preview
       FROM conversations v WHERE v.business_id = ? AND v.customer_id = ? ORDER BY v.last_message_at DESC LIMIT 10`,
      [ctx.business.id, customer.id],
    );

    const documents = all<{ id: string; type: string; number: string; title: string; total_cents: number; status: string; created_at: string }>(
      `SELECT id, type, number, title, total_cents, status, created_at FROM documents
       WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 10`,
      [ctx.business.id, customer.id],
    );

    return ok({ customer, history: { orders, appointments, conversations, documents } });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { ctx, customer } = await loadContext(params);
    assertPermission(ctx, 'customers:write');
    const input = await parseBody(request, customerSchema.partial());
    const updated = updateCustomer(ctx.business.id, customer.id, {
      name: input.name,
      phone: input.phone ?? undefined,
      email: input.email ?? undefined,
      address: input.address ?? undefined,
      birthday: input.birthday ?? undefined,
      status: input.status,
      source: input.source ?? undefined,
      tags: input.tags,
      notes: input.notes ?? undefined,
    });
    return ok({ customer: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { ctx, customer } = await loadContext(params);
    assertPermission(ctx, 'customers:write');
    deleteCustomer(ctx.business.id, customer.id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

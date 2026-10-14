import { z } from 'zod';
import { handleError, ok, parseBody } from '@/lib/api/http';
import { campaignPlanSchema, marketingGenerateSchema, marketingPostUpdateSchema } from '@/lib/validation';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import {
  deletePost,
  findPost,
  listCampaigns,
  listPosts,
  marketingCounts,
  updateCampaign,
  updatePost,
} from '@/lib/db/repositories/content';
import { generateCampaignPlan, generateMarketingPosts } from '@/lib/ai/generators';
import { incrementUsage, planForBusiness, usageCount } from '@/lib/db/repositories/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'marketing:read');
    const url = new URL(request.url);
    return ok({
      campaigns: listCampaigns(ctx.business.id),
      posts: listPosts(ctx.business.id, {
        status: url.searchParams.get('status') ?? undefined,
        channel: url.searchParams.get('channel') ?? undefined,
        campaignId: url.searchParams.get('campaignId') ?? undefined,
      }),
      counts: marketingCounts(ctx.business.id),
    });
  } catch (error) {
    return handleError(error);
  }
}

/** Generate → Edit → Approve → Publish. Nothing is published automatically. */
export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'marketing:write');
    const body = await request.json();
    const mode = z.enum(['posts', 'calendar']).parse(body.mode ?? 'posts');

    const { plan } = planForBusiness(ctx.business.id);
    if (usageCount(ctx.business.id, 'AI_MESSAGES') >= plan.limits.aiMessages) {
      throw new HttpError(402, `AI generation limit reached for the ${plan.name} plan this month.`, 'plan_limit');
    }

    if (mode === 'calendar') {
      const input = campaignPlanSchema.parse(body.data ?? body);
      const plan_OUT = await generateCampaignPlan({
        businessId: ctx.business.id,
        userId: ctx.userId,
        objective: input.objective,
        audience: input.audience,
        durationDays: input.durationDays,
        channels: input.channels,
      });
      incrementUsage(ctx.business.id, 'AI_MESSAGES', 1, { surface: 'MARKETING_CALENDAR' });
      return ok({
        campaignId: plan_OUT.campaignId,
        plan: plan_OUT.plan,
        campaigns: listCampaigns(ctx.business.id),
        posts: listPosts(ctx.business.id, {}),
      }, { status: 201 });
    }

    const input = marketingGenerateSchema.parse(body.data ?? body);
    const generated = await generateMarketingPosts({
      businessId: ctx.business.id,
      userId: ctx.userId,
      channel: input.channel,
      goal: input.goal,
      audience: input.audience,
      offer: input.offer,
      tone: input.tone,
      campaignName: input.campaignName,
      variants: input.variants,
      scheduleStart: input.scheduleStart,
    });
    incrementUsage(ctx.business.id, 'AI_MESSAGES', 1, { surface: 'MARKETING' });

    return ok({
      campaignId: generated.campaignId,
      posts: listPosts(ctx.business.id, { campaignId: generated.campaignId }),
      campaigns: listCampaigns(ctx.business.id),
      provider: generated.provider,
      usage: { used: usageCount(ctx.business.id, 'AI_MESSAGES'), limit: plan.limits.aiMessages },
    }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'marketing:write');
    const input = await parseBody(
      request,
      z
        .object({
          id: z.string().min(3),
          action: z.enum(['update', 'approve', 'schedule', 'publish', 'reject']).default('update'),
          scheduledAt: z.string().optional(),
        })
        .and(marketingPostUpdateSchema.partial()),
    );

    const post = findPost(ctx.business.id, input.id);
    if (!post) throw new HttpError(404, 'Post not found.', 'not_found');

    const statusByAction: Record<string, string> = {
      approve: 'APPROVED',
      schedule: 'SCHEDULED',
      publish: 'PUBLISHED',
      reject: 'DRAFT',
    };
    const nextStatus = statusByAction[input.action] ?? input.status;

    // Publish requires an approved post — enforcing the explicit approval step.
    if (input.action === 'publish' && !['APPROVED', 'SCHEDULED'].includes(post.status)) {
      throw new HttpError(409, 'Approve this post before publishing it.', 'approval_required');
    }

    updatePost(ctx.business.id, input.id, {
      title: input.title,
      body: input.body,
      hashtags: input.hashtags,
      status: nextStatus,
      scheduledAt: input.scheduledAt || input.scheduledAt,
      approvedById: input.action === 'approve' ? ctx.userId : undefined,
      publishedAt: input.action === 'publish' ? new Date().toISOString() : undefined,
    });

    return ok({ post: findPost(ctx.business.id, input.id), posts: listPosts(ctx.business.id, {}) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'marketing:write');
    const { id } = await parseBody(request, z.object({ id: z.string().min(3) }));
    deletePost(ctx.business.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'marketing:write');
    const input = await parseBody(
      request,
      z.object({ campaignId: z.string().min(3), status: z.enum(['DRAFT', 'GENERATED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']) }),
    );
    updateCampaign(ctx.business.id, input.campaignId, { status: input.status });
    return ok({ campaigns: listCampaigns(ctx.business.id) });
  } catch (error) {
    return handleError(error);
  }
}

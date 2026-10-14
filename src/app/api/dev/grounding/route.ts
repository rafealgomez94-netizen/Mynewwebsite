import { handleError, ok } from '@/lib/api/http';
import { HttpError, requireTenant } from '@/lib/auth/rbac';
import { getSessionContext } from '@/lib/auth/session';
import { answerCoverage, retrieveChunks, tokenise } from '@/lib/db/repositories/knowledge';
import { scalar } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Grounding inspector (development only).
 *
 * Shows exactly what the retrieval layer matched for a question: the query
 * tokens, the evidence coverage the confidence gate uses, and the ranked chunks.
 * It is used to tune the knowledge base and is unavailable in production. The
 * caller must be signed in and may only inspect their own workspace, so it can
 * never be used to read another tenant's documents.
 */
export async function GET(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(404, 'Not found.', 'not_found');
    }
    const ctx = requireTenant(await getSessionContext());
    const url = new URL(request.url);
    const requested = url.searchParams.get('businessId');
    if (requested && requested !== ctx.business.id) {
      throw new HttpError(403, 'That workspace is not yours to inspect.', 'forbidden');
    }
    const question = (url.searchParams.get('q') ?? '').trim();
    if (question.length < 2) throw new HttpError(422, 'A question is required.', 'validation_error');

    const chunks = retrieveChunks(ctx.business.id, question, 5);
    const top = chunks.slice(0, 3);
    return ok({
      workspace: { id: ctx.business.id, name: ctx.business.name },
      question,
      queryTokens: tokenise(question),
      evidence: answerCoverage(top, question),
      stats: {
        chunks: scalar<number>('SELECT count(*) AS c FROM knowledge_chunks WHERE business_id = ?', [ctx.business.id], 0),
        readySources: scalar<number>(
          `SELECT count(*) AS c FROM knowledge_sources WHERE business_id = ? AND status = 'READY'`,
          [ctx.business.id],
          0,
        ),
      },
      chunks: chunks.map((chunk) => ({
        score: Number(chunk.score.toFixed(3)),
        coverage: Number(chunk.coverage.toFixed(3)),
        matchedTokens: chunk.matchedTokens,
        source: chunk.sourceTitle,
        heading: chunk.heading,
        content: chunk.content.replace(/\s+/g, ' ').slice(0, 160),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

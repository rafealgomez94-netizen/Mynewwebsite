import { handleError, ok } from '@/lib/api/http';
import { getSessionContext } from '@/lib/auth/session';
import { assertPermission, HttpError, requireTenant } from '@/lib/auth/rbac';
import { createSource, knowledgeStats } from '@/lib/db/repositories/knowledge';
import { extractText, putObject } from '@/lib/storage';
import { incrementUsage, planForBusiness } from '@/lib/db/repositories/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = /\.(txt|md|csv|json|pdf|docx|tsv)$/i;

export async function POST(request: Request) {
  try {
    const ctx = requireTenant(await getSessionContext());
    assertPermission(ctx, 'knowledge:write');

    const form = await request.formData();
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
    const kind = String(form.get('kind') ?? 'UPLOAD');
    if (!files.length) throw new HttpError(400, 'Choose at least one file to upload.', 'no_files');

    const { plan } = planForBusiness(ctx.business.id);
    const stats = knowledgeStats(ctx.business.id);
    let usedBytes = stats.bytes;
    const created: { id: string; title: string; warning?: string; chunks: number }[] = [];

    for (const file of files) {
      if (!ALLOWED_EXTENSIONS.test(file.name)) {
        throw new HttpError(
          422,
          `${file.name}: supported formats are TXT, MD, CSV, JSON, PDF and DOCX.`,
          'unsupported_type',
        );
      }
      if (usedBytes + file.size > plan.limits.storageMb * 1024 * 1024) {
        throw new HttpError(
          402,
          `Uploading ${file.name} would exceed the ${plan.limits.storageMb} MB knowledge storage included in your ${plan.name} plan.`,
          'plan_limit',
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractText({ name: file.name, type: file.type, size: file.size, buffer });
      const stored = await putObject(ctx.business.id, file.name, buffer, extracted.fileType || 'application/octet-stream');

      const rawText =
        extracted.text && extracted.text.trim().length > 30
          ? extracted.text
          : `${file.name}\n\n(Automatic text extraction returned no readable content. ${extracted.warning ?? ''})`;

      const source = createSource(ctx.business.id, {
        title: file.name,
        kind: kind === 'CATALOG' || kind === 'POLICY' || kind === 'FAQ' ? kind : 'UPLOAD',
        fileType: extracted.fileType,
        sizeBytes: stored.size,
        storageKey: stored.key,
        rawText,
        createdById: ctx.userId,
      });

      usedBytes += stored.size;
      incrementUsage(ctx.business.id, 'DOCUMENTS', 1, { kind: 'UPLOAD' });
      incrementUsage(ctx.business.id, 'STORAGE_BYTES', stored.size, { file: file.name });
      created.push({ id: source.id, title: source.title, warning: extracted.warning, chunks: source.chunk_count });
    }

    return ok({ created, stats: knowledgeStats(ctx.business.id) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

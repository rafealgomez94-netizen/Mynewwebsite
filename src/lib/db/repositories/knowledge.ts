import { all, get, run, toJson, nowIso, type SqlValue } from '@/lib/db';
import { newId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Knowledge sources & chunks
// ---------------------------------------------------------------------------

export type KnowledgeSourceRow = {
  id: string;
  business_id: string;
  title: string;
  kind: string;
  file_type: string | null;
  size_bytes: number;
  storage_key: string | null;
  raw_text: string | null;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export function listSources(businessId: string, limit = 100): KnowledgeSourceRow[] {
  return all<KnowledgeSourceRow>(
    `SELECT id, business_id, title, kind, file_type, size_bytes, storage_key, status, error_message, chunk_count,
            created_by_id, created_at, updated_at
     FROM knowledge_sources WHERE business_id = ? ORDER BY created_at DESC LIMIT ?`,
    [businessId, Math.min(Math.max(limit, 1), 300)],
  );
}

export function findSource(businessId: string, id: string): KnowledgeSourceRow | undefined {
  return get<KnowledgeSourceRow>('SELECT * FROM knowledge_sources WHERE business_id = ? AND id = ?', [businessId, id]);
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'are', 'was', 'were', 'have', 'has', 'had', 'our',
  'from', 'not', 'but', 'can', 'will', 'would', 'there', 'their', 'them', 'they', 'what', 'when', 'how', 'who',
  'why', 'all', 'any', 'into', 'out', 'about', 'more', 'most', 'some', 'such', 'than', 'does', 'did', 'its', 'also',
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/** Splits a document into overlapping word windows so retrieval stays relevant. */
export function chunkText(text: string, targetWords = 120, overlapWords = 25): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length <= targetWords) return [words.join(' ')];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    chunks.push(words.slice(start, start + targetWords).join(' '));
    if (start + targetWords >= words.length) break;
    start += targetWords - overlapWords;
  }
  return chunks;
}

/** Detects markdown-ish headings so retrieved chunks can be labelled with a section. */
function detectHeading(text: string, index: number): string | null {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const candidate = lines[0];
  if (candidate.length <= 90 && (/^#{1,6}\s/.test(candidate) || /^[A-Z0-9][^.]{2,60}$/.test(candidate) && candidate === candidate.toUpperCase())) {
    return candidate.replace(/^#{1,6}\s*/, '').slice(0, 90);
  }
  return index === 0 ? null : null;
}

export function createSource(
  businessId: string,
  input: {
    title: string;
    kind: string;
    fileType?: string | null;
    sizeBytes?: number;
    storageKey?: string | null;
    rawText: string;
    createdById?: string | null;
  },
): KnowledgeSourceRow {
  const id = newId('kbs');
  const at = nowIso();
  const text = input.rawText ?? '';
  const chunks = chunkText(text);
  run(
    `INSERT INTO knowledge_sources (id, business_id, title, kind, file_type, size_bytes, storage_key, raw_text,
        status, error_message, chunk_count, created_by_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      businessId,
      input.title,
      input.kind,
      input.fileType ?? null,
      input.sizeBytes ?? Buffer.byteLength(text, 'utf8'),
      input.storageKey ?? null,
      text,
      chunks.length ? 'READY' : 'FAILED',
      chunks.length,
      input.createdById ?? null,
      at,
      at,
    ],
  );

  chunks.forEach((chunk, index) => {
    const tokens = tokenise(chunk);
    run(
      `INSERT INTO knowledge_chunks (id, business_id, source_id, heading, content, keywords, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId('kbc'), businessId, id, detectHeading(chunk, index), chunk, tokens.join(' '), index, at],
    );
  });

  return get<KnowledgeSourceRow>('SELECT * FROM knowledge_sources WHERE business_id = ? AND id = ?', [businessId, id])!;
}

export function deleteSource(businessId: string, id: string): void {
  run('DELETE FROM knowledge_chunks WHERE business_id = ? AND source_id = ?', [businessId, id]);
  run('DELETE FROM knowledge_sources WHERE business_id = ? AND id = ?', [businessId, id]);
}

export function knowledgeStats(businessId: string) {
  const sources = get<{ c: number }>('SELECT count(*) AS c FROM knowledge_sources WHERE business_id = ?', [businessId]);
  const chunks = get<{ c: number }>('SELECT count(*) AS c FROM knowledge_chunks WHERE business_id = ?', [businessId]);
  const bytes = get<{ c: number }>(
    'SELECT coalesce(sum(size_bytes), 0) AS c FROM knowledge_sources WHERE business_id = ?',
    [businessId],
  );
  const faqs = get<{ c: number }>('SELECT count(*) AS c FROM faqs WHERE business_id = ? AND published = 1', [
    businessId,
  ]);
  return {
    sources: Number(sources?.c ?? 0),
    chunks: Number(chunks?.c ?? 0),
    bytes: Number(bytes?.c ?? 0),
    faqs: Number(faqs?.c ?? 0),
  };
}

export type RetrievedChunk = {
  id: string;
  sourceId: string;
  source_id: string;
  sourceTitle: string;
  heading: string | null;
  kind: string;
  content: string;
  score: number;
};

/**
 * BM25 keyword retrieval, always scoped to a single business. Runs in the
 * application layer so the identical code works on SQLite and PostgreSQL.
 * Only the highest-scoring chunks are ever sent to the language model.
 */
export function retrieveChunks(businessId: string, query: string, limit = 5): RetrievedChunk[] {
  const rows = all<{
    id: string;
    source_id: string;
    heading: string | null;
    content: string;
    keywords: string | null;
    title: string;
    kind: string;
  }>(
    `SELECT kc.id, kc.source_id, kc.heading, kc.content, kc.keywords, ks.title, ks.kind
     FROM knowledge_chunks kc
     JOIN knowledge_sources ks ON ks.id = kc.source_id
     WHERE kc.business_id = ? AND ks.status = 'READY'`,
    [businessId],
  );
  if (!rows.length) return [];

  const queryTokens = [...new Set(tokenise(query))];
  if (!queryTokens.length) return [];

  const K1 = 1.4;
  const B = 0.72;
  const docCount = rows.length;

  const prepared = rows.map((row) => {
    const tokens = (row.keywords ? row.keywords.split(' ').filter(Boolean) : tokenise(row.content));
    const counts = new Map<string, number>();
    tokens.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));
    return { row, counts, length: Math.max(tokens.length, 1) };
  });

  const averageLength = prepared.reduce((sum, item) => sum + item.length, 0) / prepared.length;
  const documentFrequencies = new Map<string, number>();
  for (const token of queryTokens) {
    let frequency = 0;
    for (const item of prepared) if (item.counts.has(token)) frequency += 1;
    documentFrequencies.set(token, frequency);
  }

  return prepared
    .map((item) => {
      let score = 0;
      for (const token of queryTokens) {
        const frequency = item.counts.get(token);
        if (!frequency) continue;
        const documentsWithToken = documentFrequencies.get(token) ?? 0;
        const idf = Math.log(1 + (docCount - documentsWithToken + 0.5) / (documentsWithToken + 0.5));
        score += idf * ((frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * item.length) / averageLength)));
      }
      return {
        id: item.row.id,
        sourceId: item.row.source_id,
        source_id: item.row.source_id,
        sourceTitle: item.row.title,
        heading: item.row.heading,
        kind: item.row.kind,
        content: item.row.content,
        score,
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(Math.max(limit, 1), 12));
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export type FaqRow = {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  category: string | null;
  published: number;
  asked_count: number;
  created_at: string;
  updated_at: string;
};

export function listFaqs(businessId: string, onlyPublished = false): FaqRow[] {
  return all<FaqRow>(
    `SELECT * FROM faqs WHERE business_id = ? ${onlyPublished ? 'AND published = 1' : ''}
     ORDER BY asked_count DESC, created_at DESC`,
    [businessId],
  );
}

export function createFaq(
  businessId: string,
  input: { question: string; answer: string; category?: string | null; published?: boolean },
): string {
  const id = newId('faq');
  const at = nowIso();
  run(
    `INSERT INTO faqs (id, business_id, question, answer, category, published, asked_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      businessId,
      input.question,
      input.answer,
      input.category ?? null,
      input.published === false ? 0 : 1,
      at,
      at,
    ],
  );
  return id;
}

export function updateFaq(
  businessId: string,
  id: string,
  patch: { question?: string; answer?: string; category?: string | null; published?: boolean },
): void {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.question !== undefined) {
    sets.push('question = ?');
    params.push(patch.question);
  }
  if (patch.answer !== undefined) {
    sets.push('answer = ?');
    params.push(patch.answer);
  }
  if (patch.category !== undefined) {
    sets.push('category = ?');
    params.push(patch.category);
  }
  if (patch.published !== undefined) {
    sets.push('published = ?');
    params.push(patch.published ? 1 : 0);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), businessId, id);
  run(`UPDATE faqs SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteFaq(businessId: string, id: string): void {
  run('DELETE FROM faqs WHERE business_id = ? AND id = ?', [businessId, id]);
}

export function bumpFaqAsked(businessId: string, question: string): void {
  run(
    `UPDATE faqs SET asked_count = asked_count + 1, updated_at = ? WHERE business_id = ? AND lower(question) = lower(?)`,
    [nowIso(), businessId, question],
  );
}

/** Used to seed the "what should we promote / fix" answers. */
export function topAskedFaqs(businessId: string, limit = 5) {
  return all<{ question: string; answer: string; asked_count: number }>(
    `SELECT question, answer, asked_count FROM faqs WHERE business_id = ? AND published = 1
     ORDER BY asked_count DESC LIMIT ?`,
    [businessId, limit],
  );
}

/**
 * Human-readable snapshot of the business knowledge the AI may answer from.
 * Used when keyword retrieval returns nothing (small knowledge bases).
 */
export function buildKnowledgeSnapshot(businessId: string, maxChars = 6000): string {
  const sources = all<{ id: string; title: string; kind: string }>(
    'SELECT id, title, kind FROM knowledge_sources WHERE business_id = ? AND status = ? ORDER BY created_at ASC',
    [businessId, 'READY'],
  );
  const parts: string[] = [];
  let budget = maxChars;
  for (const source of sources) {
    if (budget <= 0) break;
    const chunks = all<{ heading: string | null; content: string }>(
      `SELECT heading, content FROM knowledge_chunks WHERE business_id = ? AND source_id = ? ORDER BY position ASC LIMIT 5`,
      [businessId, source.id],
    );
    if (!chunks.length) continue;
    const body = chunks
      .map((chunk) => (chunk.heading ? `## ${chunk.heading}\n${chunk.content}` : chunk.content))
      .join('\n---\n');
    const slice = body.slice(0, Math.max(budget, 0));
    parts.push(`### ${source.title} (${source.kind})\n${slice}`);
    budget -= slice.length;
  }
  const faqs = listFaqs(businessId, true).slice(0, 12);
  if (faqs.length && budget > 200) {
    const body = faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n');
    parts.push(`### Published FAQs\n${body.slice(0, budget)}`);
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// AI run ledger
// ---------------------------------------------------------------------------

export type AiRunRow = {
  id: string;
  business_id: string;
  user_id: string | null;
  surface: string;
  prompt: string | null;
  response: string | null;
  provider: string;
  model: string | null;
  sources_json: string | null;
  sources: { title: string; score?: number }[];
  grounded: number;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  created_at: string;
};

export function storeAiRun(input: {
  businessId: string;
  userId?: string | null;
  surface: string;
  prompt?: string | null;
  response?: string | null;
  provider: string;
  model?: string | null;
  sources?: { title: string; score?: number }[];
  grounded?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}): string {
  const id = newId('air');
  run(
    `INSERT INTO ai_runs (id, business_id, user_id, surface, prompt, response, provider, model, sources_json, grounded,
        tokens_in, tokens_out, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.businessId,
      input.userId ?? null,
      input.surface,
      input.prompt ?? null,
      input.response ?? null,
      input.provider,
      input.model ?? null,
      toJson(input.sources ?? []),
      input.grounded ? 1 : 0,
      input.tokensIn ?? 0,
      input.tokensOut ?? 0,
      input.latencyMs ?? 0,
      nowIso(),
    ],
  );
  return id;
}

export function aiUsage(businessId: string, sinceIso: string) {
  const row = get<{ runs: number; tokens: number; avg_latency: number; grounded: number }>(
    `SELECT count(*) AS runs,
            coalesce(sum(tokens_in + tokens_out), 0) AS tokens,
            coalesce(avg(latency_ms), 0) AS avg_latency,
            coalesce(sum(CASE WHEN grounded = 1 THEN 1 ELSE 0 END), 0) AS grounded
     FROM ai_runs WHERE business_id = ? AND created_at >= ?`,
    [businessId, sinceIso],
  );
  return {
    runs: Number(row?.runs ?? 0),
    tokens: Number(row?.tokens ?? 0),
    avg_latency: Number(row?.avg_latency ?? 0),
    grounded: Number(row?.grounded ?? 0),
  };
}

export function recentAiRuns(businessId: string, limit = 20): AiRunRow[] {
  return all<Record<string, SqlValue>>(
    `SELECT * FROM ai_runs WHERE business_id = ? ORDER BY created_at DESC LIMIT ?`,
    [businessId, Math.min(Math.max(limit, 1), 100)],
  ).map((row) => {
    let sources: { title: string; score?: number }[] = [];
    if (typeof row.sources_json === 'string' && row.sources_json) {
      try {
        sources = JSON.parse(row.sources_json) as { title: string; score?: number }[];
      } catch {
        sources = [];
      }
    }
    return { ...(row as unknown as AiRunRow), sources };
  });
}

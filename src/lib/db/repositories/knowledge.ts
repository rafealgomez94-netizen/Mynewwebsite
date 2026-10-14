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

/**
 * Words that appear in almost every business question but say nothing about which
 * document should answer it ("what time do you close", "how much is it"). They are
 * allowed to be missing from the evidence; every other word in the question must be
 * covered before an answer is presented as grounded.
 */
const GENERIC_QUERY_WORDS = new Set([
  'time', 'close', 'closing', 'open', 'opening', 'price', 'prices', 'pricing', 'cost', 'costs', 'much', 'many',
  'offer', 'offers', 'provide', 'provides', 'available', 'availability', 'book', 'booking', 'bookings', 'need',
  'need', 'want', 'know', 'service', 'services', 'product', 'products', 'help', 'please', 'thanks', 'hello',
  'quote', 'quotes', 'pay', 'payment', 'payments', 'accept', 'accepts', 'take', 'takes', 'long', 'today',
  'tomorrow', 'week', 'month', 'year', 'best', 'good', 'popular', 'recommend', 'detail', 'details', 'info',
  'information', 'option', 'options', 'policy', 'policies', 'team', 'staff', 'location', 'address', 'contact',
  'email', 'phone', 'number', 'website', 'hours', 'business', 'work', 'working', 'different', 'charge',
]);

/** Query words that carried the question into a document rather than a specific fact. */
export function distinctiveTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !GENERIC_QUERY_WORDS.has(token));
}

/** Crude suffix stripping so "include"/"including", "refund"/"refunds" match. */
function stem(token: string): string {
  const stripped = token.replace(/(ing|ed|es|s)$/, '');
  if (stripped.length < 4) return token;
  // "include" and "included" already share a stem; trailing -e would split them.
  const trimmed = stripped.replace(/e$/, '');
  return trimmed.length >= 4 ? trimmed : stripped;
}

/** True when two tokens describe the same term (prefix or shared stem). */
function sameTerm(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.startsWith(a)) return true;
  if (b.length >= 5 && a.startsWith(b)) return true;
  return stem(a) === stem(b);
}

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * A line that is only a title (SHOUTY, short, no figures or sentence punctuation)
 * carries no answer on its own — indexing it would let "?" style questions match
 * a document heading instead of real content.
 */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 12 || trimmed.length > 90) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return false;
  return !/[0-9:]/.test(trimmed) && trimmed.split(/\s+/).length <= 12;
}

/**
 * Splits a document into retrieval units.
 *
 * Business documents are usually structured: a menu or price list is one item per
 * line, a policy is one clause per paragraph. Chunking those by a fixed word count
 * would bury a single price inside 120 words of unrelated text, so paragraphs and
 * lines are kept intact and only merged while they still fit the target size.
 * Long prose paragraphs fall back to overlapping word windows.
 */
export function chunkText(text: string, targetWords = 120, overlapWords = 25): string[] {
  const normalised = text.replace(/\r\n?/g, '\n').trim();
  if (!normalised) return [];

  const units: { text: string; atomic: boolean }[] = [];
  for (const block of normalised.split(/\n{2,}/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 3) {
      // A list-like block (price list, service menu, policy clauses): every line is
      // its own retrieval unit so "how much is X" matches the X line, not the page.
      // Title-style lines are dropped — they are headings, not content.
      units.push(
        ...lines
          .filter((line) => !isHeadingLine(line))
          .map((line) => ({ text: line, atomic: true })),
      );
    } else if (lines.length > 1) {
      units.push(...lines.map((line) => ({ text: line, atomic: false })));
    } else if (lines.length === 1) {
      units.push({ text: lines[0], atomic: false });
    }
  }
  if (!units.length) return [];

  const wordCount = (value: string) => value.split(/\s+/).filter(Boolean).length;
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length) {
      chunks.push(current.join('\n'));
      current = [];
      currentWords = 0;
    }
  };

  for (const unit of units) {
    const words = wordCount(unit.text);
    if (unit.atomic) {
      flush();
      chunks.push(unit.text);
      continue;
    }
    if (words > targetWords) {
      // A single oversized paragraph: window it with overlap.
      flush();
      const tokens = unit.text.split(/\s+/).filter(Boolean);
      let start = 0;
      while (start < tokens.length) {
        chunks.push(tokens.slice(start, start + targetWords).join(' '));
        if (start + targetWords >= tokens.length) break;
        start += targetWords - overlapWords;
      }
      continue;
    }
    if (currentWords + words > targetWords) flush();
    current.push(unit.text);
    currentWords += words;
  }
  flush();
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

/**
 * Picks the sentences inside a retrieved chunk that actually answer the question.
 * Keeps answers short and quotable instead of dumping a whole page back at the user.
 */
export function relevantSentences(content: string, query: string, max = 2): string[] {
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
  if (sentences.length <= max) return sentences;

  const queryTokens = new Set(tokenise(query));
  if (!queryTokens.size) return sentences.slice(0, max);

  const scored = sentences.map((sentence, index) => {
    const tokens = tokenise(sentence);
    let score = 0;
    for (const token of tokens) {
      for (const queryToken of queryTokens) {
        if (sameTerm(queryToken, token)) {
          score += 1;
          break;
        }
      }
    }
    // Normalise for length so one long sentence does not win by accident.
    return { sentence, index, score: score / Math.sqrt(tokens.length || 1) };
  });

  const ranked = scored.filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  if (!ranked.length) return sentences.slice(0, max);

  const strongest = ranked[0].score;
  const chosen = ranked
    .filter((item) => item.score >= strongest * 0.45)
    .slice(0, max)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.sentence);

  return chosen.length ? chosen : [ranked[0].sentence];
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

/**
 * Rebuilds the chunk index for every source in a workspace using the current
 * chunking strategy. Safe to run repeatedly; used after tuning or when a source
 * was indexed by an older version.
 */
export function reindexSources(businessId: string): { sources: number; chunks: number } {
  const sources = all<{ id: string; raw_text: string | null; title: string }>(
    `SELECT id, raw_text, title FROM knowledge_sources WHERE business_id = ?`,
    [businessId],
  );
  let chunks = 0;
  const at = nowIso();
  for (const source of sources) {
    run('DELETE FROM knowledge_chunks WHERE business_id = ? AND source_id = ?', [businessId, source.id]);
    const pieces = chunkText(source.raw_text ?? '');
    pieces.forEach((piece, index) => {
      run(
        `INSERT INTO knowledge_chunks (id, business_id, source_id, heading, content, keywords, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId('kbc'), businessId, source.id, detectHeading(piece, index), piece, tokenise(piece).join(' '), index, at],
      );
    });
    run(
      `UPDATE knowledge_sources SET chunk_count = ?, status = ?, updated_at = ? WHERE business_id = ? AND id = ?`,
      [pieces.length, pieces.length ? 'READY' : 'FAILED', at, businessId, source.id],
    );
    chunks += pieces.length;
  }
  return { sources: sources.length, chunks };
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
  coverage: number;
  matchedTokens: string[];
};

/**
 * BM25 keyword retrieval, always scoped to a single business. Runs in the
 * application layer so the identical code works on SQLite and PostgreSQL.
 * Only the highest-scoring chunks are ever sent to the language model.
 */
/**
 * Builds the user-facing answer from retrieved evidence.
 *
 * Shared by the business assistant and the customer-support assistant so both
 * quote exactly the sentences that answer the question, from up to `maxChunks`
 * comparable sources, with duplicated and heading-only lines removed.
 */
export function composeGroundedAnswer(
  chunks: {
    sourceTitle: string;
    heading: string | null;
    content: string;
    score: number;
    matchedTokens?: string[];
  }[],
  question: string,
  options: { maxChunks?: number; maxSentences?: number; withSourceLabels?: boolean } = {},
): string {
  const { maxChunks = 2, maxSentences = 3, withSourceLabels = false } = options;
  const best = chunks[0];
  if (!best) return '';

  const strip = (content: string) =>
    content
      .split('\n')
      .filter((line, index) => !(index === 0 && line.trim().length <= 90 && line.trim() === line.trim().toUpperCase()))
      .join('\n')
      .trim();

  const parts: string[] = [];
  const seen = new Set<string>();
  const covered = new Set<string>();
  for (const chunk of chunks.slice(0, Math.max(1, maxChunks))) {
    const tokens = chunk.matchedTokens ?? [];
    const addsSomething = distinctiveTokens(tokens).some((token) => !covered.has(token));
    // Include a chunk when it is nearly as relevant as the best one, or when it
    // covers a part of the question the first chunk did not ("closing time on
    // Thursday" + "price of a kids haircut" live in different lines).
    if (parts.length && !addsSomething && chunk.score < best.score * 0.7) continue;
    if (!chunk.content?.trim()) continue;
    for (const token of tokens) covered.add(token);
    const sentences = relevantSentences(strip(chunk.content) || chunk.content, question, maxSentences);
    for (const sentence of sentences) {
      const key = sentence.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(
        withSourceLabels
          ? `${chunk.sourceTitle}${chunk.heading ? ` › ${chunk.heading}` : ''}: ${sentence}`
          : sentence,
      );
    }
  }
  return parts.join(withSourceLabels ? '\n\n' : ' ');
}

/**
 * Minimum share of the question's content words a chunk must contain before it is
 * treated as a possible answer. Without this, a single shared word (for example
 * "hair") would let the assistant quote an unrelated line with confidence.
 */
export const MIN_COVERAGE = 0.15;

/**
 * How much of the question the retrieved evidence actually covers, across chunks.
 *
 * A per-chunk threshold alone would reject legitimate multi-part questions ("what
 * time do you close and how much is a haircut?"), because each part lives in a
 * different line. The union over the top chunks is the honest measure of whether
 * the knowledge base can answer — and `missing` tells the assistant which part to
 * hand to a human instead of guessing.
 */
export function answerCoverage(
  chunks: { matchedTokens: string[] }[],
  question: string,
): {
  coverage: number;
  matched: string[];
  missing: string[];
  missingRequired: string[];
  answerable: boolean;
} {
  const queryTokens = [...new Set(tokenise(question))];
  if (!queryTokens.length) return { coverage: 0, matched: [], missing: [], missingRequired: [], answerable: false };
  const matched = new Set<string>();
  for (const chunk of chunks) for (const token of chunk.matchedTokens) matched.add(token);
  const matchedList = queryTokens.filter((token) => matched.has(token));
  const missing = queryTokens.filter((token) => !matched.has(token));
  // A distinctive term the knowledge base never mentions ("laser", "refund policy
  // for gift vouchers") means we cannot answer that part — escalate instead.
  const missingRequired = missing.filter((token) => !GENERIC_QUERY_WORDS.has(token));
  return {
    coverage: matchedList.length / queryTokens.length,
    matched: matchedList,
    missing,
    missingRequired,
    answerable: missingRequired.length === 0 && (queryTokens.length === 0 ? false : matchedList.length > 0),
  };
}

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

  // Prefix expansion: business language is full of long nouns (keratin, postnatal,
  // manicure) that people abbreviate or misspell. A chunk token that starts with a
  // query token counts for less than an exact hit but still finds the right line.
  const prefixMatches = new Map<string, Map<string, number>>();
  for (const token of queryTokens) {
    const matches = new Map<string, number>();
    for (const [, counts] of prepared.map((item) => [item.row.id, item.counts] as const)) {
      for (const [word, count] of counts) {
        if (word !== token && sameTerm(token, word)) {
          matches.set(word, (matches.get(word) ?? 0) + count);
        }
      }
    }
    if (matches.size) prefixMatches.set(token, matches);
  }

  return prepared
    .map((item) => {
      let score = 0;
      for (const token of queryTokens) {
        const documentsWithToken = documentFrequencies.get(token) ?? 0;
        const idf = Math.log(1 + (docCount - documentsWithToken + 0.5) / (documentsWithToken + 0.5));
        const frequency = item.counts.get(token);
        if (frequency) {
          score += idf * ((frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * item.length) / averageLength)));
        }
        const expansions = prefixMatches.get(token);
        if (!expansions) continue;
        let expanded = 0;
        for (const [word] of expansions) expanded += item.counts.get(word) ?? 0;
        if (!expanded) continue;
        score +=
          0.7 * idf * ((expanded * (K1 + 1)) / (expanded + K1 * (1 - B + (B * item.length) / averageLength)));
      }
      const covered = new Set<string>();
      for (const token of queryTokens) {
        if (item.counts.has(token)) {
          covered.add(token);
          continue;
        }
        const expansions = prefixMatches.get(token);
        if (!expansions) continue;
        for (const word of expansions.keys()) {
          if (item.counts.has(word)) {
            covered.add(token);
            break;
          }
        }
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
        // Share of the question's meaningful words this chunk actually contains.
        // BM25 alone always finds *something*; coverage stops a stray word from
        // passing as an answer.
        coverage: queryTokens.length ? covered.size / queryTokens.length : 0,
        matchedTokens: [...covered],
      };
    })
    .filter((chunk) => chunk.score > 0 && chunk.coverage >= MIN_COVERAGE)
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

/**
 * Text extraction for uploaded business documents.
 *
 * A knowledge base is only as good as the text that reaches it, and the two most
 * common business document formats are compressed containers:
 *   - PDF  stores text inside FlateDecode-compressed content streams
 *   - DOCX is a ZIP archive holding word/document.xml
 *
 * Both were previously read as raw bytes, so an uploaded price list became a
 * page of binary noise: unsearchable itself, and harmful to retrieval because it
 * added hundreds of junk chunks. These extractors decompress the container first
 * and pull out the actual text, using only Node built-ins (node:zlib) so there is
 * no extra dependency to install or deploy.
 */
import zlib from 'node:zlib';

export type Extraction = {
  text: string;
  /** True when real prose was recovered, as opposed to a best-effort fallback. */
  reliable: boolean;
  warning?: string;
};

const MAX_TEXT_CHARS = 200_000;

/**
 * Guards the knowledge base against binary noise. A document is only indexable
 * when it mostly consists of readable characters and contains real words —
 * otherwise the owner is told the file could not be read instead of the AI
 * being handed garbage.
 */
export function looksLikeText(
  input: string,
  options: { minLength?: number; minDistinctWords?: number } = {},
): boolean {
  const minLength = options.minLength ?? 40;
  const minDistinctWords = options.minDistinctWords ?? 3;

  const text = input.replace(/\s+/g, ' ').trim();
  if (text.length < minLength) return false;

  const readable = (text.match(/[\p{L}\p{N}\p{P}\p{Zs}]/gu) ?? []).length;
  if (readable / text.length < 0.85) return false;

  // Words: at least three letters, enough of them, and they have to make up a
  // decent share of the text (a binary blob rarely has many real words).
  const words = text.match(/[\p{L}]{3,}/gu) ?? [];
  const distinct = new Set(words.map((word) => word.toLowerCase()));
  if (distinct.size < minDistinctWords) return false;
  return words.join('').length / text.replace(/ /g, '').length >= 0.5;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function latin1(buffer: Buffer): string {
  return buffer.toString('latin1');
}

/** Decodes a PDF literal string `( ... )` body, honouring escapes and octal. */
function decodeLiteral(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    i += 1;
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '(': out += '('; break;
      case ')': out += ')'; break;
      case '\\': out += '\\'; break;
      case '\n': break; // line continuation
      default: {
        if (next >= '0' && next <= '7') {
          // octal escape, up to three digits
          let octal = next;
          while (octal.length < 3 && body[i + 1] >= '0' && body[i + 1] <= '7') {
            octal += body[i + 1];
            i += 1;
          }
          out += String.fromCharCode(parseInt(octal, 8));
        } else {
          out += next ?? '';
        }
      }
    }
  }
  return out;
}

/** Decodes a PDF hex string `<48656c6c6f>` into text. */
function decodeHex(body: string): string {
  const cleaned = body.replace(/[^0-9a-fA-F]/g, '');
  const padded = cleaned.length % 2 ? `${cleaned}0` : cleaned;
  let out = '';
  for (let i = 0; i < padded.length; i += 2) {
    const code = parseInt(padded.slice(i, i + 2), 16);
    if (Number.isFinite(code)) out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Pulls text out of one decoded content stream: walks the operators and keeps
 * the string operands of text-showing operators (Tj, TJ, ', ").
 */
function textFromContentStream(content: string): string {
  let out = '';
  let i = 0;
  let pending = '';
  const flushLine = () => {
    if (pending.trim()) out += `${pending.trim()}\n`;
    pending = '';
  };

  while (i < content.length) {
    const ch = content[i];

    if (ch === '(') {
      // literal string
      let depth = 1;
      let j = i + 1;
      while (j < content.length && depth > 0) {
        if (content[j] === '\\') j += 2;
        else {
          if (content[j] === '(') depth += 1;
          else if (content[j] === ')') depth -= 1;
          j += 1;
        }
      }
      const literal = decodeLiteral(content.slice(i + 1, Math.max(i + 1, j - 1)));
      // Is this string the operand of a text-showing operator?
      const after = content.slice(j, j + 8);
      if (/^\s*(Tj|TJ|'|")/.test(after) || /^\s*\]/.test(after)) {
        pending += literal;
        if (/^\s*(Tj|'|")/.test(after)) flushLine();
      }
      i = j;
      continue;
    }

    if (ch === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      if (end === -1) break;
      const after = content.slice(end + 1, end + 9);
      if (/^\s*(Tj|TJ|'|")/.test(after) || /^\s*\]/.test(after)) {
        pending += decodeHex(content.slice(i + 1, end));
        if (/^\s*(Tj|'|")/.test(after)) flushLine();
      }
      i = end + 1;
      continue;
    }

    // TJ arrays separate words with large negative kerning: treat as a space
    if (ch === '-' && /^-\d/.test(content.slice(i, i + 4))) {
      pending += ' ';
      i += 1;
      continue;
    }

    if (ch === 'T' && content.slice(i, i + 2) === 'Td') {
      pending += ' ';
      i += 2;
      continue;
    }
    if (ch === 'T' && content.slice(i, i + 2) === 'TD') {
      pending += ' ';
      i += 2;
      continue;
    }
    if (ch === 'E' && content.slice(i, i + 2) === 'ET') {
      flushLine();
      i += 2;
      continue;
    }

    i += 1;
  }
  flushLine();
  return out;
}

/** Inflates every FlateDecode stream in the file and extracts its text. */
function extractPdfText(buffer: Buffer): string {
  const raw = latin1(buffer);
  const pieces: string[] = [];
  const streamPattern = /stream\r?\n?([\s\S]*?)endstream/g;
  let match;

  while ((match = streamPattern.exec(raw))) {
    const headerStart = raw.lastIndexOf('<<', match.index);
    const dict = headerStart >= 0 ? raw.slice(headerStart, match.index) : '';
    const body = match[1];
    let decoded = '';

    if (/\/FlateDecode/.test(dict)) {
      try {
        decoded = latin1(zlib.inflateSync(Buffer.from(body, 'latin1')));
      } catch {
        try {
          // some writers omit the zlib header
          decoded = latin1(zlib.inflateRawSync(Buffer.from(body, 'latin1')));
        } catch {
          decoded = '';
        }
      }
    } else if (!/\/Filter/.test(dict)) {
      decoded = body;
    }

    if (!decoded) continue;
    // Only content streams carry text operators; image/font streams are skipped
    // because they contain no readable text anyway.
    if (/\b(Tj|TJ)\b/.test(decoded) || /\(.*\)\s*Tj/.test(decoded)) {
      pieces.push(textFromContentStream(decoded));
    }
  }

  return pieces
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Best-effort fallback for PDFs whose text this extractor cannot decode. */
function heuristicPdfText(buffer: Buffer): string {
  return latin1(buffer)
    .replace(/[^ -~\n]/g, ' ')
    .replace(/\\[a-zA-Z]{1,3}\d*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function extractPdf(buffer: Buffer): Extraction {
  const text = extractPdfText(buffer);
  if (looksLikeText(text)) {
    return { text: text.slice(0, MAX_TEXT_CHARS), reliable: true };
  }

  // The fallback is raw file content with the binary stripped, so it has to clear
  // a much higher bar than real extraction: otherwise PDF syntax ("obj", "trailer",
  // "Length") reads as prose and lands in the knowledge base as junk.
  const fallback = heuristicPdfText(buffer);
  if (looksLikeText(fallback, { minLength: 240, minDistinctWords: 30 })) {
    return {
      text: fallback.slice(0, MAX_TEXT_CHARS),
      reliable: false,
      warning: 'PDF text was extracted heuristically — check the extracted content before relying on it.',
    };
  }

  return {
    text: '',
    reliable: false,
    warning:
      'No readable text was found in this PDF (it may be a scan or use embedded fonts with a custom encoding). Paste the key details manually so the AI can use them.',
  };
}

// ---------------------------------------------------------------------------
// DOCX (and any ZIP container)
// ---------------------------------------------------------------------------

type ZipEntry = { name: string; method: number; compressedSize: number; dataStart: number };

function readZipEntries(buffer: Buffer): ZipEntry[] {
  // Find the End Of Central Directory record, scanning back from the tail.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      entries.push({
        name,
        method,
        compressedSize,
        dataStart: localOffset + 30 + localNameLength + localExtraLength,
      });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer | null {
  try {
    const data = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    if (entry.method === 0) return Buffer.from(data);
    if (entry.method === 8) return zlib.inflateRawSync(data);
  } catch {
    return null;
  }
  return null;
}

function xmlToText(xml: string): string {
  return (
    xml
      // paragraph and line breaks become newlines
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br\s*\/>/g, '\n')
      .replace(/<w:tab\s*\/>/g, '\t')
      // table cells are separate words
      .replace(/<\/w:tc>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function extractDocx(buffer: Buffer): Extraction {
  const entries = readZipEntries(buffer);
  if (!entries.length) {
    return { text: '', reliable: false, warning: 'This DOCX file could not be opened (it looks corrupt).' };
  }

  const parts = ['word/document.xml', 'word/header1.xml', 'word/footer1.xml'];
  const collected: string[] = [];
  for (const entry of entries) {
    if (!parts.includes(entry.name)) continue;
    const data = readZipEntry(buffer, entry);
    if (!data) continue;
    collected.push(xmlToText(data.toString('utf8')));
  }

  const text = collected.filter(Boolean).join('\n\n').trim();
  if (looksLikeText(text)) return { text: text.slice(0, MAX_TEXT_CHARS), reliable: true };
  return {
    text: '',
    reliable: false,
    warning: 'No readable text was found in this DOCX file.',
  };
}

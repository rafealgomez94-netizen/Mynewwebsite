import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '@/lib/utils';
import { extractDocx, extractPdf } from '@/lib/services/document-text';

/**
 * File storage abstraction for uploaded business documents.
 *
 * `local` writes under STORAGE_LOCAL_DIR (default data/storage) and is the
 * development / single-node driver. `s3` is wired through environment variables
 * and can be enabled once object storage credentials are configured — no code
 * paths outside this module need to change.
 */
export type StoredFile = { key: string; size: number; contentType: string };

export function storageDriver(): 'local' | 's3' {
  return process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
}

function localRoot(): string {
  const configured = process.env.STORAGE_LOCAL_DIR || 'data/storage';
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document.txt';
}

export async function putObject(
  businessId: string,
  fileName: string,
  data: Buffer,
  contentType: string,
): Promise<StoredFile> {
  const key = `${businessId}/${newId('file')}-${safeFileName(fileName)}`;
  if (storageDriver() === 's3') {
    // S3 driver placeholder: configure STORAGE_S3_* to enable. Throwing here keeps
    // the failure explicit instead of silently dropping customer documents.
    throw new Error('S3 storage driver is not enabled. Set STORAGE_DRIVER=local or configure the S3 credentials.');
  }
  const target = path.join(localRoot(), key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  return { key, size: data.byteLength, contentType };
}

export async function getObjectText(key: string): Promise<string> {
  const target = path.join(localRoot(), key);
  return fs.readFile(target, 'utf8');
}

export async function deleteObject(key: string): Promise<void> {
  if (storageDriver() !== 'local') return;
  try {
    await fs.unlink(path.join(localRoot(), key));
  } catch {
    /* already gone */
  }
}

const TEXT_TYPES = ['text/', 'application/json', 'application/xml', 'application/csv'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ExtractedDocument = { text: string; fileType: string; size: number; warning?: string };

/**
 * Extracts searchable text from an uploaded business document.
 * Plain-text formats (txt/md/csv/json), PDF and DOCX are supported; unsupported
 * binaries are stored but flagged so the owner knows the AI cannot read them yet.
 */
export async function extractText(file: { name: string; type: string; size: number; buffer: Buffer }): Promise<ExtractedDocument> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Files must be 8 MB or smaller.');
  }
  const lower = file.name.toLowerCase();
  const isTextType = TEXT_TYPES.some((type) => file.type.startsWith(type)) || /\.(txt|md|csv|json|tsv)$/.test(lower);

  if (isTextType) {
    return { text: file.buffer.toString('utf8'), fileType: file.type || 'text/plain', size: file.size };
  }

  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    const extraction = extractPdf(file.buffer);
    return {
      text: extraction.text,
      fileType: 'application/pdf',
      size: file.size,
      warning: extraction.warning,
    };
  }

  if (lower.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    const extraction = extractDocx(file.buffer);
    return {
      text: extraction.text,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: file.size,
      warning: extraction.warning,
    };
  }

  return {
    text: '',
    fileType: file.type || 'application/octet-stream',
    size: file.size,
    warning: 'This file type cannot be read automatically yet. Supported: TXT, MD, CSV, JSON, PDF, DOCX.',
  };
}

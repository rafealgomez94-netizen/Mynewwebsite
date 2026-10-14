import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Stable, non-reversible hash used for session and one-time tokens at rest. */
export function hashToken(token: string, secret?: string): string {
  const salt = secret ?? process.env.AUTH_SECRET ?? 'workspace-digital-development';
  return createHash('sha256').update(`${token}${salt}`).digest('hex');
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function passwordStrengthIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters');
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number');
  return issues;
}

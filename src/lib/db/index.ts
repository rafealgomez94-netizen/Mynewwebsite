/**
 * Database engine.
 *
 * Workspace Digital uses a relational schema (see db/schema.sqlite.sql) and a
 * single, injectable driver layer so the runtime can be pointed at a different
 * relational engine without touching application code.
 *
 * - Development / single-node deployment: reference runtime `node:sqlite`
 *   (zero native dependencies, WAL enabled, foreign keys enforced).
 * - Production scale-out: set `DATABASE_URL` to a PostgreSQL instance — the
 *   PostgreSQL DDL equivalent ships in `db/schema.postgres.sql` and this module
 *   is the only place that needs a driver swap.
 *
 * Every repository in `src/lib/db/repositories/*` funnels through `all()`,
 * `get()`, `run()` and `tx()` below, and always binds a `business_id` for
 * tenant-owned rows.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = readonly SqlValue[];

const DEFAULT_FILE = path.join(process.cwd(), 'data', 'workspace-digital.db');

function databaseFile(): string {
  const configured = process.env.DATABASE_FILE?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  return DEFAULT_FILE;
}

function schemaPath(): string {
  return path.join(process.cwd(), 'db', 'schema.sqlite.sql');
}

let handle: DatabaseSync | null = null;
let handleFile = '';
let handleSignature = '';

/**
 * Identity of the database file on disk. `npm run db:reset` deletes and
 * recreates the file, which leaves any process holding the old handle reading a
 * deleted inode — a confusing state where some routes see fresh data and others
 * see stale data. Tracking the inode lets `getDb()` notice the swap and
 * reconnect instead of requiring a server restart.
 */
function fileSignature(file: string): string {
  try {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) return 'missing';
    return `${stat.ino}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  } catch {
    return 'missing';
  }
}

function connect(): DatabaseSync {
  const file = databaseFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  ensureSchema(db);
  return db;
}

function ensureSchema(db: DatabaseSync): void {
  const check = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'businesses'`,
  ).get();
  if (check) {
    ensureColumns(db);
    return;
  }
  const ddl = fs.readFileSync(schemaPath(), 'utf8');
  db.exec(ddl);
}

/**
 * Columns added after the first release.
 *
 * `CREATE TABLE IF NOT EXISTS` in `db/schema.sqlite.sql` only builds fresh databases,
 * so columns introduced later are added here. Each entry is idempotent: it is skipped
 * as soon as the column exists, which is why this is safe to run on every connect.
 * PostgreSQL deployments get the same column from `db/schema.postgres.sql`.
 */
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  {
    table: 'tasks',
    column: 'deadline_alerted_at',
    ddl: `ALTER TABLE tasks ADD COLUMN deadline_alerted_at TEXT`,
  },
];

function ensureColumns(db: DatabaseSync): void {
  for (const entry of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${entry.table})`).all() as { name: string }[];
    if (columns.some((column) => column.name === entry.column)) continue;
    db.exec(entry.ddl);
  }
}

/**
 * `node:sqlite` returns rows with a **null prototype**, which React Server
 * Components refuse to serialise when a row is passed to a Client Component
 * ("Only plain objects ... can be passed"). Every row handed back by this
 * module is therefore re-boxed into a normal object.
 */
function toPlainRow<T>(row: T): T {
  if (row === null || typeof row !== 'object') return row;
  return Object.assign({}, row as object) as T;
}

export function getDb(): DatabaseSync {
  const file = databaseFile();
  if (handle) {
    const current = fileSignature(file);
    // Same file, still present: reuse the connection.
    if (file === handleFile && current === handleSignature) return handle;
    // The file was replaced, removed or migrated — drop the stale handle first.
    try {
      handle.close();
    } catch {
      /* already closed */
    }
    handle = null;
  }
  handle = connect();
  handleFile = file;
  handleSignature = fileSignature(file);
  return handle;
}

export function all<T = Record<string, SqlValue>>(query: string, params: SqlParams = []): T[] {
  const rows = getDb().prepare(query).all(...params) as T[];
  return rows.map((row) => toPlainRow(row));
}

export function get<T = Record<string, SqlValue>>(query: string, params: SqlParams = []): T | undefined {
  const row = getDb().prepare(query).get(...params) as T | undefined;
  return row === undefined ? undefined : toPlainRow(row);
}

export function run(query: string, params: SqlParams = []) {
  return getDb().prepare(query).run(...params);
}

export function scalar<T = number>(query: string, params: SqlParams = [], fallback?: T): T {
  const row = getDb().prepare(query).get(...params) as Record<string, SqlValue> | undefined;
  if (!row) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Query returned no rows: ${query}`);
  }
  const first = Object.values(row)[0];
  return (first ?? fallback) as T;
}

/** Wrap a unit of work in a transaction. Nested calls reuse the outer transaction. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  let depth = transactionDepth;
  if (depth === 0) db.exec('BEGIN');
  else db.exec(`SAVEPOINT sp_${depth}`);
  transactionDepth = depth + 1;
  try {
    const result = fn();
    transactionDepth = depth;
    if (depth === 0) db.exec('COMMIT');
    else db.exec(`RELEASE sp_${depth}`);
    return result;
  } catch (error) {
    transactionDepth = depth;
    try {
      if (depth === 0) db.exec('ROLLBACK');
      else db.exec(`ROLLBACK TO sp_${depth}`);
    } catch {
      /* transaction already unwound */
    }
    throw error;
  }
}

let transactionDepth = 0;

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function closeDb(): void {
  if (handle) {
    handle.close();
    handle = null;
    handleFile = '';
    handleSignature = '';
  }
}

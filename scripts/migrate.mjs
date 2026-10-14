#!/usr/bin/env node
/**
 * Applies db/schema.sqlite.sql to the configured database file.
 *
 *   npm run db:migrate           # create tables that do not exist yet
 *   npm run db:migrate -- --reset  # drop the database file and recreate it
 *
 * The application also applies the schema automatically on first connection so
 * that a fresh clone boots without a manual migration step; this script is the
 * explicit, CI-friendly entry point.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reset = process.argv.includes('--reset');
const file = process.env.DATABASE_FILE
  ? path.resolve(root, process.env.DATABASE_FILE)
  : path.join(root, 'data', 'workspace-digital.db');
const schema = path.join(root, 'db', 'schema.sqlite.sql');

fs.mkdirSync(path.dirname(file), { recursive: true });

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target);
  }
  console.log(`· removed ${path.relative(root, file)}`);
}

const ddl = fs.readFileSync(schema, 'utf8');
const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(ddl);

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map((row) => row.name);
const indexes = db
  .prepare(`SELECT count(*) AS c FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`)
  .get().c;

console.log(`✓ schema applied to ${path.relative(root, file)}`);
console.log(`  tables: ${tables.length}  indexes: ${indexes}`);
db.close();

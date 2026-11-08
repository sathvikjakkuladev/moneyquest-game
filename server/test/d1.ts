// A D1 stand-in for tests: the same API surface the server uses, on Node's built-in SQLite, with
// the real migrations applied. D1 enforces foreign keys, so this does too.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { Env } from '../src/env.ts';

type Param = string | number | null;

class Stmt {
  db: DatabaseSync;
  sql: string;
  params: Param[] = [];
  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...params: Param[]) {
    const s = new Stmt(this.db, this.sql);
    s.params = params;
    return s;
  }
  async first<T>(): Promise<T | null> {
    return ((this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null);
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }
  async run() {
    return this.exec();
  }
  exec() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function testDb(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = join(fileURLToPath(import.meta.url), '..', '..', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return d1 as unknown as D1Database;
}

export const ORIGIN = 'http://localhost:5173';

export function testEnv(over: Partial<Env> = {}): Env {
  return { DB: testDb(), CLASSROOM: undefined as unknown as DurableObjectNamespace, ENVIRONMENT: 'test', ALLOWED_ORIGINS: 'https://nhsqa.org,http://localhost:5173', PREVIEW_ORIGIN_PATTERN: '', ADMIN_EMAIL: 'admin@nhsqa.org', PEPPER: 'test-pepper', ...over };
}

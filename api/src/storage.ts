import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "jobaton.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// ─── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile (
    id TEXT PRIMARY KEY DEFAULT 'default',
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cover_letters (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'saved',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ─── Settings ───────────────────────────────────────────────────────────────
export function getSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export function saveSettings(settings: Record<string, string>): void {
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const txn = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, value);
    }
  });
  txn();
}

// ─── Profile ────────────────────────────────────────────────────────────────
export function getProfile(): any {
  const row = db.prepare("SELECT data FROM profile WHERE id = 'default'").get() as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveProfile(data: any): any {
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO profile (id, data, updated_at) VALUES ('default', ?, ?)").run(JSON.stringify(data), now);
  return { ...data, updated_at: now };
}

// ─── Generic CRUD (resumes, cover_letters, jobs) ────────────────────────────
export function readCollection<T = any>(table: string): T[] {
  const rows = db.prepare(`SELECT id, data, created_at, updated_at FROM ${table} ORDER BY created_at DESC`).all() as any[];
  return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, created_at: r.created_at, updated_at: r.updated_at }));
}

export function getById<T = any>(table: string, id: string): T | undefined {
  const row = db.prepare(`SELECT data, created_at, updated_at FROM ${table} WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  return { ...JSON.parse(row.data), id, created_at: row.created_at, updated_at: row.updated_at };
}

export function upsert<T extends { id: string; status?: string }>(table: string, item: T): T {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT created_at FROM ${table} WHERE id = ?`).get(item.id) as any;
  const created = existing?.created_at || now;
  const { id, created_at, updated_at, ...rest } = item as any;
  const data = JSON.stringify(rest);

  if (table === "jobs") {
    db.prepare(`INSERT OR REPLACE INTO jobs (id, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(item.id, data, (item as any).status || "saved", created, now);
  } else {
    db.prepare(`INSERT OR REPLACE INTO ${table} (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(item.id, data, created, now);
  }
  return { ...rest, id: item.id, created_at: created, updated_at: now } as T;
}

export function remove(table: string, id: string): boolean {
  const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ─── Jobs-specific ──────────────────────────────────────────────────────────
export function getJobsByStatus(status?: string): any[] {
  if (status) {
    const rows = db.prepare("SELECT id, data, status, created_at, updated_at FROM jobs WHERE status = ? ORDER BY updated_at DESC").all(status) as any[];
    return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
  }
  const rows = db.prepare("SELECT id, data, status, created_at, updated_at FROM jobs ORDER BY updated_at DESC").all() as any[];
  return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
}

export function writeCollection<T = unknown>(_table: string, _data: T[]): void {
  // Legacy compat — no-op
}

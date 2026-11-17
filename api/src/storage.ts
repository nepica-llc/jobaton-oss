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

// ─── Profiles migration ─────────────────────────────────────────────────────
// Each profile owns its profile data, resumes, cover letters and jobs. Rows that
// existed before profiles were added belong to the "default" profile.
const DATA_TABLES = ["resumes", "cover_letters", "jobs"] as const;
const hasColumn = (table: string, col: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
for (const t of DATA_TABLES) {
  if (!hasColumn(t, "profile_id")) db.exec(`ALTER TABLE ${t} ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default'`);
}
if (!hasColumn("profile", "name")) db.exec("ALTER TABLE profile ADD COLUMN name TEXT");
db.prepare("INSERT OR IGNORE INTO profile (id, data, updated_at, name) VALUES ('default', 'null', ?, 'Default')").run(new Date().toISOString());
db.exec("UPDATE profile SET name = 'Default' WHERE id = 'default' AND name IS NULL");

export function listProfiles(): { id: string; name: string }[] {
  return db.prepare("SELECT id, COALESCE(name, id) AS name FROM profile ORDER BY id = 'default' DESC, rowid").all() as any[];
}

export function profileExists(id: string): boolean {
  return !!db.prepare("SELECT 1 FROM profile WHERE id = ?").get(id);
}

export function createProfile(id: string, name: string): { id: string; name: string } {
  db.prepare("INSERT INTO profile (id, data, updated_at, name) VALUES (?, 'null', ?, ?)").run(id, new Date().toISOString(), name);
  return { id, name };
}

export function renameProfile(id: string, name: string): boolean {
  return db.prepare("UPDATE profile SET name = ? WHERE id = ?").run(name, id).changes > 0;
}

export function deleteProfile(id: string): void {
  db.transaction(() => {
    for (const t of DATA_TABLES) db.prepare(`DELETE FROM ${t} WHERE profile_id = ?`).run(id);
    db.prepare("DELETE FROM profile WHERE id = ?").run(id);
  })();
}

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
export function getProfile(pid: string): any {
  const row = db.prepare("SELECT data FROM profile WHERE id = ?").get(pid) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveProfile(data: any, pid: string): any {
  const now = new Date().toISOString();
  db.prepare("UPDATE profile SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), now, pid);
  return { ...data, updated_at: now };
}

// ─── Generic CRUD (resumes, cover_letters, jobs) ────────────────────────────
export function readCollection<T = any>(table: string, pid: string): T[] {
  const rows = db.prepare(`SELECT id, data, created_at, updated_at FROM ${table} WHERE profile_id = ? ORDER BY created_at DESC`).all(pid) as any[];
  return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, created_at: r.created_at, updated_at: r.updated_at }));
}

export function getById<T = any>(table: string, id: string, pid: string): T | undefined {
  const row = db.prepare(`SELECT data, created_at, updated_at FROM ${table} WHERE id = ? AND profile_id = ?`).get(id, pid) as any;
  if (!row) return undefined;
  return { ...JSON.parse(row.data), id, created_at: row.created_at, updated_at: row.updated_at };
}

export function upsert<T extends { id: string; status?: string }>(table: string, item: T, pid: string): T {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT created_at, profile_id FROM ${table} WHERE id = ?`).get(item.id) as any;
  if (existing && existing.profile_id !== pid) throw new Error("Not found");
  const created = existing?.created_at || now;
  const { id, created_at, updated_at, ...rest } = item as any;
  const data = JSON.stringify(rest);

  if (table === "jobs") {
    db.prepare(`INSERT OR REPLACE INTO jobs (id, data, status, created_at, updated_at, profile_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(item.id, data, (item as any).status || "saved", created, now, pid);
  } else {
    db.prepare(`INSERT OR REPLACE INTO ${table} (id, data, created_at, updated_at, profile_id) VALUES (?, ?, ?, ?, ?)`)
      .run(item.id, data, created, now, pid);
  }
  return { ...rest, id: item.id, created_at: created, updated_at: now } as T;
}

export function remove(table: string, id: string, pid: string): boolean {
  const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND profile_id = ?`).run(id, pid);
  return result.changes > 0;
}

// ─── Jobs-specific ──────────────────────────────────────────────────────────
export function getJobsByStatus(pid: string, status?: string): any[] {
  if (status) {
    const rows = db.prepare("SELECT id, data, status, created_at, updated_at FROM jobs WHERE status = ? AND profile_id = ? ORDER BY updated_at DESC").all(status, pid) as any[];
    return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
  }
  const rows = db.prepare("SELECT id, data, status, created_at, updated_at FROM jobs WHERE profile_id = ? ORDER BY updated_at DESC").all(pid) as any[];
  return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
}

export function writeCollection<T = unknown>(_table: string, _data: T[]): void {
  // Legacy compat - no-op
}

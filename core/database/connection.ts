import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

let db: BetterSQLite3Database<typeof schema> | null = null;
let sqlite: Database.Database | null = null;

export function initializeDatabase(
  dbPath: string,
): BetterSQLite3Database<typeof schema> {
  if (db) return db;

  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  db = drizzle(sqlite, { schema });

  runMigrations();

  return db;
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error(
      "Database has not been initialized. Call initializeDatabase first.",
    );
  }
  return db;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

function runMigrations(): void {
  if (!db) return;

  db.run(sql`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'healthy',
      plugin_path TEXT,
      is_built_in INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS adapter_versions (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      rules TEXT NOT NULL,
      download_strategy TEXT NOT NULL DEFAULT 'html',
      success_rate REAL NOT NULL DEFAULT 100,
      total_attempts INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_tested INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      serial TEXT NOT NULL UNIQUE,
      model TEXT,
      manufacturer TEXT,
      android_version TEXT,
      architecture TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      is_preferred INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0,
      current_step TEXT,
      total_steps INTEGER NOT NULL DEFAULT 7,
      source_id TEXT REFERENCES sources(id),
      device_id TEXT REFERENCES devices(id),
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      url TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT,
      file_size INTEGER,
      sha256 TEXT,
      mime_type TEXT,
      package_type TEXT,
      package_name TEXT,
      version_name TEXT,
      status TEXT NOT NULL DEFAULT 'downloading',
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS installed_apps (
      id TEXT PRIMARY KEY,
      package_name TEXT NOT NULL,
      version_name TEXT,
      version_code INTEGER,
      sha256 TEXT,
      certificate TEXT,
      architecture TEXT,
      device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
      source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      download_id TEXT REFERENCES downloads(id) ON DELETE SET NULL,
      installed_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status)`,
  );
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_logs_job ON logs(job_id)`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_adapter_versions_source ON adapter_versions(source_id)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_installed_apps_package ON installed_apps(package_name)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_installed_apps_device ON installed_apps(device_id)`,
  );

  seedDefaultSettings();
}

function seedDefaultSettings(): void {
  if (!db) return;

  const defaults: Record<string, string> = {
    "adb.path": "adb",
    "download.directory": "",
    "download.maxConcurrent": "2",
    "download.maxRetries": "3",
    "ui.theme": "dark",
    "browser.enabled": "true",
    "adapter.autoUpdate": "true",
  };

  const now = Date.now();
  for (const [key, value] of Object.entries(defaults)) {
    db.run(
      sql`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (${key}, ${value}, ${now})`,
    );
  }
}

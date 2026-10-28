import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EXTRACTION_VERSION } from "../version.ts";
import { DERIVED_SCHEMA, DERIVED_TABLES, MIGRATIONS } from "./schema.ts";

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version)),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
    });
  }
  db.exec(DERIVED_SCHEMA);
}

/** True when derived tables were produced by an older extraction and need a rebuild. */
export function extractionIsStale(db: Database): boolean {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'extraction_version'").get();
  const hasRuns = db.prepare("SELECT 1 FROM ingestion_runs WHERE status = 'complete' LIMIT 1").get() !== undefined;
  return hasRuns && row?.value !== EXTRACTION_VERSION;
}

export function resetDerivedTables(db: Database): void {
  for (const table of DERIVED_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
  db.exec(DERIVED_SCHEMA);
  db.prepare("INSERT INTO meta (key, value) VALUES ('extraction_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    EXTRACTION_VERSION,
  );
}

export function transaction<T>(db: Database, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

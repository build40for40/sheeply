import { rebuildDerivedTables } from "../ingest/extract.ts";
import { openDatabase } from "../db/database.ts";
import type { CliIo } from "./analyse-command.ts";

export function runRebuild(dbPath: string, io: CliIo): void {
  const db = openDatabase(dbPath);
  try {
    const runs = rebuildDerivedTables(db);
    io.stderr(`Rebuilt derived tables from ${runs.length} stored ingestion run(s)\n`);
  } finally {
    db.close();
  }
}

export function runStatus(dbPath: string, io: CliIo): void {
  const db = openDatabase(dbPath);
  try {
    const investors = db
      .prepare(
        `SELECT r.investor_id AS id, i.name, max(CASE WHEN r.status = 'complete' THEN r.id END) AS latest_run,
           max(CASE WHEN r.status = 'complete' THEN r.finished_at END) AS retrieved_at,
           sum(r.status = 'complete') AS complete_runs, sum(r.status = 'failed') AS failed_runs
         FROM ingestion_runs r LEFT JOIN investors i ON i.uuid = r.investor_id
         GROUP BY r.investor_id ORDER BY i.name, r.investor_id`,
      )
      .all();
    io.stdout(`${JSON.stringify({ database: dbPath, investors }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

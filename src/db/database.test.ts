import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./database.ts";

describe("openDatabase", () => {
  it("creates the file, its directory and every table on first use", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sheeply-")), "nested", "cache.sqlite");
    const db = openDatabase(path);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(["ingestion_runs", "raw_responses", "funding_rounds", "round_participants", "portfolio_relationships", "company_taxonomy"]));
    db.close();
  });

  it("applies migrations once when reopened", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sheeply-")), "cache.sqlite");
    openDatabase(path).close();
    const db = openDatabase(path);
    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()!.n).toBe(1);
    db.close();
  });
});

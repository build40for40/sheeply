import { describe, expect, it } from "vitest";
import { TRANSACTIONS, INVESTOR } from "../../tests/fixtures/dealroom.ts";
import { TEST_CONFIG, fakeDealroom, noSleep } from "../../tests/fixtures/fake-api.ts";
import { DealroomClient } from "../dealroom/client.ts";
import type { Database } from "../db/database.ts";
import { openDatabase } from "../db/database.ts";
import { extractRun, rebuildDerivedTables } from "./extract.ts";
import { ingestInvestor } from "./fetch.ts";

const counts = (db: Database) =>
  Object.fromEntries(
    ["funding_rounds", "round_participants", "companies", "company_taxonomy", "portfolio_relationships", "investor_round_scope", "entities"].map(
      (table) => [table, Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n)],
    ),
  );

async function ingest(db: Database, options: Parameters<typeof fakeDealroom>[0] = {}) {
  const api = fakeDealroom(options);
  return ingestInvestor(db, new DealroomClient(TEST_CONFIG, { fetch: api.fetch, sleep: noSleep }), INVESTOR.uuid);
}

describe("extraction", () => {
  it("stores each round once even when Dealroom repeats it across pages", async () => {
    const db = openDatabase(":memory:");
    await ingest(db, { transactions: [...TRANSACTIONS, TRANSACTIONS[0], TRANSACTIONS[3]] });
    expect(counts(db).funding_rounds).toBe(TRANSACTIONS.length);
    const participants = db.prepare("SELECT count(*) AS n FROM round_participants WHERE round_id = ?").get(TRANSACTIONS[0]!.id)!.n;
    expect(participants).toBe(TRANSACTIONS[0]!.investors!.length);
  });

  it("is idempotent across re-extraction and repeated ingestion", async () => {
    const db = openDatabase(":memory:");
    const runId = await ingest(db);
    const first = counts(db);
    extractRun(db, runId);
    expect(counts(db)).toEqual(first);
    await ingest(db);
    expect(counts(db)).toEqual(first);
  });

  it("drops rounds Dealroom no longer returns when the investor is refreshed", async () => {
    const db = openDatabase(":memory:");
    await ingest(db);
    await ingest(db, { transactions: TRANSACTIONS.slice(1) });
    expect(counts(db).investor_round_scope).toBe(TRANSACTIONS.length - 1);
  });

  it("rebuilds identical tables from stored responses alone", async () => {
    const db = openDatabase(":memory:");
    await ingest(db);
    const before = counts(db);
    const rounds = db.prepare("SELECT * FROM funding_rounds ORDER BY id").all();
    expect(rebuildDerivedTables(db)).toHaveLength(1);
    expect(counts(db)).toEqual(before);
    expect(db.prepare("SELECT * FROM funding_rounds ORDER BY id").all()).toEqual(rounds);
  });

  it("keeps overlapping taxonomy tags from different families", async () => {
    const db = openDatabase(":memory:");
    await ingest(db);
    const tags = db
      .prepare("SELECT t.type, t.name FROM company_taxonomy ct JOIN taxonomy_terms t ON t.id = ct.term_id WHERE ct.company_id = ? ORDER BY t.id")
      .all(TRANSACTIONS[0]!.company.uuid)
      .map((row) => `${row.type}:${row.name}`);
    expect(tags).toEqual(["industry:Robotics", "industry:Enterprise Software", "sector:robotics"]);
  });
});

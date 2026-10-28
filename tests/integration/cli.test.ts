import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CliIo } from "../../src/cli/analyse-command.ts";
import { buildProgram } from "../../src/cli/program.ts";
import { INVESTOR, TRANSACTIONS } from "../fixtures/dealroom.ts";
import type { FakeApiOptions } from "../fixtures/fake-api.ts";
import { TEST_ENV, fakeDealroom, noSleep } from "../fixtures/fake-api.ts";

function cli(options: FakeApiOptions & { env?: NodeJS.ProcessEnv } = {}) {
  const api = fakeDealroom(options);
  let stdout = "";
  let stderr = "";
  const io: CliIo = {
    env: options.env ?? { ...TEST_ENV },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    fetch: api.fetch,
    sleep: noSleep,
    isInteractive: false,
  };
  const run = async (...args: string[]) => {
    stdout = "";
    stderr = "";
    await buildProgram(io).parseAsync(["node", "sheeply", ...args]);
    return { stdout, stderr };
  };
  return { api, run };
}

const tempDb = () => join(mkdtempSync(join(tmpdir(), "sheeply-")), "research.sqlite");

describe("sheeply CLI", () => {
  it("creates a fresh database, fetches and reports on first run", async () => {
    const db = tempDb();
    const { api, run } = cli();
    const { stdout } = await run("Example Ventures", "--db", db);
    const report = JSON.parse(stdout);

    expect(report.investor).toMatchObject({ id: INVESTOR.uuid, name: "Example Ventures", analysis_level: "firm" });
    expect(report.coverage.funding_rounds_analysed).toBe(TRANSACTIONS.length);
    expect(report.source).toMatchObject({ provider: "Dealroom", rounds_strategy: "portfolio_transactions" });
    expect(api.apiCalls().some((c) => c.includes("/data/transactions"))).toBe(true);
  });

  it("reuses stored data on later runs and produces the same report", async () => {
    const db = tempDb();
    const first = cli();
    const before = (await first.run("Example Ventures", "--db", db)).stdout;

    const second = cli();
    const after = (await second.run("Example Ventures", "--db", db)).stdout;
    expect(after).toBe(before);
    expect(second.api.apiCalls()).toEqual([]);
  });

  it("reports offline without credentials and with identical output", async () => {
    const db = tempDb();
    const online = (await cli().run("--investor-id", INVESTOR.uuid, "--db", db)).stdout;
    const offline = cli({ env: {} });
    const result = await offline.run("Example Ventures", "--db", db, "--offline");
    expect(result.stdout).toBe(online);
    expect(offline.api.calls).toEqual([]);
  });

  it("refetches on --refresh and stays idempotent", async () => {
    const db = tempDb();
    const first = JSON.parse((await cli().run("Example Ventures", "--db", db)).stdout);
    const refreshed = cli();
    const second = JSON.parse((await refreshed.run("Example Ventures", "--db", db, "--refresh")).stdout);

    expect(refreshed.api.apiCalls().length).toBeGreaterThan(0);
    expect(second.source.ingestion_run_id).toBe(first.source.ingestion_run_id + 1);
    expect(second.source.dataset_fingerprint).toBe(first.source.dataset_fingerprint);
    expect(second.leadership).toEqual(first.leadership);
  });

  it("falls back to per-company rounds when the transactions filter is not available", async () => {
    const db = tempDb();
    const { api, run } = cli({ scripted: [{ match: /^\/data\/transactions/, status: 403 }] });
    const report = JSON.parse((await run("Example Ventures", "--db", db)).stdout);

    expect(report.source.rounds_strategy).toBe("per_company_funding_rounds");
    expect(api.apiCalls().filter((c) => c.includes("/funding-rounds")).length).toBeGreaterThan(0);
    expect(report.leadership.initial_rounds.rounds).toBe(5);
  });

  it("fails with candidates instead of guessing an ambiguous name", async () => {
    const { run } = cli();
    await expect(run("Sample Capital", "--db", tempDb())).rejects.toMatchObject({
      name: "InvestorResolutionError",
      candidates: [expect.objectContaining({ name: "Sample Capital" }), expect.objectContaining({ name: "Sample Capital" })],
    });
  });

  it("writes the report to --output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sheeply-"));
    const output = join(dir, "results", "example.json");
    await cli().run("Example Ventures", "--db", join(dir, "db.sqlite"), "--output", output, "--verbose");
    expect(JSON.parse(readFileSync(output, "utf8")).contributions).toHaveLength(8);
  });

  it("marks a failed fetch and keeps nothing for analysis", async () => {
    const db = tempDb();
    const { run } = cli({ scripted: [{ match: /portfolio/, status: 402, body: { error: { code: "CREDITS_EXHAUSTED", message: "x" } } }] });
    await expect(run("Example Ventures", "--db", db)).rejects.toMatchObject({ status: 402 });
    await expect(cli({ env: {} }).run("--investor-id", INVESTOR.uuid, "--db", db, "--offline")).rejects.toMatchObject({
      name: "NoStoredDataError",
    });
  });
});

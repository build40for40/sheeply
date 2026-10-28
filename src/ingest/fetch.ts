import type { DealroomClient, DealroomResponse } from "../dealroom/client.ts";
import { DealroomApiError } from "../dealroom/client.ts";
import { companyRoundPages, getInvestor, portfolioPages, portfolioTransactionPages } from "../dealroom/endpoints.ts";
import type { Database } from "../db/database.ts";
import { sha256 } from "../util.ts";
import { TOOL_VERSION } from "../version.ts";
import { extractRun } from "./extract.ts";

export type RawKind = "investor" | "portfolio" | "transactions" | "company_rounds";
export type RoundsStrategy = "portfolio_transactions" | "per_company_funding_rounds";

/** Statuses where the transactions filter itself is unavailable, so per-company calls may still work. */
const FALLBACK_STATUS = new Set([400, 403, 404]);

export interface IngestOptions {
  log?: (message: string) => void;
  now?: () => Date;
}

/**
 * Fetches everything one analysis needs and stores each response verbatim, then derives the
 * normalised tables from those responses. A failed run is kept for debugging but never analysed.
 */
export async function ingestInvestor(
  db: Database,
  client: DealroomClient,
  investorId: string,
  options: IngestOptions = {},
): Promise<number> {
  const log = options.log ?? (() => {});
  const now = options.now ?? (() => new Date());
  const runId = Number(
    db
      .prepare(
        `INSERT INTO ingestion_runs (investor_id, status, started_at, api_base_url, api_version, tool_version)
         VALUES (?, 'running', ?, ?, ?, ?)`,
      )
      .run(investorId, now().toISOString(), client.config.baseUrl, client.config.apiVersion, TOOL_VERSION).lastInsertRowid,
  );

  const insertRaw = db.prepare(
    `INSERT INTO raw_responses
       (run_id, kind, subject_id, page_index, endpoint, params_json, retrieved_at, api_version, credits_used, body_sha256, body_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const store = (kind: RawKind, subjectId: string, pageIndex: number, response: DealroomResponse<unknown> & { raw: unknown }) => {
    const body = JSON.stringify(response.raw);
    insertRaw.run(
      runId,
      kind,
      subjectId,
      pageIndex,
      response.meta.endpoint,
      JSON.stringify(response.meta.params),
      response.meta.retrievedAt,
      response.meta.apiVersion,
      response.meta.creditsUsed,
      sha256(body),
      body,
    );
  };

  const before = client.usage;
  try {
    const detail = await getInvestor(client, investorId);
    store("investor", investorId, 0, detail);
    const investor = detail.body.data;
    const expected = investor.portfolio?.companies?.total;
    log(`Fetching portfolio of ${investor.name}${expected == null ? "" : ` (${expected} companies reported)`}`);

    const roundCompanies: string[] = [];
    let portfolioRows = 0;
    for await (const page of portfolioPages(client, investorId)) {
      store("portfolio", investorId, page.pageIndex, page);
      portfolioRows += page.body.data.length;
      for (const row of page.body.data) if (row.rounds_count > 0) roundCompanies.push(row.company.uuid);
      if (page.body.page.tier && page.body.page.tier !== "premium") {
        log(`Warning: Dealroom served the "${page.body.page.tier}" tier, so some fields may be redacted`);
      }
    }
    log(`Portfolio: ${portfolioRows} rows`);

    let strategy: RoundsStrategy = "portfolio_transactions";
    try {
      let rounds = 0;
      for await (const page of portfolioTransactionPages(client, investorId)) {
        store("transactions", investorId, page.pageIndex, page);
        rounds += page.body.data.length;
        const total = page.body.page.total;
        log(`Funding rounds: ${rounds}${total == null ? "" : ` of ${total}`}`);
      }
    } catch (error) {
      if (!(error instanceof DealroomApiError) || !FALLBACK_STATUS.has(error.status)) throw error;
      strategy = "per_company_funding_rounds";
      db.prepare("DELETE FROM raw_responses WHERE run_id = ? AND kind = 'transactions'").run(runId);
      log(`The portfolio transactions filter is unavailable (${error.status} ${error.code}); fetching rounds per company`);
      let done = 0;
      for (const companyId of [...new Set(roundCompanies)].sort()) {
        for await (const page of companyRoundPages(client, companyId)) store("company_rounds", companyId, page.pageIndex, page);
        if (++done % 25 === 0) log(`Funding rounds: ${done} of ${roundCompanies.length} companies`);
      }
    }

    const after = client.usage;
    db.prepare(
      `UPDATE ingestion_runs SET status = 'complete', finished_at = ?, rounds_strategy = ?, requests = ?, credits_used = ? WHERE id = ?`,
    ).run(now().toISOString(), strategy, after.requests - before.requests, after.credits - before.credits, runId);
  } catch (error) {
    const after = client.usage;
    db.prepare(
      `UPDATE ingestion_runs SET status = 'failed', finished_at = ?, requests = ?, credits_used = ?, error = ? WHERE id = ?`,
    ).run(
      now().toISOString(),
      after.requests - before.requests,
      after.credits - before.credits,
      error instanceof Error ? error.message : String(error),
      runId,
    );
    throw error;
  }

  extractRun(db, runId);
  return runId;
}

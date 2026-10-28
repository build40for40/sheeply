import type { Database } from "../db/database.ts";
import { compareStrings } from "../util.ts";
import type { Company, Dataset, Participant, PortfolioEntry, Round } from "./types.ts";

export class NoStoredDataError extends Error {
  override name = "NoStoredDataError";
}

const str = (value: unknown): string | null => (value == null ? null : String(value));
const flag = (value: unknown): boolean | null => (value == null ? null : Number(value) === 1);

export function latestCompleteRun(db: Database, investorId: string): number | null {
  const row = db.prepare("SELECT run_id FROM extraction_state WHERE investor_id = ?").get(investorId);
  return row ? Number(row.run_id) : null;
}

/** Reads one investor's analysable dataset from the derived tables, in a fixed order. */
export function loadDataset(db: Database, investorId: string): Dataset {
  const runId = latestCompleteRun(db, investorId);
  const investorRow = db.prepare("SELECT * FROM investors WHERE uuid = ?").get(investorId);
  if (runId === null || !investorRow) {
    throw new NoStoredDataError(`No complete ingestion is stored for investor ${investorId}.`);
  }

  const run = db.prepare("SELECT * FROM ingestion_runs WHERE id = ?").get(runId)!;
  const responses = db
    .prepare(
      `SELECT count(*) AS n, min(retrieved_at) AS first, max(retrieved_at) AS last FROM raw_responses WHERE run_id = ?`,
    )
    .get(runId)!;
  const firstTransactions = db
    .prepare("SELECT body_json FROM raw_responses WHERE run_id = ? AND kind = 'transactions' ORDER BY page_index LIMIT 1")
    .get(runId);
  const transactionsTotal = firstTransactions
    ? (JSON.parse(String(firstTransactions.body_json)) as { page?: { total?: number | null } }).page?.total ?? null
    : null;

  const portfolio: PortfolioEntry[] = db
    .prepare(
      `SELECT p.company_id, c.name, p.company_subtype, p.rounds_count, p.is_lead_any, p.last_round_date
       FROM portfolio_relationships p JOIN companies c ON c.uuid = p.company_id
       WHERE p.investor_id = ? ORDER BY p.company_id`,
    )
    .all(investorId)
    .map((row) => ({
      companyId: String(row.company_id),
      companyName: String(row.name),
      companySubtype: str(row.company_subtype),
      roundsCount: Number(row.rounds_count),
      isLeadAny: Number(row.is_lead_any) === 1,
      lastRoundDate: str(row.last_round_date),
    }));

  const roundRows = db
    .prepare(
      `SELECT r.* FROM investor_round_scope s JOIN funding_rounds r ON r.id = s.round_id
       WHERE s.investor_id = ? ORDER BY r.id`,
    )
    .all(investorId);
  const participantRows = db
    .prepare(
      `SELECT rp.round_id, rp.entity_id, rp.is_lead, e.name, e.type, e.subtype
       FROM investor_round_scope s
       JOIN round_participants rp ON rp.round_id = s.round_id
       JOIN entities e ON e.uuid = rp.entity_id
       WHERE s.investor_id = ? ORDER BY rp.round_id, rp.position, rp.entity_id`,
    )
    .all(investorId);
  const participantsByRound = new Map<number, Participant[]>();
  for (const row of participantRows) {
    const list = participantsByRound.get(Number(row.round_id)) ?? [];
    list.push({
      id: String(row.entity_id),
      name: String(row.name),
      type: String(row.type),
      subtype: str(row.subtype),
      isLead: flag(row.is_lead),
    });
    participantsByRound.set(Number(row.round_id), list);
  }
  const rounds: Round[] = roundRows.map((row) => ({
    id: Number(row.id),
    companyId: String(row.company_id),
    announcedDate: str(row.announced_date),
    roundLabel: str(row.round_label),
    standardizedRound: str(row.standardized_round),
    roundType: str(row.round_type),
    amount: row.amount == null ? null : Number(row.amount),
    currency: str(row.currency),
    isVcRound: flag(row.is_vc_round),
    investorsDisclosed: Number(row.investors_disclosed) === 1,
    participants: participantsByRound.get(Number(row.id)) ?? [],
  }));

  const companyIds = [...new Set([...portfolio.map((p) => p.companyId), ...rounds.map((r) => r.companyId)])].sort(compareStrings);
  const companies: Record<string, Company> = {};
  const companyStatement = db.prepare("SELECT * FROM companies WHERE uuid = ?");
  const taxonomyStatement = db.prepare(
    `SELECT t.id, t.name, t.type FROM company_taxonomy ct JOIN taxonomy_terms t ON t.id = ct.term_id
     WHERE ct.company_id = ? ORDER BY t.type, t.id`,
  );
  for (const id of companyIds) {
    const row = companyStatement.get(id);
    if (!row) continue;
    companies[id] = {
      id,
      name: String(row.name),
      launchDate: str(row.launch_date),
      taxonomyKnown: Number(row.taxonomy_known) === 1,
      taxonomy: taxonomyStatement.all(id).map((term) => ({ id: Number(term.id), name: String(term.name), type: String(term.type) })),
    };
  }

  return {
    investor: {
      id: investorId,
      name: String(investorRow.name),
      type: String(investorRow.type),
      subtype: str(investorRow.subtype),
      firmTypes: JSON.parse(String(investorRow.firm_types_json)) as string[],
      launchDate: str(investorRow.launch_date),
      hqCountry: str(investorRow.hq_country),
      dealroomUrl: str(investorRow.dealroom_url),
      reportedPortfolioTotal: investorRow.reported_portfolio_total == null ? null : Number(investorRow.reported_portfolio_total),
      reportedRoundsCount: investorRow.reported_rounds_count == null ? null : Number(investorRow.reported_rounds_count),
    },
    portfolio,
    companies,
    rounds,
    provenance: {
      runId,
      startedAt: String(run.started_at),
      finishedAt: String(run.finished_at),
      apiBaseUrl: String(run.api_base_url),
      apiVersion: String(run.api_version),
      roundsStrategy: String(run.rounds_strategy),
      extractionVersion: String(db.prepare("SELECT extraction_version FROM extraction_state WHERE investor_id = ?").get(investorId)!.extraction_version),
      responsesStored: Number(responses.n),
      firstRetrievedAt: String(responses.first),
      lastRetrievedAt: String(responses.last),
      requests: run.requests == null ? null : Number(run.requests),
      creditsUsed: run.credits_used == null ? null : Number(run.credits_used),
      transactionsReportedTotal: transactionsTotal,
    },
  };
}

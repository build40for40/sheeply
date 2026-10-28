import type { z } from "zod";
import type { Database } from "../db/database.ts";
import { resetDerivedTables, transaction } from "../db/database.ts";
import type { CompanyRound, EntityRef, OrganizationSummary } from "../dealroom/schemas.ts";
import { companyRoundsResponse, investorDetailResponse, portfolioResponse, transactionsResponse } from "../dealroom/schemas.ts";
import { nameKey } from "../util.ts";
import { EXTRACTION_VERSION } from "../version.ts";
import type { RawKind } from "./fetch.ts";

interface RawRow {
  id: number;
  kind: RawKind;
  subject_id: string;
  retrieved_at: string;
  body_json: string;
}

const bool = (value: boolean | null | undefined): number | null => (value == null ? null : value ? 1 : 0);

function parse<S extends z.ZodType>(schema: S, row: RawRow): z.infer<S> {
  const parsed = schema.safeParse(JSON.parse(row.body_json));
  if (!parsed.success) throw new Error(`Stored response ${row.id} (${row.kind}) no longer matches its schema: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Derives the normalised tables from one complete run's raw responses. Global records (companies,
 * rounds, entities) are upserted, so each holds the newest version observed; the investor's own
 * portfolio and round scope are replaced wholesale, so records Dealroom dropped disappear too.
 */
export function extractRun(db: Database, runId: number): void {
  const run = db.prepare("SELECT investor_id, status FROM ingestion_runs WHERE id = ?").get(runId);
  if (!run || run.status !== "complete") throw new Error(`Run ${runId} is not a complete ingestion run`);
  const investorId = String(run.investor_id);
  const rows = db
    .prepare(
      "SELECT id, kind, subject_id, retrieved_at, body_json FROM raw_responses WHERE run_id = ? ORDER BY kind, subject_id, page_index, id",
    )
    .all(runId) as unknown as RawRow[];

  const upsertEntity = db.prepare(
    `INSERT INTO entities (uuid, name, type, subtype, dealroom_url, source_response_id) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (uuid) DO UPDATE SET name = excluded.name, type = excluded.type, subtype = excluded.subtype,
       dealroom_url = excluded.dealroom_url, source_response_id = excluded.source_response_id`,
  );
  const upsertCompany = db.prepare(
    `INSERT INTO companies (uuid, name, subtype, launch_date, dealroom_url, taxonomy_known, source_response_id, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (uuid) DO UPDATE SET name = excluded.name, subtype = excluded.subtype, launch_date = excluded.launch_date,
       dealroom_url = excluded.dealroom_url, taxonomy_known = excluded.taxonomy_known,
       source_response_id = excluded.source_response_id, retrieved_at = excluded.retrieved_at`,
  );
  const insertCompanyIfMissing = db.prepare(
    `INSERT OR IGNORE INTO companies (uuid, name, subtype, launch_date, dealroom_url, taxonomy_known, source_response_id, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const clearTaxonomy = db.prepare("DELETE FROM company_taxonomy WHERE company_id = ?");
  const upsertTerm = db.prepare(
    "INSERT INTO taxonomy_terms (id, name, type) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, type = excluded.type",
  );
  const insertCompanyTerm = db.prepare(
    "INSERT OR IGNORE INTO company_taxonomy (company_id, term_id, source_response_id) VALUES (?, ?, ?)",
  );
  const upsertRound = db.prepare(
    `INSERT INTO funding_rounds (id, company_id, announced_date, round_type, standardized_round, round_label, amount, valuation,
       currency, is_vc_round, is_exit, investors_disclosed, source_url, source_response_id, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET company_id = excluded.company_id, announced_date = excluded.announced_date,
       round_type = excluded.round_type, standardized_round = excluded.standardized_round, round_label = excluded.round_label,
       amount = excluded.amount, valuation = excluded.valuation, currency = excluded.currency, is_vc_round = excluded.is_vc_round,
       is_exit = excluded.is_exit, investors_disclosed = excluded.investors_disclosed, source_url = excluded.source_url,
       source_response_id = excluded.source_response_id, retrieved_at = excluded.retrieved_at`,
  );
  const clearParticipants = db.prepare("DELETE FROM round_participants WHERE round_id = ?");
  // A participant listed twice on one round keeps the most informative lead flag: true over false over unknown.
  const insertParticipant = db.prepare(
    `INSERT INTO round_participants (round_id, entity_id, is_lead, position) VALUES (?, ?, ?, ?)
     ON CONFLICT (round_id, entity_id) DO UPDATE SET is_lead = CASE
       WHEN excluded.is_lead IS NULL THEN round_participants.is_lead
       WHEN round_participants.is_lead IS NULL THEN excluded.is_lead
       ELSE max(round_participants.is_lead, excluded.is_lead) END`,
  );
  const insertScope = db.prepare("INSERT OR IGNORE INTO investor_round_scope (investor_id, round_id) VALUES (?, ?)");

  const writeCompany = (company: OrganizationSummary, row: RawRow, overwrite: boolean) => {
    const args = [
      company.uuid,
      company.name,
      company.subtype ?? null,
      company.launch_date ?? null,
      company.dealroom_url ?? null,
      company.taxonomy === undefined ? 0 : 1,
      row.id,
      row.retrieved_at,
    ] as const;
    const changed = overwrite ? upsertCompany.run(...args).changes : insertCompanyIfMissing.run(...args).changes;
    if (!changed || company.taxonomy === undefined) return;
    clearTaxonomy.run(company.uuid);
    for (const term of company.taxonomy) {
      upsertTerm.run(term.id, term.name, term.type);
      insertCompanyTerm.run(company.uuid, term.id, row.id);
    }
  };

  const writeEntity = (ref: EntityRef, sourceId: number) =>
    upsertEntity.run(ref.uuid, ref.name, ref.type, ref.subtype ?? null, ref.dealroom_url ?? null, sourceId);

  const writeRound = (round: CompanyRound, companyId: string, currency: string | null, row: RawRow) => {
    upsertRound.run(
      round.id,
      companyId,
      round.announced_date,
      round.round_type,
      round.standardized_round,
      round.round_label ?? null,
      round.amount,
      round.valuation ?? null,
      currency,
      bool(round.is_vc_round),
      bool(round.is_exit),
      round.investors === null ? 0 : 1,
      round.source_url ?? null,
      row.id,
      row.retrieved_at,
    );
    clearParticipants.run(round.id);
    (round.investors ?? []).forEach((participant, position) => {
      writeEntity(participant.investor, row.id);
      insertParticipant.run(round.id, participant.investor.uuid, bool(participant.is_lead), position);
    });
    insertScope.run(investorId, round.id);
  };

  transaction(db, () => {
    db.prepare("DELETE FROM portfolio_relationships WHERE investor_id = ?").run(investorId);
    db.prepare("DELETE FROM investor_round_scope WHERE investor_id = ?").run(investorId);
    const insertPortfolio = db.prepare(
      `INSERT OR REPLACE INTO portfolio_relationships
         (investor_id, company_id, company_subtype, is_lead_any, rounds_count, last_round_date, source_response_id, retrieved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const row of rows.filter((r) => r.kind === "investor")) {
      const investor = parse(investorDetailResponse, row).data;
      db.prepare(
        `INSERT INTO investors (uuid, name, name_key, type, subtype, firm_types_json, launch_date, domain, hq_country, dealroom_url,
           reported_portfolio_total, reported_rounds_count, source_response_id, retrieved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (uuid) DO UPDATE SET name = excluded.name, name_key = excluded.name_key, type = excluded.type,
           subtype = excluded.subtype, firm_types_json = excluded.firm_types_json, launch_date = excluded.launch_date,
           domain = excluded.domain, hq_country = excluded.hq_country, dealroom_url = excluded.dealroom_url,
           reported_portfolio_total = excluded.reported_portfolio_total, reported_rounds_count = excluded.reported_rounds_count,
           source_response_id = excluded.source_response_id, retrieved_at = excluded.retrieved_at`,
      ).run(
        investor.uuid,
        investor.name,
        nameKey(investor.name),
        investor.type,
        investor.subtype ?? null,
        JSON.stringify((investor.types ?? []).map((t) => t.name).sort()),
        investor.launch_date ?? null,
        investor.domain ?? null,
        investor.locations?.find((l) => l.role === "hq")?.country?.name ?? null,
        investor.dealroom_url ?? null,
        investor.portfolio?.companies?.total ?? null,
        investor.portfolio?.rounds_count ?? null,
        row.id,
        row.retrieved_at,
      );
      writeEntity({ uuid: investor.uuid, name: investor.name, type: investor.type, subtype: investor.subtype }, row.id);
    }

    for (const row of rows.filter((r) => r.kind === "portfolio")) {
      for (const item of parse(portfolioResponse, row).data) {
        writeCompany(item.company, row, true);
        insertPortfolio.run(
          investorId,
          item.company.uuid,
          item.company.subtype ?? null,
          item.is_lead ? 1 : 0,
          item.rounds_count,
          item.last_round_date,
          row.id,
          row.retrieved_at,
        );
      }
    }

    for (const row of rows.filter((r) => r.kind === "transactions")) {
      const body = parse(transactionsResponse, row);
      for (const round of body.data) {
        if (round.deleted_at) continue;
        writeCompany(round.company, row, false);
        writeRound(round, round.company.uuid, body.currency ?? null, row);
      }
    }

    for (const row of rows.filter((r) => r.kind === "company_rounds")) {
      const body = parse(companyRoundsResponse, row);
      for (const round of body.data) writeRound(round, row.subject_id, body.currency ?? null, row);
    }

    db.prepare(
      `INSERT INTO extraction_state (investor_id, run_id, extraction_version) VALUES (?, ?, ?)
       ON CONFLICT (investor_id) DO UPDATE SET run_id = excluded.run_id, extraction_version = excluded.extraction_version`,
    ).run(investorId, runId, EXTRACTION_VERSION);
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('extraction_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ).run(EXTRACTION_VERSION);
  });
}

/** Drops every derived table and replays the latest complete run of each investor, oldest first. */
export function rebuildDerivedTables(db: Database): number[] {
  resetDerivedTables(db);
  const runs = db
    .prepare(
      `SELECT max(id) AS id FROM ingestion_runs WHERE status = 'complete' GROUP BY investor_id ORDER BY max(id)`,
    )
    .all()
    .map((row) => Number(row.id));
  for (const runId of runs) extractRun(db, runId);
  return runs;
}

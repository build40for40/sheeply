import type { Analysis } from "../analysis/analyse.ts";
import { THRESHOLDS } from "../analysis/interpretation.ts";
import type { CompanyInvestment } from "../analysis/investments.ts";
import { leadStatus } from "../analysis/leadership.ts";
import { stageBucket } from "../analysis/stages.ts";
import type { Dataset, Round } from "../analysis/types.ts";
import { canonicalJson, sha256 } from "../util.ts";
import { ALGORITHM_VERSION, EXTRACTION_VERSION, REPORT_SCHEMA_VERSION, TOOL_NAME, TOOL_VERSION } from "../version.ts";

/** Hash of exactly the records the analysis read, so two reports can be checked for the same input. */
export function datasetFingerprint(dataset: Dataset): string {
  const { provenance: _provenance, ...records } = dataset;
  return `sha256:${sha256(canonicalJson(records))}`;
}

function roundView(round: Round, investorId: string) {
  return {
    round_id: round.id,
    announced_date: round.announcedDate,
    round_label: round.roundLabel,
    stage_bucket: stageBucket(round.roundLabel),
    standardized_round: round.standardizedRound,
    round_type: round.roundType,
    amount: round.amount,
    currency: round.currency,
    lead_status: leadStatus(round, investorId),
    leads: round.participants.filter((p) => p.isLead === true && p.id !== investorId).map((p) => ({ id: p.id, name: p.name })),
    participants: round.investorsDisclosed ? round.participants.length : null,
  };
}

function contribution(company: CompanyInvestment, investorId: string) {
  return {
    company_id: company.companyId,
    company_name: company.companyName,
    status: company.status,
    rounds_count_reported: company.roundsCountReported,
    company_rounds_observed: company.companyRoundsObserved,
    initial_round: company.initial ? roundView(company.initial, investorId) : null,
    follow_on_rounds: company.followOns.map((round) => roundView(round, investorId)),
    flags: company.flags,
  };
}

export function buildReport(dataset: Dataset, analysis: Analysis, options: { verbose: boolean }) {
  const { investor, provenance } = dataset;
  const report = {
    report_schema_version: REPORT_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION, algorithm_version: ALGORITHM_VERSION, extraction_version: EXTRACTION_VERSION },
    source: {
      provider: "Dealroom",
      api_base_url: provenance.apiBaseUrl,
      api_version: provenance.apiVersion,
      ingestion_run_id: provenance.runId,
      retrieval_started_at: provenance.startedAt,
      retrieval_finished_at: provenance.finishedAt,
      rounds_strategy: provenance.roundsStrategy,
      responses_stored: provenance.responsesStored,
      requests: provenance.requests,
      credits_used: provenance.creditsUsed,
      dataset_fingerprint: datasetFingerprint(dataset),
    },
    investor: {
      id: investor.id,
      name: investor.name,
      entity_type: investor.type,
      entity_subtype: investor.subtype,
      firm_types: investor.firmTypes,
      launch_date: investor.launchDate,
      hq_country: investor.hqCountry,
      dealroom_url: investor.dealroomUrl,
      analysis_level: investor.type === "person" ? "person" : "firm",
    },
    coverage: {
      portfolio_companies_returned: analysis.dataQuality.portfolio.rows_returned,
      portfolio_companies_reported: analysis.dataQuality.portfolio.reported_by_dealroom,
      first_investments_identified: analysis.dataQuality.initial_investments.identified,
      first_investments_with_known_stage: analysis.entryMaturity.known_stage,
      first_investments_with_known_lead_status: analysis.leadership.initial_rounds.known,
      funding_rounds_analysed: dataset.rounds.length,
    },
    entry_maturity: analysis.entryMaturity,
    leadership: analysis.leadership,
    syndicates: analysis.syndicates,
    sectors: analysis.sectors,
    data_quality: analysis.dataQuality,
    interpretation: { thresholds: THRESHOLDS, statements: analysis.interpretation },
    ...(options.verbose
      ? { contributions: analysis.history.companies.map((company) => contribution(company, investor.id)) }
      : {}),
  };
  return report;
}

export type Report = ReturnType<typeof buildReport>;

export const renderJson = (report: Report): string => `${JSON.stringify(report, null, 2)}\n`;
